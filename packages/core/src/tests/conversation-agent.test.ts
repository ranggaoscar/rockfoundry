import { describe, expect, it } from "vitest";
import {
  ConversationAgentResponseSchema,
  applyConversationResponse,
  applyConversationResponseWithPolicy,
  createInitialProjectState,
  type ConversationAgentResponse,
  enforceConversationQuestionPolicy,
} from "../index";

function conversationDelta(
  overrides: Record<string, unknown> = {},
): ConversationAgentResponse {
  return {
    message: "Model-authored response",
    mode: "CLARIFICATION",
    quickReplies: [],
    stateDelta: {
      explicitFacts: [],
      confirmedDecisions: [],
      corrections: [],
      resolvedQuestions: [],
      resolvedAssumptions: [],
      ...(overrides.stateDelta || {}),
    },
    proposals: [],
    assumptions: [],
    unresolvedRisks: [],
    suggestedNextAction: { type: "NONE" },
    ...overrides,
  } as ConversationAgentResponse;
}

describe("Conversation Agent contract", () => {
  it("accepts a useful natural response without a deterministic question", () => {
    const response = ConversationAgentResponseSchema.parse({
      message:
        "Mulai dari transaksi masuk dan keluar, kategori, saldo kas, dan histori. Untuk MVP belum perlu role atau approval.",
      mode: "BRAINSTORM",
      stateDelta: {
        explicitFacts: [],
        confirmedDecisions: [],
        corrections: [],
        resolvedQuestions: [],
        resolvedAssumptions: [],
      },
      proposals: [],
      assumptions: [],
      unresolvedRisks: [],
      suggestedNextAction: {
        type: "ASK_CONTEXTUAL_QUESTION",
        question: "Ini untuk keuangan pribadi atau usaha kecil?",
        quickReplies: [],
      },
    });

    expect(response.message).toContain("transaksi");
    expect(response.quickReplies).toEqual([]);
    if (response.suggestedNextAction.type !== "ASK_CONTEXTUAL_QUESTION") {
      throw new Error("Expected a contextual question action");
    }
    expect(response.suggestedNextAction.question).toContain("pribadi");
  });

  it("keeps AI proposals out of accepted canonical decisions", () => {
    const state = createInitialProjectState({
      id: "conversation-proposal",
      name: "Cashflow",
      rawIdea: "Catat uang masuk keluar",
    });

    const next = applyConversationResponse(state, {
      message: "Untuk MVP gua merekomendasikan owner-only.",
      mode: "BRAINSTORM",
      quickReplies: [],
      stateDelta: {
        explicitFacts: [],
        confirmedDecisions: [],
        corrections: [],
        resolvedQuestions: [],
        resolvedAssumptions: [],
      },
      proposals: [
        {
          topic: "role_scope",
          statement: "MVP hanya dipakai owner.",
          reason: "Mengurangi kompleksitas awal.",
          affects: ["permissions"],
        },
      ],
      assumptions: [],
      unresolvedRisks: [],
      suggestedNextAction: { type: "CREATE_SPEC" },
    }, "Untuk MVP gua merekomendasikan owner-only.");

    expect(next.decisions).toEqual([]);
    expect(next.generationMetadata.conversationProposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ topic: "role_scope", status: "PROPOSED" }),
      ]),
    );
  });
  it("records explicit confirmation and preserves correction history", () => {
    const state = createInitialProjectState({
      id: "conversation-correction",
      name: "Cashflow",
      rawIdea: "Catat uang masuk keluar",
    });
    state.roles = ["owner", "employee"];
    state.provenance["roles.employee"] = {
      source: "AGENT_INFERENCE",
      confidence: "STRONGLY_INFERRED",
      evidence: "Initial context implied a small team.",
    };

    const next = applyConversationResponse(
      state,
      {
        message: "Oke, owner saja untuk MVP; employee diganti.",
        mode: "CORRECTION",
        quickReplies: [],
        stateDelta: {
          explicitFacts: [],
          confirmedDecisions: [],
          corrections: [
            {
              path: "roles",

              value: "owner",
              replaces: "employee",
              evidence: "owner saja untuk MVP",
            },
          ],
          resolvedQuestions: [],
          resolvedAssumptions: [],
        },
        proposals: [],
        assumptions: [],
        unresolvedRisks: [],
        suggestedNextAction: { type: "CREATE_SPEC" },
      },
      "Oke, owner saja untuk MVP; employee diganti.",
    );


    expect(next.roles).toEqual(["owner"]);
    expect(next.provenance["roles.owner"]).toMatchObject({
      source: "USER",
      confidence: "EXPLICIT",
    });
    expect(next.generationMetadata.conversationCorrections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "roles", from: "employee", to: "owner" }),
      ]),
    );
  });

  it("rejects forged evidence for every canonical state delta", () => {
    const state = createInitialProjectState({
      id: "grounding-forged",
      name: "Cashflow",
      rawIdea: "Catat uang masuk keluar",
    });
    state.roles = ["employee"];
    state.openQuestions = ["Siapa yang memiliki akses?"];
    state.assumptions = [
      {
        id: "assumption-owner",
        statement: "MVP hanya untuk owner",
        confidence: "STRONGLY_INFERRED",
        impact: "MEDIUM",
        source: "AGENT_INFERENCE",
        resolved: false,
      },
    ];

    const next = applyConversationResponse(
      state,
      conversationDelta({
        stateDelta: {
          explicitFacts: [
            { path: "targetUsers", value: "owner", evidence: "assistant says owner" },
          ],
          confirmedDecisions: [
            {
              topic: "role_scope",
              decision: "owner-only",
              evidence: "assistant says owner-only",
            },
          ],
          corrections: [
            {
              path: "roles",
              value: "owner",
              replaces: "employee",
              evidence: "assistant says owner",
            },
          ],
          resolvedQuestions: [
            {
              question: "Siapa yang memiliki akses?",
              evidence: "assistant says access is owner-only",
            },
          ],
          resolvedAssumptions: [
            {
              statement: "MVP hanya untuk owner",
              resolution: "Confirmed",
              evidence: "assistant says owner-only",
            },
          ],
        },
      }),
      "Tampilkan histori transaksi bulanan.",
    );

    expect(next.targetUsers).toEqual([]);
    expect(next.decisions).toEqual([]);
    expect(next.roles).toEqual(["employee"]);
    expect(next.openQuestions).toEqual(["Siapa yang memiliki akses?"]);
    expect(next.assumptions[0]?.resolved).toBe(false);
    expect(Object.values(next.provenance)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "USER", confidence: "EXPLICIT" }),
      ]),
    );
    expect(next.generationMetadata.conversationResolutions).toBeUndefined();
  });

  it("applies grounded deltas after Unicode, whitespace, and punctuation normalization", () => {
    const state = createInitialProjectState({
      id: "grounding-valid",
      name: "Cashflow",
      rawIdea: "Catat uang masuk keluar",
    });
    state.roles = ["employee"];
    state.openQuestions = ["Siapa yang memiliki akses?"];
    state.assumptions = [
      {
        id: "assumption-owner",
        statement: "MVP hanya untuk owner",
        confidence: "STRONGLY_INFERRED",
        impact: "MEDIUM",
        source: "AGENT_INFERENCE",
        resolved: false,
      },
    ];

    const next = applyConversationResponse(
      state,
      conversationDelta({
        stateDelta: {
          explicitFacts: [
            { path: "targetUsers", value: "owner", evidence: " OＷＮＥＲ-only   MVP " },
          ],
          confirmedDecisions: [
            {
              topic: "cashflow scope",
              decision: "staff records transactions",
              evidence: "staff records transactions",
            },
          ],
          corrections: [
            {
              path: "roles",
              value: "owner",
              replaces: "employee",
              evidence: "owner-only",
            },
          ],
          resolvedQuestions: [
            {
              question: "Siapa yang memiliki akses?",
              evidence: "transactions weekly",
            },
          ],
          resolvedAssumptions: [
            {
              statement: "MVP hanya untuk owner",
              resolution: "Confirmed",
              evidence: "staff records transactions",
            },
          ],
        },
      }),
      "Cashflow scope: Owner-only MVP; employee roles become owner; staff records transactions weekly.",
    );

    expect(next.targetUsers).toEqual(["owner"]);
    expect(next.roles).toEqual(["owner"]);
    expect(next.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ topic: "cashflow scope", status: "ACCEPTED" }),
      ]),
    );
    expect(next.openQuestions).toEqual([]);
    expect(next.assumptions[0]?.resolved).toBe(true);
    expect(next.provenance["targetUsers.owner"]).toMatchObject({
      source: "USER",
      confidence: "EXPLICIT",
    });
    expect(next.provenance["decision.cashflow scope"]).toMatchObject({
      source: "USER",
      confidence: "EXPLICIT",
    });
    expect(next.generationMetadata.conversationResolutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "QUESTION", source: "USER", confidence: "EXPLICIT" }),
        expect.objectContaining({ kind: "ASSUMPTION", source: "USER", confidence: "EXPLICIT" }),
      ]),
    );
  });

  it("only resolves assumptions that existed before the response", () => {
    const state = createInitialProjectState({
      id: "assumption-resolution-boundary",
      name: "Cashflow",
      rawIdea: "Catat uang masuk keluar",
    });
    state.assumptions = [
      {
        id: "existing-assumption",
        statement: "MVP hanya untuk owner",
        confidence: "STRONGLY_INFERRED",
        impact: "MEDIUM",
        source: "AGENT_INFERENCE",
        resolved: false,
      },
    ];

    const next = applyConversationResponse(
      state,
      conversationDelta({
        assumptions: [
          {
            statement: "MVP hanya untuk driver",
            confidence: "STRONGLY_INFERRED",
            impact: "MEDIUM",
          },
        ],
        stateDelta: {
          resolvedAssumptions: [
            {
              statement: "MVP hanya untuk driver",
              resolution: "Confirmed",
              evidence: "driver MVP",
            },
            {
              statement: "MVP hanya untuk owner",
              resolution: "Confirmed",
              evidence: "owner MVP",
            },
          ],
        },
      }),
      "driver MVP, owner MVP; MVP hanya untuk owner",
    );

    expect(next.assumptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ statement: "MVP hanya untuk driver", resolved: false }),
        expect.objectContaining({ statement: "MVP hanya untuk owner", resolved: true }),
      ]),
    );
  });
});

  it("rejects normalized duplicate contextual questions and suppresses asks after draft readiness", () => {
    const state = createInitialProjectState({
      id: "conversation-question-policy",
      name: "Becak",
      rawIdea: "Aplikasi becak online",
    });
    state.openQuestions = ["Siapa pengguna utama aplikasi ini?"];

    const duplicate = enforceConversationQuestionPolicy(
      conversationDelta({
        suggestedNextAction: {
          type: "ASK_CONTEXTUAL_QUESTION",
          question: "  Siapa   pengguna utama aplikasi ini? ",
          quickReplies: [],
        },
      }),
      state,
    );
    expect(duplicate.suggestedNextAction).toEqual({ type: "NONE" });

    state.draftSpecReady = true;
    const ready = enforceConversationQuestionPolicy(
      conversationDelta({
        suggestedNextAction: {
          type: "ASK_CONTEXTUAL_QUESTION",
          question: "Driver dipilih otomatis atau manual?",
          quickReplies: [],
        },
      }),
      state,
    );
    expect(ready.suggestedNextAction).toEqual({ type: "CREATE_SPEC" });
  });

  it("deduplicates contextual questions when applying a response", () => {
    const state = createInitialProjectState({
      id: "conversation-question-apply",
      name: "Becak",
      rawIdea: "Aplikasi becak online",
    });
    state.openQuestions = ["Driver dipilih otomatis atau manual?"];

    const next = applyConversationResponse(
      state,
      conversationDelta({
        suggestedNextAction: {
          type: "ASK_CONTEXTUAL_QUESTION",
          question: "driver   dipilih otomatis atau manual?",
          quickReplies: [],
        },
      }),
      "Saya masih memikirkan alur booking.",
    );

    expect(next.openQuestions).toEqual(["Driver dipilih otomatis atau manual?"]);
  });

