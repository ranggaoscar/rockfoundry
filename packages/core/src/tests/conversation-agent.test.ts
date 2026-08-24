import { describe, expect, it } from "vitest";
import {
  ConversationAgentResponseSchema,
  applyConversationResponse,
  createInitialProjectState,
} from "../index";

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
    });

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

    const next = applyConversationResponse(state, {
      message: "Oke, owner saja untuk MVP.",
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
            evidence: "User explicitly limited MVP to owner-only.",
          },
        ],
      },
      proposals: [],
      assumptions: [],
      unresolvedRisks: [],
      suggestedNextAction: { type: "CREATE_SPEC" },
    });

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
});
