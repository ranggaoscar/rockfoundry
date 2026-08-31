import {
  classifyDesignFailure,
  ConversationAgentOutputError,
  type DesignFailureCategory,
} from "@rockfoundry/ai";
import {
  AI_INVALID_RESPONSE_MESSAGE,
  AI_PROVIDER_ERROR_MESSAGE,
} from "./ai-error-messages";

export {
  AI_INVALID_RESPONSE_MESSAGE,
  AI_PROVIDER_ERROR_MESSAGE,
} from "./ai-error-messages";

const MODEL_OUTPUT_FAILURE_CATEGORIES = new Set<DesignFailureCategory>([
  "JSON_PARSE",
  "SCHEMA_VALIDATION",
  "EMPTY_RESPONSE",
]);

const CONVERSATION_VERSION_CONFLICT_MESSAGE =
  "The project changed while processing this turn. Retry is available.";
const CONVERSATION_INTERRUPTED_MESSAGE =
  "This conversation turn was interrupted and can be retried.";
const CONVERSATION_GENERIC_FAILURE_MESSAGE =
  "The conversation turn failed and can be retried.";

export type SafeConversationAiError = {
  category: DesignFailureCategory;
  kind: "PROVIDER" | "MODEL_OUTPUT";
  message: string;
};

function isConversationAgentOutputError(error: unknown) {
  if (error instanceof ConversationAgentOutputError) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; code?: unknown };
  return (
    candidate.name === "ConversationAgentOutputError" &&
    candidate.code === "AI_CONVERSATION_OUTPUT_INVALID"
  );
}

export function classifyConversationAiError(
  error: unknown,
): SafeConversationAiError {
  if (isConversationAgentOutputError(error)) {
    return {
      category: "SCHEMA_VALIDATION",
      kind: "MODEL_OUTPUT",
      message: AI_INVALID_RESPONSE_MESSAGE,
    };
  }

  const failure = classifyDesignFailure(error, { task: "conversation_agent" });
  const modelOutput = MODEL_OUTPUT_FAILURE_CATEGORIES.has(failure.category);
  return {
    category: failure.category,
    kind: modelOutput ? "MODEL_OUTPUT" : "PROVIDER",
    message: modelOutput ? AI_INVALID_RESPONSE_MESSAGE : AI_PROVIDER_ERROR_MESSAGE,
  };
}

export function conversationAiErrorMessage(error: unknown) {
  return classifyConversationAiError(error).message;
}

export function safeConversationTurnErrorSummary(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  if (
    value === AI_PROVIDER_ERROR_MESSAGE ||
    value === AI_INVALID_RESPONSE_MESSAGE ||
    value === CONVERSATION_VERSION_CONFLICT_MESSAGE ||
    value === CONVERSATION_INTERRUPTED_MESSAGE ||
    value === CONVERSATION_GENERIC_FAILURE_MESSAGE
  ) {
    return value;
  }
  return CONVERSATION_GENERIC_FAILURE_MESSAGE;
}
