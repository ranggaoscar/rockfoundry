export const AI_PROVIDER_ERROR_MESSAGE =
  "RockFoundry couldn't reach the configured AI provider.";
export const AI_INVALID_RESPONSE_MESSAGE =
  "RockFoundry received an invalid AI response. Try again.";

const SAFE_CONVERSATION_FAILURE_MESSAGES: Record<string, true> = {
  [AI_INVALID_RESPONSE_MESSAGE]: true,
  [AI_PROVIDER_ERROR_MESSAGE]: true,
};

const GENERIC_CONVERSATION_FAILURE_MESSAGE =
  "RockFoundry couldn't finish this response.";

export function safeConversationFailureMessage(value: unknown) {
  return typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(SAFE_CONVERSATION_FAILURE_MESSAGES, value)
    ? value
    : GENERIC_CONVERSATION_FAILURE_MESSAGE;
}
