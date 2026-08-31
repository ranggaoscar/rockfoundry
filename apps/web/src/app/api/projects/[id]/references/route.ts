export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { safeExtractFromUrl } from "@rockfoundry/core";
import { z } from "zod";
import { prisma } from "@rockfoundry/db";
import {
  getLocalProject,
  jsonError,
  parseProjectState,
  saveProjectState,
} from "@/lib/local-project";
import { persistConversationMessage, persistUserMessage } from "@/lib/conversation";
import { runConversationAgent } from "@/lib/conversation-agent";
import { getPackageEligibility } from "@/lib/package-readiness";
import { evaluateReadinessDirectly } from "@rockfoundry/core";

const ReferenceInput = z.object({ url: z.string().url() });

function publicReference(reference: { metadata: string | null } & Record<string, unknown>) {
  return {
    ...reference,
    metadata: reference.metadata ? JSON.parse(reference.metadata) : undefined,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await getLocalProject(id))) return jsonError("Project not found", 404);
  const references = await prisma.reference.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
  });
  return Response.json({
    references: references.map((reference) => publicReference(reference)),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await getLocalProject(id);
    if (!project) return jsonError("Project not found", 404);
    const { url } = ReferenceInput.parse(await req.json());
    const type = /github\.com\//i.test(url) ? "GITHUB_REPO" : "URL";
    const extracted = await safeExtractFromUrl(url);
    const reference = await prisma.reference.create({
      data: {
        projectId: id,
        type,
        url,
        status: extracted.success ? "ANALYZED" : "FAILED",
        untrusted: true,
        metadata: JSON.stringify({
          provenance: type === "GITHUB_REPO" ? "REFERENCE_GITHUB" : "REFERENCE_WEBSITE",
          title: extracted.success ? extracted.title : undefined,
          summary: extracted.success ? extracted.text?.slice(0, 1200) : extracted.error,
          untrusted: true,
        }),
      },
    });
    const state = parseProjectState(project);
    await persistUserMessage(id, url, { intent: "REFERENCE" });
    const turn = await runConversationAgent({
      projectId: id,
      text: `I added this public reference: ${url}`,
      mode: "REFERENCE",
      state,
    });
    turn.state.references.push({
      id: reference.id,
      type,
      url,
      status: reference.status as "PENDING" | "ANALYZED" | "FAILED",
      source: type === "GITHUB_REPO" ? "REFERENCE_GITHUB" : "REFERENCE_WEBSITE",
      untrusted: true,
      metadata: JSON.parse(reference.metadata || "{}"),
    });
    const saved = await saveProjectState(id, turn.state, project.version);
    const readiness = evaluateReadinessDirectly(saved.state);
    await persistConversationMessage(id, "assistant", turn.response.message, {
      mode: turn.response.mode,
      quickReplies: turn.response.quickReplies,
    });
    return Response.json({
      reference: publicReference(reference),
      message: turn.response.message,
      response: turn.response,
      state: saved.state,
      version: saved.version,
      question: null,
      activities: [],
      ...getPackageEligibility(readiness),
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return jsonError("Paste a valid public http(s) URL.", 400);
    return jsonError("RockFoundry couldn't inspect that reference.", 422);
  }
}