it("returns CREATE_SPEC and removes a stale ask after this turn becomes draft-ready", () => {
  const state = createInitialProjectState({
    id: "conversation-post-turn-ready",
    name: "Becak Online",
    rawIdea: "Saya mau buat aplikasi becak online",
  });
  state.roles = ["driver becak"];
  state.entities = ["booking", "pangkalan becak"];
  const latestUserMessage =
    "penumpang booking perjalanan booking becak online satu kota dulu";
  const response = conversationDelta({
    stateDelta: {
      explicitFacts: [
        { path: "targetUsers", value: "penumpang", evidence: "penumpang" },
        { path: "objectives", value: "booking perjalanan", evidence: "booking perjalanan" },
        { path: "features", value: "booking becak online", evidence: "booking becak online" },
        { path: "workflows", value: "penumpang booking becak", evidence: "penumpang booking becak" },
        { path: "constraints", value: "satu kota dulu", evidence: "satu kota dulu" },
      ],
    },
    suggestedNextAction: {
      type: "ASK_CONTEXTUAL_QUESTION",
      question: "Driver dipilih otomatis atau manual?",
      quickReplies: [],
    },
  });

  const applied = applyConversationResponseWithPolicy(
    state,
    response,
    latestUserMessage,
  );

  expect(applied.readiness.draftSpecReady).toBe(true);
  expect(applied.response.suggestedNextAction).toEqual({ type: "CREATE_SPEC" });
  expect(applied.state.openQuestions).not.toContain(
    "Driver dipilih otomatis atau manual?",
  );
});
it("keeps timeout cancellation and payment open while recording a soft clarification advisory", () => {
  const state = createInitialProjectState({
    id: "conversation-soft-advisory",
    name: "Becak Online",
    rawIdea: "Aplikasi becak online",
  });
  const response = conversationDelta({
    unresolvedRisks: [
      { topic: "timeout", title: "Booking timeout", reason: "Belum diputuskan.", priority: 8 },
      { topic: "cancellation", title: "Cancellation handling", reason: "Belum diputuskan.", priority: 8 },
      { topic: "payment", title: "Payment responsibility", reason: "Belum diputuskan.", priority: 8 },
    ],
    proposals: [
      {
        topic: "payment",
        statement: "Payment policy remains open.",
        reason: "Needs an explicit product decision.",
        affects: ["payment"],
      },
    ],
    suggestedNextAction: {
      type: "ASK_CONTEXTUAL_QUESTION",
      question: "Driver dipilih otomatis atau manual?",
      quickReplies: [],
    },
  });

  const applied = applyConversationResponseWithPolicy(
    state,
    response,
    "Saya masih merancang alur booking.",
  );
  const advisory = applied.state.generationMetadata.conversationClarificationAdvisory;

  expect(advisory).toMatchObject({
    maxQuestionsPerTurn: 1,
    requestedThisTurn: 1,
    voluntaryContinuationAllowed: true,
    unresolvedDetailTopics: ["timeout", "cancellation", "payment"],
  });
  expect(applied.state.risks).toEqual(
    expect.arrayContaining([
      "Booking timeout: Belum diputuskan.",
      "Cancellation handling: Belum diputuskan.",
      "Payment responsibility: Belum diputuskan.",
    ]),
  );
  expect(applied.state.generationMetadata.conversationProposals).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ topic: "payment", status: "PROPOSED" }),
    ]),
  );
  expect(applied.readiness.blocking).toEqual([]);
});
