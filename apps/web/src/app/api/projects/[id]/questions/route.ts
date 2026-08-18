export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import {
  detectContradictions,
  evaluateReadinessDirectly,
  QuestionEngine,
} from "@rockfoundry/core";
import { prisma } from "@rockfoundry/db";
import {
  getLocalProject,
  jsonError,
  parseProjectState,
  saveProjectState,
} from "@/lib/local-project";
import { persistQuestionMessage, persistUserMessage } from "@/lib/discovery";
import { z } from "zod";

const AnswerSchema = z
  .object({
    questionId: z.string().min(1),
    answer: z.union([z.string(), z.array(z.string())]).optional(),
    value: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .refine(
    (body) => body.answer !== undefined || body.value !== undefined,
    "answer or value is required",
  );

function mergeDetectedContradictions(
  state: ReturnType<typeof parseProjectState>,
) {
  const detected = detectContradictions(state);
  const byId = new Map(
    [...state.contradictions, ...detected].map((item) => [item.id, item]),
  );
  state.contradictions = [...byId.values()];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await getLocalProject(id);
    if (!project) return jsonError("Project not found", 404);
    const state = parseProjectState(project);
    const readiness = evaluateReadinessDirectly(state);
    const question =
      new QuestionEngine().generateQuestions(state, [], 1)[0] || null;
    return Response.json({
      questions: question ? [question] : [],
      readiness: {
        level: readiness.level,
        score: readiness.score,
        breakdown: readiness.breakdown,
      },
      discovery: {
        evaluated: readiness.discovery.evaluated,
        importantDecisionsRemaining:
          readiness.discovery.importantDecisionsRemaining,
        unresolvedTopics: readiness.discovery.unresolvedTopics,
      },
      blockers: readiness.blocking,
    });
  } catch {
    return jsonError("RockFoundry couldn't prepare the next question.");
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await getLocalProject(id);
    if (!project) return jsonError("Project not found", 404);
    const body = AnswerSchema.parse(await req.json());
    const answer = body.answer ?? body.value!;
    const current = parseProjectState(project);
    const engine = new QuestionEngine();
    const currentQuestion = engine
      .generateQuestions(current, [], 5)
      .find((item) => item.id === body.questionId);
    if (!currentQuestion)
      return jsonError("That discovery question is no longer active.", 409);

    const processed = engine.processAnswer(
      current,
      body.questionId,
      answer,
      currentQuestion,
    );
    mergeDetectedContradictions(processed.updatedState);
    const nextQuestion =
      engine.generateQuestions(processed.updatedState, [], 1)[0] || null;
    processed.updatedState.discovery.activeQuestionId = nextQuestion?.id;
    const saved = await saveProjectState(
      id,
      processed.updatedState,
      project.version,
    );

    const answerValues = Array.isArray(answer) ? answer : [answer];
    const displayAnswer = answerValues
      .map(
        (value) =>
          currentQuestion.options?.find((option) => option.id === value)
            ?.label || value,
      )
      .join(", ");
    await persistUserMessage(id, displayAnswer, {
      questionId: currentQuestion.id,
    });
    if (nextQuestion) {
      await persistQuestionMessage(id, nextQuestion);
    } else if (saved.state.discovery.importantDecisionsRemaining === 0) {
      await prisma.conversationMessage.create({
        data: {
          projectId: id,
          role: "assistant",
          content:
            "No critical blockers remain. The current decisions are enough to draft the build documents.",
          metadata: JSON.stringify({ source: "AGENT", kind: "READINESS" }),
        },
      });
    }

    return Response.json({
      state: saved.state,
      version: saved.version,
      decision: processed.decision,
      question: nextQuestion,
      readiness: {
        level: saved.state.readiness,
        score: saved.state.readinessScore,
        breakdown: saved.state.readinessBreakdown,
      },
      discovery: saved.state.discovery,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PROJECT_VERSION_CONFLICT")
      return jsonError(
        "Project changed while you were answering. Refresh and retry.",
        409,
      );
    return jsonError("RockFoundry couldn't record that decision.", 422);
  }
}
