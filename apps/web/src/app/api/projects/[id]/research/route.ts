export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { evaluateReadinessDirectly } from "@rockfoundry/core";
import { z } from "zod";
import {
  getLocalProject,
  jsonError,
  parseProjectState,
  saveProjectState,
} from "@/lib/local-project";
import { persistConversationMessage, persistUserMessage } from "@/lib/conversation";
import { runConversationAgent } from "@/lib/conversation-agent";
import { getPackageEligibility } from "@/lib/package-readiness";

const SearchInput = z.object({ query: z.string().trim().min(3).max(300) });

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
    await persistUserMessage(id, query, { intent: "RESEARCH_REQUEST" });
    const turn = await runConversationAgent({
      projectId: id,
      text: query,
      mode: "RESEARCH_REQUEST",
      state,
    });
    const saved = await saveProjectState(id, turn.state, project.version);
    const readiness = evaluateReadinessDirectly(saved.state);
    await persistConversationMessage(id, "assistant", turn.response.message, {
      mode: turn.response.mode,
      quickReplies: turn.response.quickReplies,
      suggestedNextAction: turn.response.suggestedNextAction,
    });
    return Response.json({
      query,
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
      return jsonError("Enter a short research query.", 400);
    return jsonError(
      "RockFoundry couldn't complete that web research request.",
      502,
    );
  }
}
