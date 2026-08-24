import { prisma } from "@rockfoundry/db";
import {
  detectContradictions,
  generateGenericDecisionCandidates,
  genericQuestionForTopic,
  mergeExtraction,
  QuestionEngine,
  type ProjectState,
  type Question,
} from "@rockfoundry/core";
import { getAiGateway } from "./ai-provider";
import {
  getLocalProject,
  parseProjectState,
  saveProjectState,
} from "./local-project";

/** Fast Discovery V1: one extraction call, then deterministic canonical question. */
export const INITIAL_DISCOVERY_PATH = "fast_initial_v1" as const;

export function questionMetadata(question: Question) {
  return {
    source: "AGENT",
    questionId: question.id,
    topic: question.topic,
    category: question.category,
    options: question.options || [],
    recommendation: question.recommendation,
    recommendedOptionId: question.recommendedOptionId,
    recommendationReason: question.recommendationReason,
    detail: question.reasonAsked,
  };
}

export async function persistUserMessage(
  projectId: string,
  content: string,
  metadata: Record<string, unknown> = {},
) {
  await prisma.conversationMessage.create({
    data: {
      projectId,
      role: "user",
      content,
      metadata: JSON.stringify({ source: "USER", ...metadata }),
    },
  });
}

export async function persistQuestionMessage(
  projectId: string,
  question: Question,
) {
  const existing = await prisma.conversationMessage.findFirst({
    where: {
      projectId,
      role: "assistant",
      content: question.text,
    },
  });
  if (existing) return existing;
  return prisma.conversationMessage.create({
    data: {
      projectId,
      role: "assistant",
      content: question.text,
      metadata: JSON.stringify(questionMetadata(question)),
    },
  });
}

export function nextQuestion(state: ProjectState) {
  return new QuestionEngine().generateQuestions(state, [], 1)[0] || null;
}

function mergeDetectedContradictions(state: ProjectState) {
  const detected = detectContradictions(state);
  const byId = new Map(
    [...state.contradictions, ...detected].map((item) => [item.id, item]),
  );
  state.contradictions = [...byId.values()];
}

export async function runInitialDiscovery(
  projectId: string,
  rawIdea: string,
  expectedVersion: number,
) {
  const run = await prisma.agentRun.create({
    data: {
      projectId,
      goal: "Understand the product idea and identify the next important decision",
      status: "RUNNING",
      actionType: "ASK_USER",
      startedAt: new Date(),
    },
  });

  try {
    // Fast Discovery V1 critical path:
    // ONE provider call (initial_idea_extraction @ medium) → deterministic question.
    // Model discovery planner intentionally not used here; it remains for
    // research/reference/conversation agentic turns.
    const aiResult = await getAiGateway().runInitialExtraction(rawIdea);
    const project = await getLocalProject(projectId);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    const current = parseProjectState(project);
    const merged = mergeExtraction(
      { ...current, rawIdea: rawIdea.trim() },
      aiResult.extraction,
    );
    merged.state.generationMetadata.initialExtractionComplete = true;
    merged.state.generationMetadata.initialDiscoveryPath =
      INITIAL_DISCOVERY_PATH;
    merged.state.generationMetadata.initialDiscoveryProviderCalls = 1;
    mergeDetectedContradictions(merged.state);
    const candidates = generateGenericDecisionCandidates(merged.state).slice(
      0,
      5,
    );
    const genericCandidateQuestions = candidates
      .map((candidate) =>
        genericQuestionForTopic(merged.state, candidate.topic),
      )
      .filter((question): question is Question => Boolean(question));
    // Product intelligence owns the active question identity.
    const candidateQuestion =
      nextQuestion(merged.state) || genericCandidateQuestions[0];
    if (!candidateQuestion) throw new Error("NO_DISCOVERY_QUESTION");
    const question: Question = candidateQuestion;
    merged.state.discovery.activeQuestionId = question.id;
    const saved = await saveProjectState(
      projectId,
      merged.state,
      expectedVersion,
      rawIdea.trim(),
    );

    const existingIdea = await prisma.conversationMessage.findFirst({
      where: { projectId, role: "user", content: rawIdea.trim() },
    });
    if (!existingIdea) await persistUserMessage(projectId, rawIdea.trim());
    if (question) await persistQuestionMessage(projectId, question);

    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    return {
      ...saved,
      question,
      extraction: aiResult.extraction,
      runId: run.id,
      discoveryPath: INITIAL_DISCOVERY_PATH,
      providerCalls: 1 as const,
      merge: {
        appliedChanges: merged.appliedChanges,
        skippedChanges: merged.skippedChanges,
        assumptionsCreated: merged.assumptionsCreated,
        questionsCreated: merged.questionsCreated,
        conflictsDetected: merged.conflictsDetected,
      },
    };
  } catch (error) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        failureReason:
          error instanceof Error
            ? error.message
            : "The configured AI provider could not complete this discovery step.",
      },
    });
    throw error;
  }
}
