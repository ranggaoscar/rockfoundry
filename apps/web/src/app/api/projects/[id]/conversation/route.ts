export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import {
  evaluateReadinessDirectly,
  QuestionEngine,
  type Question,
} from "@rockfoundry/core";
import {
  getLocalProject,
  jsonError,
  parseProjectState,
  saveProjectState,
} from "@/lib/local-project";
import {
  classifyMessage,
  mapNaturalAnswer,
  persistConversationMessage,
  runConversationTurn,
} from "@/lib/conversation";
import { persistQuestionMessage, persistUserMessage } from "@/lib/discovery";
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
    const state = parseProjectState(project);
    const engine = new QuestionEngine();
    const active = state.discovery.activeQuestionId
      ? engine.resolveQuestion(state, state.discovery.activeQuestionId)
      : null;
    const classified = classifyMessage(body.text);
    if (
      body.explicitQuestionId &&
      body.explicitQuestionId !== state.discovery.activeQuestionId
    ) {
      return jsonError("That discovery question is no longer active.", 409);
    }

    const mappedOption =
      body.explicitOptionId ||
      (classified === "NEW_PRODUCT_CONTEXT"
        ? mapNaturalAnswer(body.text, active)
        : null);
    const explicitActiveAnswer =
      active && body.explicitQuestionId === active.id
        ? body.explicitOptionId || mappedOption || body.text.trim()
        : null;

    // An explicitly targeted active question accepts a selected option, a
    // natural option mapping, or the raw free-form text without AI planning.
    if (active && (explicitActiveAnswer || mappedOption)) {
      return Response.json({
        intent: "ACTIVE_DECISION_ANSWER",
        answer: explicitActiveAnswer || mappedOption,
        questionId: active.id,
        handoff: "/api/projects/" + id + "/questions",
      });
    }

    const intent = classified;
    await persistUserMessage(id, body.text, { intent });
    if (intent === "NEW_PRODUCT_CONTEXT") {
      state.rawIdea =
        `${state.rawIdea}\n\nAdditional user context: ${body.text}`.trim();
      state.normalizedSummary =
        `${state.normalizedSummary || state.rawIdea}\n${body.text}`.trim();
    }
    const turn = await runConversationTurn({
      projectId: id,
      text: body.text,
      intent,
      state,
    });
    const question =
      turn.result.finalAction.type === "ASK_USER"
        ? (turn.questionForAction as Question | null)
        : null;
    state.discovery.activeQuestionId = (question as Question | null)?.id;
    const saved = await saveProjectState(id, state, project.version);
    const readiness = evaluateReadinessDirectly(saved.state);
    if (question) await persistQuestionMessage(id, question);
    if (intent === "HANDOFF_REQUEST")
      await persistConversationMessage(
        id,
        "assistant",
        question
          ? "Handoff still has high-risk gaps. Resolve this blocker before generating artifacts."
          : "Handoff requirements were checked.",
        { source: "AGENT", kind: "HANDOFF_CHECK" },
      );
    return Response.json({
      intent,
      state: saved.state,
      version: saved.version,
      question,
      activities: turn.result.activities.map((activity) => ({
        action: activity.action.type,
        toolName:
          activity.action.type === "CALL_TOOL"
            ? activity.action.toolName
            : undefined,
      })),
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

export type ConversationResponseQuestion = Question;
