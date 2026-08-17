export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import {
  analyzeGitHubRepo,
  parseGitHubUrl,
  safeExtractFromUrl,
  type Reference as CoreReference,
} from "@rockfoundry/core";
import { prisma } from "@rockfoundry/db";
import {
  getLocalProject,
  jsonError,
  parseProjectState,
  saveProjectState,
} from "@/lib/local-project";
import { z } from "zod";

const ReferenceInput = z.object({
  url: z.string().url(),
  type: z.enum(["URL", "GITHUB_REPO"]).default("URL"),
});

function publicReference(reference: {
  id: string;
  projectId: string;
  type: string;
  url: string;
  status: string;
  metadata: string | null;
  untrusted: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...reference,
    metadata: reference.metadata ? JSON.parse(reference.metadata) : undefined,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!(await getLocalProject(id)))
      return jsonError("Project not found", 404);
    const references = await prisma.reference.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ references: references.map(publicReference) });
  } catch {
    return jsonError("RockFoundry couldn't load references.");
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getLocalProject(id);
  if (!project) return jsonError("Project not found", 404);
  let input: z.infer<typeof ReferenceInput>;
  try {
    input = ReferenceInput.parse(await req.json());
  } catch {
    return jsonError("Paste a valid public http(s) URL.", 400);
  }
  const parsedUrl = new URL(input.url);
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")
    return jsonError("Only public HTTP/HTTPS references are supported.", 400);
  const repoInfo =
    input.type === "GITHUB_REPO" ? parseGitHubUrl(input.url) : null;
  if (
    input.type === "GITHUB_REPO" &&
    (parsedUrl.hostname !== "github.com" || !repoInfo)
  )
    return jsonError("Use a public GitHub repository URL.", 400);

  const reference = await prisma.reference.create({
    data: {
      projectId: id,
      url: input.url,
      type: input.type,
      status: "PENDING",
      untrusted: true,
    },
  });
  const toolRun = await prisma.toolRun.create({
    data: {
      projectId: id,
      toolName:
        input.type === "GITHUB_REPO"
          ? "github_reference_inspect"
          : "web_reference_inspect",
      status: "RUNNING",
      inputSummary: input.url,
      startedAt: new Date(),
    },
  });
  try {
    let metadata: Record<string, unknown>;
    if (input.type === "GITHUB_REPO") {
      const analysis = await analyzeGitHubRepo(repoInfo!);
      if (!analysis.success || !analysis.data)
        throw new Error("reference inspection failed");
      metadata = analysis.data as unknown as Record<string, unknown>;
    } else {
      const analysis = await safeExtractFromUrl(input.url);
      if (!analysis.success) throw new Error("reference inspection failed");
      metadata = {
        title: analysis.title,
        headers: analysis.headers?.slice(0, 20),
        textPreview: analysis.text?.slice(0, 5000),
        summary: analysis.title || analysis.text?.slice(0, 240),
      };
    }
    const updated = await prisma.reference.update({
      where: { id: reference.id },
      data: { status: "ANALYZED", metadata: JSON.stringify(metadata) },
    });
    await prisma.toolRun.update({
      where: { id: toolRun.id },
      data: {
        status: "COMPLETED",
        outputSummary: "Reference analyzed as untrusted evidence.",
        completedAt: new Date(),
      },
    });
    const state = parseProjectState(project);
    const stateReference: CoreReference = {
      id: updated.id,
      type: updated.type as "URL" | "GITHUB_REPO",
      url: updated.url,
      status: "ANALYZED",
      metadata,
      source:
        input.type === "GITHUB_REPO" ? "REFERENCE_GITHUB" : "REFERENCE_WEBSITE",
      untrusted: true,
    };
    if (!state.references.some((item) => item.url === stateReference.url))
      state.references.push(stateReference);
    await saveProjectState(id, state, project.version);
    return Response.json(
      { reference: publicReference(updated) },
      { status: 201 },
    );
  } catch {
    await prisma.reference.update({
      where: { id: reference.id },
      data: {
        status: "FAILED",
        metadata: JSON.stringify({ error: "Reference could not be inspected" }),
      },
    });
    await prisma.toolRun.update({
      where: { id: toolRun.id },
      data: {
        status: "FAILED",
        failureReason: "Reference inspection failed",
        completedAt: new Date(),
      },
    });
    return jsonError(
      "I couldn't inspect that reference, but we can continue without it.",
      422,
    );
  }
}
