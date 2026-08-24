import { prisma } from "@rockfoundry/db";
import {
  detectContradictions,
  type ProjectState,
  type Question,
} from "@rockfoundry/core";
import { runConversationAgent } from "./conversation-agent";
import { getLocalProject, parseProjectState, saveProjectState } from "./local-project";

export const INITIAL_DISCOVERY_PATH = "conversation_agent_v2" as const;

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

export async function persistAssistantConversationMessage(
  projectId: string,
  content: string,
  metadata: Record<string, unknown> = {},
) {
  return prisma.conversationMessage.create({
    data: {
      projectId,
      role: "assistant",
      content,
      metadata: JSON.stringify({ source: "AGENT", ...metadata }),
    },
  });
}

export async function persistQuestionMessage(
  projectId: string,
  question: Question,
) {
  const existing = await prisma.conversationMessage.findFirst({
    where: { projectId, role: "assistant", content: question.text },
  });
  if (existing) return existing;
  return prisma.conversationMessage.create({
    data: {
      projectId,
      role: "assistant",
      content: question.text,
      metadata: JSON.stringify({
        source: "LEGACY_QUESTION_COMPATIBILITY",
        questionId: question.id,
        topic: question.topic,
        category: question.category,
        options: question.options || [],
        recommendation: question.recommendation,
        recommendedOptionId: question.recommendedOptionId,
        recommendationReason: question.recommendationReason,
        detail: question.reasonAsked,
      }),
    },
  });
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
      goal: "Understand the product idea through natural conversation",
      status: "RUNNING",
      actionType: "BRAINSTORM",
      startedAt: new Date(),
    },
  });

  try {
    const project = await getLocalProject(projectId);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    const current = parseProjectState(project);
    current.rawIdea = rawIdea.trim();
    const turn = await runConversationAgent({
      projectId,
      text: rawIdea.trim(),
      mode: "BRAINSTORM",
      state: current,
    });
    mergeDetectedContradictions(turn.state);
    turn.state.discovery.activeQuestionId = undefined;
    const saved = await saveProjectState(
      projectId,
      turn.state,
      expectedVersion,
      rawIdea.trim(),
    );
    await persistAssistantConversationMessage(
      projectId,
      turn.response.message,
      {
        mode: turn.response.mode,
        quickReplies: turn.response.quickReplies,
        suggestedNextAction: turn.response.suggestedNextAction,
        proposals: turn.response.proposals,
        assumptions: turn.response.assumptions,
        unresolvedRisks: turn.response.unresolvedRisks,
      },
    );
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    return {
      ...saved,
      message: turn.response.message,
      response: turn.response,
      question: null,
      runId: run.id,
      discoveryPath: INITIAL_DISCOVERY_PATH,
      providerCalls: 1 as const,
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
            : "The configured AI provider could not complete this conversation step.",
      },
    });
    throw error;
  }
}
