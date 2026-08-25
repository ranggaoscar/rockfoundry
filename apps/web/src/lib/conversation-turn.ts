import { Prisma, type PrismaClient } from "@rockfoundry/db";
import {
  ProjectStateSchema,
  detectContradictions,
  evaluateReadinessDirectly,
  markDesignStale,
  type ProjectState,
} from "@rockfoundry/core";
import { saveProjectStateInTransaction } from "./local-project";
import { getPackageEligibility } from "./package-readiness";
import { classifyMessage } from "./conversation";
import { modeFromMessage, runConversationAgent } from "./conversation-agent";
import {
  conversationAiErrorMessage,
  safeConversationTurnErrorSummary,
} from "./ai-error";

function mergeDetectedContradictions(state: ProjectState) {
  const detected = detectContradictions(state);
  const byId = new Map(
    [...state.contradictions, ...detected].map((item) => [item.id, item]),
  );
  state.contradictions = [...byId.values()];
}

export const CONVERSATION_TURN_STATUS = {
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;
export const CONVERSATION_TURN_STALE_MS = 120_000;

export type ConversationTurnStatus =
  (typeof CONVERSATION_TURN_STATUS)[keyof typeof CONVERSATION_TURN_STATUS];

type ConversationDb = Pick<
  PrismaClient,
  | "$transaction"
  | "conversationTurn"
  | "conversationMessage"
  | "project"
  | "projectStateRevision"
>;
type ConversationTurnWithMessages = Prisma.ConversationTurnGetPayload<{
  include: { messages: true };
}>;

export type ConversationTurnPublic = {
  id: string;
  projectId: string;
  requestId: string;
  status: string;
  attempt: number;
  projectVersion: number | null;
  providerCalls: number;
  errorSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date;
  completedAt: Date | null;
};

export type ConversationTurnClaim =
  | {
      kind: "CLAIMED";
      turn: ConversationTurnWithMessages;
      userMessage: ConversationTurnWithMessages["messages"][number];
    }
  | {
      kind: "EXISTING";
      turn: ConversationTurnWithMessages;
      userMessage?: ConversationTurnWithMessages["messages"][number];
    };

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
function safeErrorSummary(error: unknown): string {
  if (error instanceof Error && error.message === "PROJECT_VERSION_CONFLICT") {
    return "The project changed while processing this turn. Retry is available.";
  }
  return (
    safeConversationTurnErrorSummary(conversationAiErrorMessage(error)) ||
    "The conversation turn failed and can be retried."
  );
}

export function publicConversationTurn(turn: {
  id: string;
  projectId: string;
  requestId: string;
  status: string;
  attempt: number;
  projectVersion: number | null;
  providerCalls: number;
  errorSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date;
  completedAt: Date | null;
}): ConversationTurnPublic {
  const errorSummary = safeConversationTurnErrorSummary(turn.errorSummary);
  return {
    id: turn.id,
    projectId: turn.projectId,
    requestId: turn.requestId,
    status: turn.status,
    attempt: turn.attempt,
    projectVersion: turn.projectVersion,
    providerCalls: turn.providerCalls,
    errorSummary,
    createdAt: turn.createdAt,
    updatedAt: turn.updatedAt,
    startedAt: turn.startedAt,
    completedAt: turn.completedAt,
  };
}
export function retryableConversationTurnPayload(
  turn: Parameters<typeof publicConversationTurn>[0],
  userMessageId?: string | null,
) {
  return {
    retryable: true,
    turn: publicConversationTurn(turn),
    userMessageId: userMessageId ?? null,
    retryEndpoint: `/api/projects/${turn.projectId}/conversation/retry`,
  };
}

export function parseStoredConversationResponse(
  turn: { responsePayload: string | null },
): Record<string, unknown> | null {
  if (!turn.responsePayload) return null;
  try {
    const parsed: unknown = JSON.parse(turn.responsePayload);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function recoverStaleConversationTurns(
  db: ConversationDb,
  now = Date.now(),
) {
  return db.conversationTurn.updateMany({
    where: {
      status: CONVERSATION_TURN_STATUS.RUNNING,
      updatedAt: { lt: new Date(now - CONVERSATION_TURN_STALE_MS) },
    },
    data: {
      status: CONVERSATION_TURN_STATUS.FAILED,
      errorSummary: "This conversation turn was interrupted and can be retried.",
      completedAt: new Date(now),
    },
  });
}

export async function claimConversationTurn(
  db: ConversationDb,
  input: {
    projectId: string;
    requestId: string;
    text: string;
    metadata?: Record<string, unknown>;
  },
): Promise<ConversationTurnClaim> {
  await recoverStaleConversationTurns(db);
  const requestId = input.requestId.trim();
  if (!requestId) throw new Error("CONVERSATION_REQUEST_ID_REQUIRED");

  try {
    return await db.$transaction(async (transaction) => {
      const turn = await transaction.conversationTurn.create({
        data: {
          projectId: input.projectId,
          requestId,
          text: input.text,
          status: CONVERSATION_TURN_STATUS.RUNNING,
          attempt: 1,
          providerCalls: 0,
        },
        include: { messages: true },
      });
      const userMessage = await transaction.conversationMessage.create({
        data: {
          projectId: input.projectId,
          role: "user",
          content: input.text,
          requestId,
          conversationTurnId: turn.id,
          metadata: JSON.stringify({ source: "USER", ...input.metadata }),
        },
      });
      return { kind: "CLAIMED", turn, userMessage };
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const turn = await db.conversationTurn.findUnique({
      where: {
        projectId_requestId: {
          projectId: input.projectId,
          requestId,
        },
      },
      include: { messages: true },
    });
    if (!turn) throw error;
    const userMessage = turn.messages.find(
      (message) => message.role === "user" && message.requestId === requestId,
    );
    return { kind: "EXISTING", turn, userMessage };
  }
}

export async function claimFailedConversationTurn(
  db: ConversationDb,
  input: { projectId: string; turnId: string },
) {
  await recoverStaleConversationTurns(db);
  const current = await db.conversationTurn.findUnique({ where: { id: input.turnId } });
  if (!current || current.projectId !== input.projectId) {
    throw new Error("CONVERSATION_TURN_NOT_FOUND");
  }
  const nextAttempt = current.attempt + 1;
  const claimed = await db.conversationTurn.updateMany({
    where: {
      id: input.turnId,
      projectId: input.projectId,
      status: CONVERSATION_TURN_STATUS.FAILED,
      attempt: current.attempt,
    },
    data: {
      status: CONVERSATION_TURN_STATUS.RUNNING,
      attempt: nextAttempt,
      errorSummary: null,
      responsePayload: null,
      startedAt: new Date(),
      completedAt: null,
    },
  });
  const turn = await db.conversationTurn.findUnique({
    where: { id: input.turnId },
    include: { messages: true },
  });
  if (!turn || turn.projectId !== input.projectId) {
    throw new Error("CONVERSATION_TURN_NOT_FOUND");
  }
  return { claimed: claimed.count === 1, turn };
}
export async function markConversationTurnFailed(
  db: ConversationDb,
  input: {
    projectId: string;
    turnId: string;
    attempt: number;
    providerCalls?: number;
    error?: unknown;
  },
) {
  await db.conversationTurn.updateMany({
    where: {
      id: input.turnId,
      projectId: input.projectId,
      status: CONVERSATION_TURN_STATUS.RUNNING,
      attempt: input.attempt,
    },
    data: {
      status: CONVERSATION_TURN_STATUS.FAILED,
      errorSummary: safeErrorSummary(input.error),
      providerCalls: input.providerCalls ?? 0,
      completedAt: new Date(),
    },
  });
  return db.conversationTurn.findUnique({ where: { id: input.turnId } });
}

type CompletionContext = {
  state: ProjectState;
  version: number;
  readiness: ReturnType<typeof evaluateReadinessDirectly>;
  turn: ConversationTurnPublic;
  userMessageId: string;
};

export async function completeConversationTurn(
  db: ConversationDb,
  input: {
    projectId: string;
    turnId: string;
    attempt: number;
    state: ProjectState;
    expectedVersion: number;
    assistant: { content: string; metadata: Record<string, unknown> };
    providerCalls: number;
    buildResponse: (context: CompletionContext) => Record<string, unknown>;
  },
) {
  const parsed = ProjectStateSchema.parse(input.state);
  return db.$transaction(async (transaction) => {
    const turn = await transaction.conversationTurn.findUnique({
      where: { id: input.turnId },
    });
    if (!turn || turn.projectId !== input.projectId) {
      throw new Error("CONVERSATION_TURN_NOT_FOUND");
    }
    if (turn.status !== CONVERSATION_TURN_STATUS.RUNNING || turn.attempt !== input.attempt) {
      throw new Error("CONVERSATION_TURN_NOT_CURRENT");
    }

    const userMessage = await transaction.conversationMessage.findFirst({
      where: {
        projectId: input.projectId,
        conversationTurnId: input.turnId,
        role: "user",
      },
    });
    if (!userMessage) throw new Error("CONVERSATION_USER_MESSAGE_NOT_FOUND");

    const existingAssistant = await transaction.conversationMessage.findFirst({
      where: { projectId: input.projectId, conversationTurnId: input.turnId, role: "assistant" },
    });
    if (existingAssistant) throw new Error("CONVERSATION_ASSISTANT_ALREADY_EXISTS");
    const saved = await saveProjectStateInTransaction(
      transaction,
      input.projectId,
      parsed,
      input.expectedVersion,
      undefined,
      undefined,
      {
        content: input.assistant.content,
        metadata: input.assistant.metadata,
        conversationTurnId: input.turnId,
        requestId: turn.requestId,
      },
    );
    const completedTurn = await transaction.conversationTurn.update({
      where: { id: input.turnId },
      data: {
        status: CONVERSATION_TURN_STATUS.COMPLETED,
        projectVersion: saved.version,
        providerCalls: input.providerCalls,
        completedAt: new Date(),
        errorSummary: null,
      },
    });
    const payload = input.buildResponse({
      state: saved.state,
      version: saved.version,
      readiness: saved.readiness,
      turn: publicConversationTurn(completedTurn),
      userMessageId: userMessage.id,
    });
    await transaction.conversationTurn.update({
      where: { id: input.turnId },
      data: { responsePayload: JSON.stringify(payload) },
    });

    return {
      state: saved.state,
      version: saved.version,
      assistant: await transaction.conversationMessage.findFirstOrThrow({
        where: { projectId: input.projectId, conversationTurnId: input.turnId, role: "assistant" },
      }),
      turn: completedTurn,
      payload,
    };
  });
}

type ConversationAgentResult = Awaited<ReturnType<typeof runConversationAgent>>;

export async function runClaimedConversationTurn(input: {
  db: ConversationDb;
  projectId: string;
  turnId: string;
  text: string;
  mode: Parameters<typeof runConversationAgent>[0]["mode"];
  intent: string;
  state: ProjectState;
  expectedVersion: number;
  providerCalls?: number;
  attempt?: number;
  runAgent?: (
    input: Parameters<typeof runConversationAgent>[0],
  ) => Promise<ConversationAgentResult>;
}) {
  const providerCalls = (input.providerCalls ?? 0) + 1;
  const attempt = input.attempt ?? 1;
  try {
    const result = await (input.runAgent || runConversationAgent)({
      projectId: input.projectId,
      text: input.text,
      mode: input.mode,
      state: input.state,
    });
    const curatedState =
      result.state.studio.currentVersion > 0 &&
      (result.response.stateDelta.explicitFacts.length > 0 ||
        result.response.stateDelta.confirmedDecisions.length > 0 ||
        result.response.stateDelta.corrections.length > 0)
        ? markDesignStale(result.state, result.state.studio.screenMap.map((screen) => screen.id))
        : result.state;
    if (
      result.response.stateDelta.explicitFacts.length > 0 ||
      result.response.stateDelta.confirmedDecisions.length > 0 ||
      result.response.stateDelta.corrections.length > 0
    ) {
      mergeDetectedContradictions(curatedState);
    }
    return await completeConversationTurn(input.db, {
      projectId: input.projectId,
      turnId: input.turnId,
      state: curatedState,
      expectedVersion: input.expectedVersion,
      attempt,
      providerCalls,
      assistant: {
        content: result.response.message,
        metadata: {
          mode: result.response.mode,
          quickReplies: result.response.quickReplies,
          suggestedNextAction: result.response.suggestedNextAction,
          proposals: result.response.proposals,
          assumptions: result.response.assumptions,
          unresolvedRisks: result.response.unresolvedRisks,
        },
      },
      buildResponse: ({ state, version, readiness, turn, userMessageId }) => ({
        intent: input.intent,
        mode: result.response.mode,
        message: result.response.message,
        response: result.response,
        state,
        version,
        userMessageId,
        question: null,
        quickReplies: result.response.quickReplies,
        suggestedNextAction: result.response.suggestedNextAction,
        activities: [],
        requestId: turn.requestId,
        turn,
        ...getPackageEligibility(readiness),
      }),
    });
  } catch (error) {
    await markConversationTurnFailed(input.db, {
      projectId: input.projectId,
      turnId: input.turnId,
      attempt,
      providerCalls,
      error,
    });
    throw error;
  }
}

export async function getConversationTurn(
  db: ConversationDb,
  input: { projectId: string; turnId: string },
) {
  const turn = await db.conversationTurn.findUnique({ where: { id: input.turnId }, include: { messages: true } });
  if (!turn || turn.projectId !== input.projectId) return null;
  return turn;
}

export function conversationModeAndIntent(text: string) {
  return { mode: modeFromMessage(text), intent: classifyMessage(text) };
}
