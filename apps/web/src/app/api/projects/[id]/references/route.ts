export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getLocalProject,
  jsonError,
  parseProjectState,
  saveProjectState,
} from "@/lib/local-project";
import { persistQuestionMessage } from "@/lib/discovery";
import { runConversationTurn } from "@/lib/conversation";
import { prisma } from "@rockfoundry/db";

const ReferenceInput = z.object({ url: z.string().url() });

function publicReference(
  reference: { metadata: string | null } & Record<string, unknown>,
) {
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

/** Compatibility adapter: reference inspection executes only through AgentRunner + ToolRegistry. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await getLocalProject(id);
    if (!project) return jsonError("Project not found", 404);
    const { url } = ReferenceInput.parse(await req.json());
    const state = parseProjectState(project);
    const turn = await runConversationTurn({
      projectId: id,
      text: url,
      intent: "REFERENCE_URL",
      state,
    });
    const question =
      turn.result.finalAction.type === "ASK_USER"
        ? (turn.questionForAction as
            import("@rockfoundry/core").Question | null)
        : null;
    state.discovery.activeQuestionId = question?.id;
    await saveProjectState(id, state, project.version);
    if (question) await persistQuestionMessage(id, question);
    const reference = await prisma.reference.findFirst({
      where: { projectId: id, url },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({
      reference: reference ? publicReference(reference) : null,
      question,
      activities: turn.result.activities,
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return jsonError("Paste a valid public http(s) URL.", 400);
    return jsonError("RockFoundry couldn't inspect that reference.", 422);
  }
}
