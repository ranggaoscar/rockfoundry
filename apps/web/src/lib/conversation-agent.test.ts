import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createInitialProjectState } from "@rockfoundry/core";
import {
  conversationProjectContext,
  conversationUiState,
  formatRecentConversation,
  MAX_RECENT_CONVERSATION_DB_ENTRIES,
} from "./conversation-agent";

describe("formatRecentConversation", () => {
  it("keeps chronological newest context within caps and filters current/tool messages", () => {
    const entries = [
      { role: "system", content: "internal instructions" },
      ...Array.from({ length: 14 }, (_, index) => ({
        role: index % 2 === 0 ? "user" : "assistant",
        content: `message-${index} ${"x".repeat(700)}`,
      })),
      { role: "tool", content: "tool output" },
      { role: "internal", text: "internal metadata" },
    ];

    const formatted = formatRecentConversation(entries, `  MESSAGE-13   ${"x".repeat(700)}  `);

    expect(formatted.length).toBeLessThanOrEqual(12);
    expect(formatted.reduce((total, message) => total + message.text.length, 0)).toBeLessThanOrEqual(6000);
    expect(formatted.every((message) => message.role === "user" || message.role === "assistant")).toBe(true);
    expect(formatted.every((message) => !message.text.includes("internal") && !message.text.includes("tool output"))).toBe(true);
    expect(formatted.at(-1)?.text.startsWith("message-12")).toBe(true);
    expect(formatted.map((message) => Number(message.text.match(/message-(\d+)/)?.[1]))).toEqual(
      [...formatted].map((message) => Number(message.text.match(/message-(\d+)/)?.[1])).sort((a, b) => a - b),
    );
  });
});

it("filters the current durable turn without dropping repeated historical text", () => {
  const formatted = formatRecentConversation(
    [
      {
        id: "old-message",
        role: "user",
        content: "same product detail",
        conversationTurnId: "old-turn",
      },
      {
        id: "current-message",
        role: "user",
        content: "same product detail",
        conversationTurnId: "current-turn",
      },
    ],
    "same product detail",
    { conversationTurnId: "current-turn" },
  );

  expect(formatted).toEqual([
    { role: "user", text: "same product detail" },
  ]);
  expect(MAX_RECENT_CONVERSATION_DB_ENTRIES).toBe(24);
});

it("uses the newest matching user message as the current turn when identity is omitted", () => {
  const formatted = formatRecentConversation(
    [
      {
        id: "old-message",
        role: "user",
        content: "same   product detail",
        conversationTurnId: "old-turn",
      },
      {
        id: "current-message",
        role: "user",
        content: "same product detail",
        conversationTurnId: "current-turn",
      },
    ],
    "same product detail",
  );

  expect(formatted).toEqual([
    { role: "user", text: "same   product detail" },
  ]);
});

it("exposes unresolved risks and soft advisory only in provider context", () => {
  const state = createInitialProjectState({
    id: "conversation-context",
    name: "Becak",
    rawIdea: "Aplikasi becak online",
  });
  state.risks = ["Payment responsibility: Belum diputuskan."];
  state.generationMetadata.conversationClarificationAdvisory = {
    maxQuestionsPerTurn: 1,
    requestedThisTurn: 1,
    voluntaryContinuationAllowed: true,
    unresolvedDetailTopics: ["payment"],
  };

  expect(conversationProjectContext(state)).toMatchObject({
    risks: ["Payment responsibility: Belum diputuskan."],
    unresolvedRisks: ["Payment responsibility: Belum diputuskan."],
    clarificationAdvisory: expect.objectContaining({
      maxQuestionsPerTurn: 1,
      voluntaryContinuationAllowed: true,
    }),
  });
});

it("lets deterministic actions control CTA and stale option visibility", () => {
  const state = createInitialProjectState({
    id: "conversation-ui-policy",
    name: "Becak",
    rawIdea: "Aplikasi becak online",
  });

  expect(
    conversationUiState(state, { type: "CREATE_SPEC" }),
  ).toMatchObject({
    draftSpecReady: true,
    showQuestionOptions: false,
    showDraftSpecCta: true,
    openSpecWorkbench: true,
  });
  expect(
    conversationUiState(state, { type: "OPEN_DESIGN" }),
  ).toMatchObject({ openDesignWorkbench: false });

  state.draftSpecReady = true;
  expect(
    conversationUiState(state, { type: "OPEN_DESIGN" }),
  ).toMatchObject({
    draftSpecReady: true,
    openDesignWorkbench: true,
    showQuestionOptions: false,
  });
});
