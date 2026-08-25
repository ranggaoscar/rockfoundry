import { describe, expect, it } from "vitest";
import {
  ConversationAgentResponseSchema,
  applyConversationResponse,
  createInitialProjectState,
  type ConversationAgentResponse,
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
