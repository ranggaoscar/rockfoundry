import { prisma } from "@rockfoundry/db";
import {
  AgentRunner,
  deterministicDiscoveryPlanner,
  generateGenericDecisionCandidates,
  genericQuestionForTopic,
  detectContradictions,
  mergeExtraction,
  QuestionEngine,
  type ProjectState,
  type Question,
} from "@rockfoundry/core";
import { getAiGateway } from "./ai-provider";
import { createModelDiscoveryPlanner } from "./agent-planner";
import { createServerToolRegistry } from "./server-tools";
import {
  getLocalProject,
  parseProjectState,
  saveProjectState,
} from "./local-project";

export function questionMetadata(question: Question) {
  return {
    source: "AGENT",
    questionId: question.id,
    topic: question.topic,
    category: question.category,
    options: question.options || [],
    recommendation: question.recommendation,
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
    const aiResult = await getAiGateway().runInitialExtraction(rawIdea);
    const project = await getLocalProject(projectId);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    const current = parseProjectState(project);
    const merged = mergeExtraction(
      { ...current, rawIdea: rawIdea.trim() },
      aiResult.extraction,
    );
    merged.state.generationMetadata.initialExtractionComplete = true;
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
    // Product intelligence owns the active question identity. A model can
    // reason about wording/context, but cannot replace this canonical queue.
    const candidateQuestion =
      nextQuestion(merged.state) || genericCandidateQuestions[0];
    if (!candidateQuestion) throw new Error("NO_DISCOVERY_QUESTION");
    const candidateQuestions = [
      candidateQuestion,
      ...genericCandidateQuestions,
    ].filter(
      (question, index, all) =>
        all.findIndex((candidate) => candidate.id === question.id) === index,
    );
    const tools = createServerToolRegistry();
    const planner =
      createModelDiscoveryPlanner(
        candidates,
        candidateQuestion,
        "INITIAL_DISCOVERY",
      ) || deterministicDiscoveryPlanner(candidateQuestion);
    const runner = new AgentRunner(planner, tools);
    const toolRunByAction = new Map<string, string>();
    const agentResult = await runner.run({
      project: merged.state,
      candidateTopics: candidateQuestions
        .map((question) => question.topic)
        .filter((topic): topic is string => Boolean(topic)),
      questionForAction: (action) => {
        if (action.type !== "ASK_USER") return undefined;
        return action.questionId === candidateQuestion.id
          ? candidateQuestion
          : undefined;
      },
      onToolStart: async (action) => {
        if (action.type !== "CALL_TOOL") return;
        const row = await prisma.toolRun.create({
          data: {
            projectId,
            toolName: action.toolName,
            status: "RUNNING",
            inputSummary: action.rationale || action.toolName,
            startedAt: new Date(),
          },
        });
        toolRunByAction.set(action.id, row.id);
      },
      onToolRun: async (activity) => {
        const rowId = toolRunByAction.get(activity.action.id);
        if (!rowId) return;
        await prisma.toolRun.update({
          where: { id: rowId },
          data: {
            status: "COMPLETED",
            outputSummary: activity.observation?.summary || "Tool completed.",
            completedAt: new Date(),
          },
        });
      },
      onToolFailure: async (action, error) => {
        const rowId = toolRunByAction.get(action.id);
        if (!rowId) return;
        await prisma.toolRun.update({
          where: { id: rowId },
          data: {
            status: "FAILED",
            failureReason: error.message.slice(0, 500),
            completedAt: new Date(),
          },
        });
      },
    });
    if (agentResult.finalAction.type !== "ASK_USER")
      throw new Error("AGENT_DID_NOT_SELECT_QUESTION");
    // Keep the exact canonical question (including its ID) in the persisted
    // state and returned response. Mixing a model action ID with a different
    // question object creates stale-question 409s on the first answer.
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
