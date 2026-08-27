import { isProductDraftCurrent } from "./project-truth";
import type { ProjectState } from "@rockfoundry/core";

export const WEBMCP_REFINE_PRODUCT_MAX_INSTRUCTION_LENGTH = 5000;

type ConversationResponse = {
  error?: unknown;
  message?: unknown;
  retryable?: unknown;
  version?: unknown;
  state?: unknown;
};

export type WebMcpRefineProductResult = {
  status: "success" | "no_change" | "retryable" | "failed" | "cancelled";
  projectVersion?: number;
  assistantSummary: string;
  draftMayNeedRefresh: boolean;
};

type RefineProductThroughConversationInput = {
  projectId: string;
  instruction: unknown;
  previousState: unknown;
  signal: AbortSignal;
  refreshProject: (projectId: string) => Promise<unknown>;
  fetchImpl?: typeof fetch;
};

function safeText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 1000)
    : fallback;
}

function isProjectState(value: unknown): value is ProjectState {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function result(
  status: WebMcpRefineProductResult["status"],
  assistantSummary: string,
  draftMayNeedRefresh: boolean,
  version?: unknown,
): WebMcpRefineProductResult {
  return {
    status,
    ...(typeof version === "number" ? { projectVersion: version } : {}),
    assistantSummary,
    draftMayNeedRefresh,
  };
}

/** Uses the normal durable conversation endpoint; this adapter owns no product logic. */
export async function refineProductThroughConversation({
  projectId,
  instruction,
  previousState,
  signal,
  refreshProject,
  fetchImpl = fetch,
}: RefineProductThroughConversationInput): Promise<WebMcpRefineProductResult> {
  const text = typeof instruction === "string" ? instruction.trim() : "";
  if (!text)
    return result(
      "failed",
      "Provide a non-empty product refinement instruction.",
      false,
    );
  if (text.length > WEBMCP_REFINE_PRODUCT_MAX_INSTRUCTION_LENGTH)
    return result(
      "failed",
      `Keep the refinement instruction under ${WEBMCP_REFINE_PRODUCT_MAX_INSTRUCTION_LENGTH} characters.`,
      false,
    );

  try {
    const response = await fetchImpl(
      `/api/projects/${projectId}/conversation`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-conversation-request-id": crypto.randomUUID(),
        },
        body: JSON.stringify({ text }),
        signal,
      },
    );
    const payload = (await response
      .json()
      .catch(() => ({}))) as ConversationResponse;
    if (response.status === 202)
      return result(
        "retryable",
        "The conversation update is still running. Refresh shortly to see the result.",
        false,
        payload.version,
      );
    const retryable = response.status === 409 || payload.retryable === true;
    if (!response.ok) {
      return result(
        retryable ? "retryable" : "failed",
        safeText(
          payload.error,
          retryable
            ? "The conversation update can be retried."
            : "RockFoundry could not refine the product.",
        ),
        false,
        payload.version,
      );
    }

    await refreshProject(projectId);
    if (
      !isProjectState(previousState) ||
      !isProjectState(payload.state) ||
      isProductDraftCurrent(previousState, payload.state)
    ) {
      return result(
        "no_change",
        "The conversation was saved, but canonical product truth did not change.",
        false,
        payload.version,
      );
    }
    return result(
      "success",
      safeText(payload.message, "RockFoundry updated the product context."),
      true,
      payload.version,
    );
  } catch {
    if (signal.aborted)
      return result(
        "cancelled",
        "The product refinement was cancelled.",
        false,
      );
    return result(
      "failed",
      "RockFoundry could not refine the product. Try again.",
      false,
    );
  }
}
