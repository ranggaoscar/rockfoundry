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

const SearchInput = z.object({ query: z.string().trim().min(3).max(300) });

/** Compatibility adapter: all web search execution lives in AgentRunner + ToolRegistry. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await getLocalProject(id);
    if (!project) return jsonError("Project not found", 404);
    const { query } = SearchInput.parse(await request.json());
    const state = parseProjectState(project);
    const turn = await runConversationTurn({
      projectId: id,
      text: query,
      intent: "RESEARCH_REQUEST",
      state,
    });
    const question =
      turn.result.finalAction.type === "ASK_USER"
        ? (turn.questionForAction as
            import("@rockfoundry/core").Question | null)
        : null;
    state.discovery.activeQuestionId = question?.id;
    const saved = await saveProjectState(id, state, project.version);
    if (question) await persistQuestionMessage(id, question);
    return Response.json({
      query,
      state: saved.state,
      version: saved.version,
      question,
      activities: turn.result.activities.map((activity) => ({
        toolName:
          activity.action.type === "CALL_TOOL"
            ? activity.action.toolName
            : undefined,
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return jsonError("Enter a short research query.", 400);
    return jsonError(
      "RockFoundry couldn't complete that web research request.",
      502,
    );
  }
}
