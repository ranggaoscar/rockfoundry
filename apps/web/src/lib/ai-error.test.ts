import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError, ConversationAgentOutputError } from "@rockfoundry/ai";
import {
  AI_INVALID_RESPONSE_MESSAGE,
  AI_PROVIDER_ERROR_MESSAGE,
  classifyConversationAiError,
  conversationAiErrorMessage,
} from "./ai-error";
import { safeConversationFailureMessage } from "./ai-error-messages";

describe("conversation AI error messages", () => {
  it.each([
    [
      "curation contract failure",
      new ConversationAgentOutputError("invalid response", [
        { path: ["message"], code: "invalid_type", message: "required" },
      ]),
    ],
    ["JSON parse failure", new Error("Failed to parse JSON response from AI provider")],
    ["empty response", new Error("No content returned from AI provider")],
  ])("maps %s to the invalid-response message", (_label, error) => {
    expect(conversationAiErrorMessage(error)).toBe(AI_INVALID_RESPONSE_MESSAGE);
    expect(classifyConversationAiError(error)).toMatchObject({
      kind: "MODEL_OUTPUT",
      message: AI_INVALID_RESPONSE_MESSAGE,
    });
  });

  it("maps a schema validation failure to the invalid-response message", () => {
    const result = z.object({ message: z.string() }).safeParse({});
    if (result.success) throw new Error("Expected the schema fixture to fail");

    expect(conversationAiErrorMessage(result.error)).toBe(
      AI_INVALID_RESPONSE_MESSAGE,
    );
    expect(classifyConversationAiError(result.error)).toMatchObject({
      category: "SCHEMA_VALIDATION",
      kind: "MODEL_OUTPUT",
    });
  });

it.each(["constructor", "toString", "__proto__"])(
  "rejects inherited key %s as a conversation failure message",
  (value) => {
    expect(safeConversationFailureMessage(value)).toBe(
      "RockFoundry couldn't finish this response.",
    );
  },
);

  it.each([
    ["authentication", new ApiError("provider rejected request", 401)],
    [
      "HTTP failure with a private body",
      new ApiError(
        "provider request failed",
        502,
        "api_key=secret prompt=private provider payload",
      ),
    ],
    ["transport", new TypeError("fetch failed")],
    [
      "timeout",
      Object.assign(new Error("AI request timed out after 60000ms"), {
        name: "TimeoutError",
      }),
    ],
    ["unknown", new Error("unexpected provider failure")],
  ])("maps %s to the provider-reachability message", (_label, error) => {
    const classified = classifyConversationAiError(error);

    expect(classified.message).toBe(AI_PROVIDER_ERROR_MESSAGE);
    expect(classified.kind).toBe("PROVIDER");
    expect(JSON.stringify(classified)).not.toContain("secret");
  });
});
