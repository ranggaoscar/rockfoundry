export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { evaluateReadinessDirectly, markDesignStale } from "@rockfoundry/core";
import {
  getLocalProject,
  jsonError,
  parseProjectState,
  saveProjectState,
} from "@/lib/local-project";
import {
  classifyMessage,
  persistConversationMessage,
  persistUserMessage,
} from "@/lib/conversation";
import {
  modeFromMessage,
  runConversationAgent,
} from "@/lib/conversation-agent";
import { getPackageEligibility } from "@/lib/package-readiness";
import { z } from "zod";

const Input = z.object({
  text: z.string().trim().min(1).max(5000),
  explicitQuestionId: z.string().min(1).nullable().optional(),
  explicitOptionId: z.string().min(1).nullable().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await getLocalProject(id);
    if (!project) return jsonError("Project not found", 404);
    const body = Input.parse(await req.json());
    if (body.explicitQuestionId || body.explicitOptionId) {
      return jsonError(
        "Quick replies are optional. Send the answer as a normal conversation message.",
        409,
      );
    }

    const state = parseProjectState(project);
    const intent = classifyMessage(body.text);
    const mode = modeFromMessage(body.text);
    await persistUserMessage(id, body.text, { intent, mode });
    const turn = await runConversationAgent({
      projectId: id,
      text: body.text,
      mode,
      state,
    });
    const curatedState =
      turn.state.studio.currentVersion > 0 &&
      (turn.response.stateDelta.explicitFacts.length > 0 ||
        turn.response.stateDelta.confirmedDecisions.length > 0 ||
        turn.response.stateDelta.corrections.length > 0)
        ? markDesignStale(
            turn.state,
            turn.state.studio.screenMap.map((screen) => screen.id),
          )
        : turn.state;
    const saved = await saveProjectState(id, curatedState, project.version);
    const readiness = evaluateReadinessDirectly(saved.state);
    await persistConversationMessage(id, "assistant", turn.response.message, {
      mode: turn.response.mode,
      quickReplies: turn.response.quickReplies,
      suggestedNextAction: turn.response.suggestedNextAction,
      proposals: turn.response.proposals,
      assumptions: turn.response.assumptions,
      unresolvedRisks: turn.response.unresolvedRisks,
    });

    return Response.json({
      intent,
      mode: turn.response.mode,
      message: turn.response.message,
      response: turn.response,
      state: saved.state,
      version: saved.version,
      question: null,
      quickReplies: turn.response.quickReplies,
      suggestedNextAction: turn.response.suggestedNextAction,
      activities: [],
      ...getPackageEligibility(readiness),
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return jsonError("Enter a valid message.", 400);
    return jsonError(
      "RockFoundry couldn't process that conversation turn.",
      422,
    );
  }
}

export type ConversationResponseQuestion = null;
