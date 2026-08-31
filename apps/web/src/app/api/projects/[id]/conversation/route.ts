export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { getLocalProject, jsonError, parseProjectState } from "@/lib/local-project";
import {
  claimConversationTurn,
  conversationModeAndIntent,
  getConversationTurn,
  parseStoredConversationResponse,
  publicConversationTurn,
  retryableConversationTurnPayload,
  runClaimedConversationTurn,
  CONVERSATION_TURN_STATUS,
} from "@/lib/conversation-turn";
import { conversationAiErrorMessage } from "@/lib/ai-error";
import { prisma } from "@rockfoundry/db";

const Input = z.object({
  text: z.string().trim().min(1).max(5000),
  explicitQuestionId: z.string().min(1).nullable().optional(),
  explicitOptionId: z.string().min(1).nullable().optional(),
});

function existingTurnResponse(
  turn: Awaited<ReturnType<typeof getConversationTurn>>,
): Response {
  if (!turn) return jsonError("Conversation turn not found.", 404);
  const payload = parseStoredConversationResponse(turn);
  if (payload) return Response.json({ ...payload, replayed: true });
  const response = {
    requestId: turn.requestId,
    turn: publicConversationTurn(turn),
  };
  if (turn.status === CONVERSATION_TURN_STATUS.RUNNING) {
    return Response.json({ ...response, recoverable: true }, { status: 202 });
  }
  if (turn.status === CONVERSATION_TURN_STATUS.FAILED) {
    const userMessage = turn.messages.find(
      (message) => message.role === "user" && message.conversationTurnId === turn.id,
    );
    return Response.json(
      {
        requestId: turn.requestId,
        ...retryableConversationTurnPayload(turn, userMessage?.id),
      },
      { status: 409 },
    );
  }
  return Response.json(response);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let claimedProjectId: string | undefined;
  let claimedRequestId: string | undefined;
  let claimedTurnId: string | undefined;
  let hasClaimedTurn = false;

  try {
    const { id } = await params;
    claimedProjectId = id;
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
    const requestId =
      req.headers.get("x-conversation-request-id")?.trim() || crypto.randomUUID();
    claimedRequestId = requestId;
    const { intent, mode } = conversationModeAndIntent(body.text);
    const claim = await claimConversationTurn(prisma, {
      projectId: id,
      requestId,
      text: body.text,
      metadata: { intent, mode },
    });
    if (claim.kind === "EXISTING") {
      return existingTurnResponse(claim.turn);
    }
    claimedTurnId = claim.turn.id;
    hasClaimedTurn = true;

    const result = await runClaimedConversationTurn({
      db: prisma,
      projectId: id,
      turnId: claim.turn.id,
      text: body.text,
      mode,
      intent,
      state,
      expectedVersion: project.version,
    });
    return Response.json(result.payload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError("Enter a valid message.", 400);
    }

    if (hasClaimedTurn && claimedProjectId && claimedRequestId) {
      try {
        const turn = claimedTurnId
          ? await getConversationTurn(prisma, {
              projectId: claimedProjectId,
              turnId: claimedTurnId,
            })
          : await prisma.conversationTurn.findUnique({
              where: {
                projectId_requestId: {
                  projectId: claimedProjectId,
                  requestId: claimedRequestId,
                },
              },
              include: { messages: true },
            });
        if (turn) {
          const userMessage = turn.messages.find(
            (message) =>
              message.role === "user" &&
              message.conversationTurnId === turn.id,
          );
          const status =
            error instanceof Error &&
            error.message === "PROJECT_VERSION_CONFLICT"
              ? 409
              : 422;
          return Response.json(
            {
              error:
                status === 409
                  ? "The conversation turn failed after saving your message. Retry is available."
                  : conversationAiErrorMessage(error),
              retryable: true,
              turn: publicConversationTurn(turn),
              userMessageId: userMessage?.id ?? null,
              retryEndpoint: `/api/projects/${claimedProjectId}/conversation/retry`,
            },
            { status },
          );
        }
      } catch {
        // Fall through to the generic safe error when durable recovery lookup fails.
      }
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

export type ConversationResponseQuestion = null;
