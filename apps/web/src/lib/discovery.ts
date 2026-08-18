import { prisma } from "@rockfoundry/db";
import {
  detectContradictions,
  mergeExtraction,
  QuestionEngine,
  type ProjectState,
  type Question,
} from "@rockfoundry/core";
import { aiGateway } from "./ai-provider";
import {
  getLocalProject,
  parseProjectState,
  saveProjectState,
} from "./local-project";

export function questionMetadata(question: Question) {
  return {
    source: "AGENT",
    questionId: question.id,
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
    const aiResult = await aiGateway.runInitialExtraction(rawIdea);
    const project = await getLocalProject(projectId);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    const current = parseProjectState(project);
    const merged = mergeExtraction(
      { ...current, rawIdea: rawIdea.trim() },
      aiResult.extraction,
    );
    merged.state.generationMetadata.initialExtractionComplete = true;
    mergeDetectedContradictions(merged.state);
    const question = nextQuestion(merged.state);
    merged.state.discovery.activeQuestionId = question?.id;
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
