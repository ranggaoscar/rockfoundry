export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@rockfoundry/db";
import { getLocalProject, jsonError, parseProjectState } from "@/lib/local-project";
import {
  claimFailedConversationTurn,
  conversationModeAndIntent,
  CONVERSATION_TURN_STATUS,
  parseStoredConversationResponse,
  publicConversationTurn,
  retryableConversationTurnPayload,
  runClaimedConversationTurn,
} from "@/lib/conversation-turn";
import { conversationAiErrorMessage } from "@/lib/ai-error";

const Input = z.object({ userMessageId: z.string().min(1) });

function existingTurnResponse(turn: {
  projectId: string;
  requestId: string;
  status: string;
  attempt: number;
  projectVersion: number | null;
  providerCalls: number;
  errorSummary: string | null;
  id: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date;
  completedAt: Date | null;
  responsePayload: string | null;
  messages?: Array<{ id: string; role: string; conversationTurnId: string | null }>;
}) {
  const payload = parseStoredConversationResponse(turn);
  if (payload) return Response.json({ ...payload, replayed: true });
  const publicTurn = publicConversationTurn(turn);
  if (turn.status === CONVERSATION_TURN_STATUS.RUNNING) {
    return Response.json({ turn: publicTurn, recoverable: true }, { status: 202 });
  }
  if (turn.status === CONVERSATION_TURN_STATUS.FAILED) {
    const userMessage = turn.messages?.find(
      (message) => message.role === "user" && message.conversationTurnId === turn.id,
    );
    return Response.json(
      retryableConversationTurnPayload(turn, userMessage?.id),
      { status: 409 },
    );
  }
  return Response.json({ turn: publicTurn });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await getLocalProject(id);
    if (!project) return jsonError("Project not found", 404);
    const { userMessageId } = Input.parse(await req.json());
    const userMessage = await prisma.conversationMessage.findUnique({
      where: { id: userMessageId },
      include: { conversationTurn: { include: { messages: true } } },
    });
    if (
      !userMessage ||
      userMessage.projectId !== id ||
      userMessage.role !== "user" ||
      !userMessage.conversationTurn
    ) {
      return jsonError("A durable user conversation message is required.", 404);
    }
    const turn = userMessage.conversationTurn;
    const assistant = turn.messages.find((message) => message.role === "assistant");
    if (assistant || turn.status === CONVERSATION_TURN_STATUS.COMPLETED) {
      return existingTurnResponse(turn);
    }

    const claim = await claimFailedConversationTurn(prisma, {
      projectId: id,
      turnId: turn.id,
    });
    if (!claim.claimed) return existingTurnResponse(claim.turn);

    const state = parseProjectState(project);
    const { intent, mode } = conversationModeAndIntent(userMessage.content);
    const result = await runClaimedConversationTurn({
      db: prisma,
      projectId: id,
      turnId: turn.id,
      text: userMessage.content,
      mode,
      intent,
      state,
      expectedVersion: project.version,
      attempt: claim.turn.attempt,
      providerCalls: claim.turn.providerCalls,
    });
    return Response.json({ ...result.payload, retried: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("A userMessageId is required.", 400);
    }
    if (error instanceof Error && error.message === "PROJECT_VERSION_CONFLICT") {
      return jsonError(
        "The project changed while this conversation turn was running. Retry the turn.",
        409,
        { retryable: true },
      );
    }
    return jsonError(
      conversationAiErrorMessage(error),
      422,
    );
  }
}
