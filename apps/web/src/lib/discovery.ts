import { prisma } from "@rockfoundry/db";
import {
  applyConversationResponse,
  detectContradictions,
  type ProjectState,
  type Question,
} from "@rockfoundry/core";
import { runConversationAgent } from "./conversation-agent";
import { getLocalProject, parseProjectState, saveProjectState } from "./local-project";

export const INITIAL_CONVERSATION_PATH = "conversation_agent_v2" as const;
/** @deprecated Keep the old export for the optional compatibility route. */
export const INITIAL_DISCOVERY_PATH = INITIAL_CONVERSATION_PATH;

const SAFE_PROVIDER_FAILURE =
  "RockFoundry couldn't reach the configured AI provider. Retry or open Provider Settings.";
const INITIAL_TURN_STALE_AFTER_MS = 2 * 60 * 1000;

type InitialTurnStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
type InitialTurnMetadata = {
  status?: InitialTurnStatus;
  attempt?: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
};

function initialTurnMetadata(state: ProjectState): InitialTurnMetadata {
  const value = state.generationMetadata.initialConversation;
  if (!value || typeof value !== "object") return {};
  return value as InitialTurnMetadata;
}

function isStaleRunningTurn(metadata: InitialTurnMetadata) {
  if (metadata.status !== "RUNNING") return false;
  const startedAt = metadata.startedAt ? Date.parse(metadata.startedAt) : NaN;
  return (
    !Number.isFinite(startedAt) ||
    Date.now() - startedAt > INITIAL_TURN_STALE_AFTER_MS
  );
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

export async function persistAssistantConversationMessage(
  projectId: string,
  content: string,
  metadata: Record<string, unknown> = {},
) {
  const existing = await prisma.conversationMessage.findFirst({
    where: { projectId, role: "assistant", content },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;
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

function withInitialTurnMetadata(
  state: ProjectState,
  metadata: InitialTurnMetadata,
) {
  return {
    ...state,
    generationMetadata: {
      ...state.generationMetadata,
      initialConversation: metadata,
    },
  } satisfies ProjectState;
}

async function markInitialTurnFailed(projectId: string, attempt: number) {
  const latest = await getLocalProject(projectId);
  if (!latest) return null;
  const state = parseProjectState(latest);
  const current = initialTurnMetadata(state);
  if (current.status === "COMPLETED") return { state, version: latest.version };
  const nextState = withInitialTurnMetadata(state, {
    status: "FAILED",
    attempt,
    error: SAFE_PROVIDER_FAILURE,
  });
  try {
    return await saveProjectState(projectId, nextState, latest.version);
  } catch {
    const refreshed = await getLocalProject(projectId);
    return refreshed
      ? { state: parseProjectState(refreshed), version: refreshed.version }
      : null;
  }
}

async function updateAgentRunFailure(runId: string) {
  await prisma.agentRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      failureReason: SAFE_PROVIDER_FAILURE,
    },
  });
}

export async function runInitialConversation(
  projectId: string,
  rawIdea: string,
  _expectedVersion: number,
) {
  void _expectedVersion;
  const project = await getLocalProject(projectId);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  const idea = rawIdea.trim();
  const currentState = parseProjectState(project);
  const currentTurn = initialTurnMetadata(currentState);
  const existingAssistant = await prisma.conversationMessage.findFirst({
    where: { projectId, role: "assistant" },
    orderBy: { createdAt: "asc" },
  });
  if (existingAssistant || currentTurn.status === "COMPLETED") {
    return {
      status: "COMPLETED" as const,
      reused: true,
      retryable: false,
      message: existingAssistant?.content,
      state: currentState,
      version: project.version,
      question: null,
      discoveryPath: INITIAL_CONVERSATION_PATH,
      providerCalls: 0 as const,
    };
  }

  if (currentTurn.status === "RUNNING" && !isStaleRunningTurn(currentTurn)) {
    return {
      status: "RUNNING" as const,
      reused: true,
      retryable: false,
      state: currentState,
      version: project.version,
      question: null,
      discoveryPath: INITIAL_CONVERSATION_PATH,
      providerCalls: 0 as const,
    };
  }

  const attempt = (currentTurn.attempt || 0) + 1;
  const claimedState = withInitialTurnMetadata(currentState, {
    status: "RUNNING",
    attempt,
    startedAt: new Date().toISOString(),
  });
  let claimed: { state: ProjectState; version: number };
  try {
    claimed = await saveProjectState(
      projectId,
      claimedState,
      project.version,
      idea,
    );
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "PROJECT_VERSION_CONFLICT")
      throw error;
    const refreshed = await getLocalProject(projectId);
    if (!refreshed) throw new Error("PROJECT_NOT_FOUND");
    const refreshedState = parseProjectState(refreshed);
    const refreshedTurn = initialTurnMetadata(refreshedState);
    const refreshedAssistant = await prisma.conversationMessage.findFirst({
      where: { projectId, role: "assistant" },
      orderBy: { createdAt: "asc" },
    });
    if (refreshedAssistant || refreshedTurn.status === "COMPLETED") {
      return {
        status: "COMPLETED" as const,
        reused: true,
        retryable: false,
        message: refreshedAssistant?.content,
        state: refreshedState,
        version: refreshed.version,
        question: null,
        discoveryPath: INITIAL_CONVERSATION_PATH,
        providerCalls: 0 as const,
      };
    }
    return {
      status: "RUNNING" as const,
      reused: true,
      retryable: false,
      state: refreshedState,
      version: refreshed.version,
      question: null,
      discoveryPath: INITIAL_CONVERSATION_PATH,
      providerCalls: 0 as const,
    };
  }

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
    const turn = await runConversationAgent({
      projectId,
      text: idea,
      mode: "BRAINSTORM",
      state: claimed.state,
    });
    mergeDetectedContradictions(turn.state);
    turn.state.discovery.activeQuestionId = undefined;
    const completedState = withInitialTurnMetadata(turn.state, {
      status: "COMPLETED",
      attempt,
      completedAt: new Date().toISOString(),
    });
    let saved: { state: ProjectState; version: number };
    const assistantMetadata = {
      initialTurn: true,
      mode: turn.response.mode,
      quickReplies: turn.response.quickReplies,
      suggestedNextAction: turn.response.suggestedNextAction,
      proposals: turn.response.proposals,
      assumptions: turn.response.assumptions,
      unresolvedRisks: turn.response.unresolvedRisks,
    };
    try {
      saved = await saveProjectState(
        projectId,
        completedState,
        claimed.version,
        idea,
        undefined,
        { content: turn.response.message, metadata: assistantMetadata },
      );
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "PROJECT_VERSION_CONFLICT")
        throw error;
      const latest = await getLocalProject(projectId);
      if (!latest) throw new Error("PROJECT_NOT_FOUND");
      const mergedState = withInitialTurnMetadata(
        applyConversationResponse(parseProjectState(latest), turn.response),
        {
          status: "COMPLETED",
          attempt,
          completedAt: new Date().toISOString(),
        },
      );
      saved = await saveProjectState(
        projectId,
        mergedState,
        latest.version,
        idea,
        undefined,
        { content: turn.response.message, metadata: assistantMetadata },
      );
    }
    const assistant = await prisma.conversationMessage.findFirst({
      where: {
        projectId,
        role: "assistant",
        content: turn.response.message,
      },
      orderBy: { createdAt: "asc" },
    });
    if (!assistant) throw new Error("INITIAL_ASSISTANT_NOT_PERSISTED");
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    return {
      ...saved,
      status: "COMPLETED" as const,
      reused: false,
      retryable: false,
      message: assistant.content,
      response: turn.response,
      question: null,
      runId: run.id,
      discoveryPath: INITIAL_CONVERSATION_PATH,
      providerCalls: 1 as const,
    };
  } catch {
    await updateAgentRunFailure(run.id);
    const failed = await markInitialTurnFailed(projectId, attempt);
    const failure = new Error(SAFE_PROVIDER_FAILURE);
    Object.assign(failure, {
      retryable: true,
      state: failed?.state,
      version: failed?.version,
      status: "FAILED" as const,
    });
    throw failure;
  }
}

/** @deprecated Compatibility name for the old extract endpoint. */
export const runInitialDiscovery = runInitialConversation;
export const INITIAL_TURN_FAILURE_MESSAGE = SAFE_PROVIDER_FAILURE;
export const INITIAL_TURN_STALE_MS = INITIAL_TURN_STALE_AFTER_MS;

export async function getInitialConversationState(projectId: string) {
  const project = await getLocalProject(projectId);
  if (!project) return null;
  const state = parseProjectState(project);
  const assistant = await prisma.conversationMessage.findFirst({
    where: { projectId, role: "assistant" },
    orderBy: { createdAt: "asc" },
  });
  const initial = initialTurnMetadata(state);
  return {
    state,
    version: project.version,
    initialConversation: initial,
    status: assistant || initial.status === "COMPLETED"
      ? ("COMPLETED" as const)
      : initial.status === "FAILED"
        ? ("FAILED" as const)
        : initial.status === "RUNNING"
          ? ("RUNNING" as const)
          : ("PENDING" as const),
    message: assistant?.content,
  };
}
