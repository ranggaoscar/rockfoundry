import { describe, expect, it } from "vitest";
import {
  ConversationAgentResponseSchema,
  applyConversationResponse,
  applyConversationResponseWithPolicy,
  createInitialProjectState,
  evaluateReadinessDirectly,
  renderArtifacts,
  type ConversationAgentResponse,
  enforceConversationQuestionPolicy,
  explicitProductRulesFromUserMessage,
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
  it("records explicit user authorization and lifecycle rules without trusting a model paraphrase", () => {
    const state = createInitialProjectState({
      id: "conversation-explicit-rules",
      name: "Marketplace",
      rawIdea: "Marketplace pesanan lokal",
    });
    const instruction =
      "Only the seller/owner can confirm an order. Customers cannot edit an order after payment.";

    const next = applyConversationResponse(
      state,
      conversationDelta({
        message:
          "I understand the owner should control confirmation and customer edits should be locked.",
      }),
      instruction,
    );

    expect(next.businessRules).toEqual([
      "Only the seller/owner can confirm an order.",
      "Customers cannot edit an order after payment.",
    ]);
    expect(next.provenance).toMatchObject({
      ["businessRules.Only the seller/owner can confirm an order."]: {
        source: "USER",
        confidence: "EXPLICIT",
        evidence: "Only the seller/owner can confirm an order.",
      },
      ["businessRules.Customers cannot edit an order after payment."]: {
        source: "USER",
        confidence: "EXPLICIT",
        evidence: "Customers cannot edit an order after payment.",
      },
    });
    expect(next.businessRules).not.toContain(
      "Owner should control confirmation and customer edits should be locked.",
    );
  });

  it("records natural negative permission rules verbatim in English and Indonesian", () => {
    const state = createInitialProjectState({
      id: "conversation-natural-explicit-rules",
      name: "Orders",
      rawIdea: "Manage customer orders",
    });
    const instruction =
      "Customers must not be able to edit an order after payment. Customers are not allowed to edit an order after payment. Pelanggan tidak diizinkan untuk mengubah pesanan setelah pembayaran.";

    const next = applyConversationResponse(
      state,
      conversationDelta({ message: "Rules recorded." }),
      instruction,
    );

    expect(next.businessRules).toEqual([
      "Customers must not be able to edit an order after payment.",
      "Customers are not allowed to edit an order after payment.",
      "Pelanggan tidak diizinkan untuk mengubah pesanan setelah pembayaran.",
    ]);
    expect(next.provenance).toMatchObject({
      ["businessRules.Customers must not be able to edit an order after payment."]:
        {
          source: "USER",
          confidence: "EXPLICIT",
          evidence:
            "Customers must not be able to edit an order after payment.",
        },
      ["businessRules.Pelanggan tidak diizinkan untuk mengubah pesanan setelah pembayaran."]:
        {
          source: "USER",
          confidence: "EXPLICIT",
          evidence:
            "Pelanggan tidak diizinkan untuk mengubah pesanan setelah pembayaran.",
        },
      ["businessRules.Customers are not allowed to edit an order after payment."]:
        {
          source: "USER",
          confidence: "EXPLICIT",
          evidence:
            "Customers are not allowed to edit an order after payment.",
        },
    });
  });

  it("does not infer product rules from advisory wording", () => {
    expect(
      explicitProductRulesFromUserMessage(
        "Customers should not edit orders after payment.",
      ),
    ).toEqual([]);
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
  it("rejects unrelated decision topics and corrections without existing replacements", () => {
    const state = createInitialProjectState({
      id: "grounding-decision-correction-safety",
      name: "Laundry",
      rawIdea: "Laundry pickup",
    });
    state.roles = ["courier"];
    const next = applyConversationResponse(
      state,
      conversationDelta({
        stateDelta: {
          confirmedDecisions: [
            {
              topic: "unrelated_topic",
              decision: "laundry pickup",
              evidence: "laundry pickup",
              affects: [],
            },
          ],
          corrections: [
            {
              path: "roles",
              value: "owner",
              replaces: "missing role",
              evidence: "owner replaces missing role",
            },
          ],
        },
      }),
      "laundry pickup; owner replaces missing role",
    );

    expect(next.decisions).toEqual([]);
    expect(next.roles).toEqual(["courier"]);
    expect(next.generationMetadata.conversationCorrections).toBeUndefined();
  });

  it("drops unknown canonical paths even when their evidence is grounded", () => {
    const state = createInitialProjectState({
      id: "grounding-unknown-path",
      name: "Laundry",
      rawIdea: "Laundry pickup",
    });
    const next = applyConversationResponse(
      state,
      conversationDelta({
        stateDelta: {
          explicitFacts: [
            { path: "inventedField", value: "laundry pickup", evidence: "laundry pickup" },
          ],
        },
      }),
      "laundry pickup",
    );

    expect(next).not.toHaveProperty("inventedField");
    expect(next.provenance).not.toHaveProperty("inventedField");
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
            { path: "targetUsers", value: "owner", evidence: "Owner-only MVP" },
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
  it("rejects cryptocurrency wallet as a feature when only evidence is unrelated", () => {
    const state = createInitialProjectState({
      id: "grounding-semantic-negative",
      name: "Becak",
      rawIdea: "Aplikasi becak online",
    });
    const next = applyConversationResponse(
      state,
      conversationDelta({
        stateDelta: {
          explicitFacts: [
            { path: "features", value: "cryptocurrency wallet", evidence: "satu kota dulu" },
          ],
        },
      }),
      "penumpang booking becak online di satu kota dulu",
    );

    expect(next.features).toEqual([]);
    expect(next.generationMetadata.groundedUserFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "features",
          proposedValue: "cryptocurrency wallet",
          evidence: "satu kota dulu",
        }),
      ]),
    );
    expect(evaluateReadinessDirectly(next).draftSpecReady).toBe(false);
  });
  it("keeps rejected grounded facts neutral through policy application", () => {
    const state = createInitialProjectState({
      id: "grounding-policy-negative",
      name: "Becak",
      rawIdea: "Aplikasi becak online",
    });
    const applied = applyConversationResponseWithPolicy(
      state,
      conversationDelta({
        stateDelta: {
          explicitFacts: [
            { path: "features", value: "cryptocurrency wallet", evidence: "satu kota dulu" },
          ],
        },
      }),
      "penumpang booking becak online di satu kota dulu",
    );

    expect(applied.state.features).toEqual([]);
    expect(applied.state.generationMetadata.groundedUserFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "features",
          proposedValue: "cryptocurrency wallet",
          evidence: "satu kota dulu",
        }),
      ]),
    );
    expect(applied.readiness.draftSpecReady).toBe(false);
  });
  it("retains grounded unrelated evidence in the neutral ledger", () => {
    const state = createInitialProjectState({
      id: "grounding-neutral-ledger",
      name: "Becak",
      rawIdea: "Aplikasi becak online",
    });
    const next = applyConversationResponse(
      state,
      conversationDelta({
        stateDelta: {
          explicitFacts: [
            { path: "features", value: "cryptocurrency wallet", evidence: "wallet booking becak" },
          ],
        },
      }),
      "penumpang menggunakan wallet booking becak di satu kota dulu",
    );

    expect(next.features).toEqual([]);
    expect(next.generationMetadata.groundedUserFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "features",
          proposedValue: "cryptocurrency wallet",
          evidence: "wallet booking becak",
        }),
      ]),
    );
  });
  it("rejects unsupported grounded decision normalization into accepted state", () => {
    const state = createInitialProjectState({
      id: "grounding-decision-negative",
      name: "Becak",
      rawIdea: "Aplikasi becak online",
    });
    const next = applyConversationResponse(
      state,
      conversationDelta({
        stateDelta: {
          confirmedDecisions: [
            {
              topic: "service_area",
              decision: "cryptocurrency wallet",
              evidence: "satu kota dulu",
              affects: ["features"],
            },
          ],
        },
      }),
      "penumpang booking becak online di satu kota dulu",
    );

    expect(next.decisions).toEqual([]);
    expect(next.provenance).not.toHaveProperty("decision.service_area");
    expect(next.generationMetadata.groundedUserFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "decision.service_area",
          proposedValue: "cryptocurrency wallet",
          evidence: "satu kota dulu",
        }),
      ]),
    );
    expect(evaluateReadinessDirectly(next).draftSpecReady).toBe(false);
  });


  it("keeps unsupported role normalization in neutral grounded facts", () => {
    const state = createInitialProjectState({
      id: "grounding-semantic-role-negative",
      name: "Becak",
      rawIdea: "Aplikasi becak online",
    });

    const next = applyConversationResponse(
      state,
      conversationDelta({
        stateDelta: {
          explicitFacts: [
            { path: "roles", value: "driver becak", evidence: "pengemudi becak" },
          ],
        },
      }),
      "pengemudi becak melayani penumpang",
    );

    expect(next.roles).toEqual([]);
    expect(next.provenance).not.toHaveProperty("roles.driver becak");
    expect(next.generationMetadata.groundedUserFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "roles",
          proposedValue: "driver becak",
          evidence: "pengemudi becak",
        }),
      ]),
    );
  });

  it("keeps unsupported laundry normalization neutral", () => {
    const state = createInitialProjectState({
      id: "laundry-grounding-negative",
      name: "Laundry Pickup",
      rawIdea: "Aplikasi laundry untuk pickup terjadwal",
    });
    const latestUserMessage =
      "Pemilik laundry menerima pesanan dan jemput cucian setiap selasa di area kecamatan.";
    const next = applyConversationResponse(
      state,
      conversationDelta({
        stateDelta: {
          explicitFacts: [
            { path: "objectives", value: "mengatur pickup", evidence: "menerima pesanan" },
            { path: "workflows", value: "pickup terjadwal", evidence: "jemput cucian setiap selasa" },
            { path: "entities", value: "pesanan laundry", evidence: "pesanan" },
          ],
        },
      }),
      latestUserMessage,
    );

    expect(next.objectives).toEqual([]);
    expect(next.workflows).toEqual([]);
    expect(next.entities).toEqual([]);
    expect(next.generationMetadata.groundedUserFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "objectives", proposedValue: "mengatur pickup", evidence: "menerima pesanan" }),
        expect.objectContaining({ path: "workflows", proposedValue: "pickup terjadwal", evidence: "jemput cucian setiap selasa" }),
        expect.objectContaining({ path: "entities", proposedValue: "pesanan laundry", evidence: "pesanan" }),
      ]),
    );
    expect(evaluateReadinessDirectly(next).draftSpecReady).toBe(false);
  });

  it("preserves directly supported laundry facts through readiness and artifacts", () => {
    const state = createInitialProjectState({
      id: "laundry-grounding-fallback",
      name: "Laundry Pickup",
      rawIdea: "Aplikasi laundry untuk pickup terjadwal",
    });
    const latestUserMessage =
      "Pemilik laundry menerima pesanan dan jemput cucian setiap selasa di area kecamatan.";
    const next = applyConversationResponse(
      state,
      conversationDelta({
        stateDelta: {
          explicitFacts: [
            { path: "targetUsers", value: "pemilik laundry", evidence: "Pemilik laundry" },
            { path: "objectives", value: "menerima pesanan", evidence: "menerima pesanan" },
            { path: "workflows", value: "jemput cucian setiap selasa", evidence: "jemput cucian setiap selasa" },
            { path: "entities", value: "pesanan laundry", evidence: "pesanan laundry" },
            { path: "constraints", value: "area kecamatan", evidence: "area kecamatan" },
          ],
          confirmedDecisions: [
            {
              topic: "pickup_schedule",
              decision: "jemput cucian setiap selasa",
              evidence: "jemput cucian setiap selasa",
              affects: ["workflows"],
            },
          ],
        },
      }),
      latestUserMessage,
    );
    const readiness = evaluateReadinessDirectly(next);
    const docs = renderArtifacts({
      ...next,
      readiness: readiness.level,
      readinessScore: readiness.score,
    });

    expect(next.workflows).toContain("jemput cucian setiap selasa");
    expect(next.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topic: "pickup_schedule",
          decision: "jemput cucian setiap selasa",
          status: "ACCEPTED",
        }),
      ]),
    );
    expect(next.provenance["workflows.jemput cucian setiap selasa"]).toMatchObject({
      source: "USER",
      confidence: "EXPLICIT",
      evidence: "jemput cucian setiap selasa",
    });
    expect(next.provenance["decision.pickup_schedule"]).toMatchObject({
      source: "USER",
      confidence: "EXPLICIT",
      evidence: "jemput cucian setiap selasa",
    });
    expect(readiness.draftSpecReady).toBe(true);
    expect(readiness.score).toBeGreaterThan(0);
    expect(docs.PRD).toContain("jemput cucian setiap selasa");
    expect(docs.DECISIONS).toContain("jemput cucian setiap selasa");
  });

  it("accepts directly grounded dispatch evidence and rejects unrelated values", () => {
    const state = createInitialProjectState({
      id: "dispatch-normalization",
      name: "Becak",
      rawIdea: "Aplikasi becak online",
    });
    const next = applyConversationResponse(
      state,
      conversationDelta({
        stateDelta: {
          explicitFacts: [
            {
              path: "workflows",
              value: "kebeberapa driver yg online, dan siapa yg mau menerima",
              evidence: "kebeberapa driver yg online, dan siapa yg mau menerima",
            },
            {
              path: "workflows",
              value: "cryptocurrency settlement",
              evidence: "kebeberapa driver yg online, dan siapa yg mau menerima",
            },
          ],
          confirmedDecisions: [
            {
              topic: "dispatch_strategy",
              decision: "kebeberapa driver yg online, dan siapa yg mau menerima",
              evidence: "kebeberapa driver yg online, dan siapa yg mau menerima",
              affects: ["workflows"],
            },
          ],
        },
      }),
      "kebeberapa driver yg online, dan siapa yg mau menerima",
    );
    expect(next.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topic: "dispatch_strategy",
          decision: "kebeberapa driver yg online, dan siapa yg mau menerima",
          status: "ACCEPTED",
        }),
      ]),
    );
    expect(next.workflows).toEqual(["kebeberapa driver yg online, dan siapa yg mau menerima"]);
    expect(next.generationMetadata.groundedUserFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "workflows",
          proposedValue: "cryptocurrency settlement",
          evidence: "kebeberapa driver yg online, dan siapa yg mau menerima",
        }),
      ]),
    );
  });

  it("keeps unsupported dispatch normalization neutral", () => {
    const state = createInitialProjectState({
      id: "dispatch-normalization-negative",
      name: "Becak",
      rawIdea: "Aplikasi becak online",
    });
    const latestUserMessage = "kebeberapa driver yg online, dan siapa yg mau menerima";
    const next = applyConversationResponse(
      state,
      conversationDelta({
        stateDelta: {
          explicitFacts: [
            {
              path: "workflows",
              value: "order ditawarkan ke beberapa driver online",
              evidence: latestUserMessage,
            },
          ],
          confirmedDecisions: [
            {
              topic: "dispatch_strategy",
              decision: "order ditawarkan ke beberapa driver online",
              evidence: latestUserMessage,
              affects: ["workflows"],
            },
          ],
        },
      }),
      latestUserMessage,
    );

    expect(next.workflows).toEqual([]);
    expect(next.decisions).toEqual([]);
    expect(next.provenance).not.toHaveProperty("decision.dispatch_strategy");
    expect(next.generationMetadata.groundedUserFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "workflows",
          proposedValue: "order ditawarkan ke beberapa driver online",
          evidence: latestUserMessage,
        }),
        expect.objectContaining({
          path: "decision.dispatch_strategy",
          proposedValue: "order ditawarkan ke beberapa driver online",
          evidence: latestUserMessage,
        }),
      ]),
    );
  });

  it("grounds the becak conversation into readiness and faithful rendered artifacts", () => {
    let state = createInitialProjectState({
      id: "becak-real-conversation",
      name: "Becak Online",
      rawIdea: "saya mau buat aplikasi becak online",
    });
    const first = conversationDelta({
      mode: "BRAINSTORM",
      stateDelta: {
        explicitFacts: [{ path: "targetUsers", value: "penumpang", evidence: "penumpang" }],
        resolvedQuestions: [],
      },
      suggestedNextAction: {
        type: "ASK_CONTEXTUAL_QUESTION",
        question: "Untuk awal, layanan ini dibatasi di satu kota atau langsung lintas kota?",
        quickReplies: [],
      },
    });
    state = applyConversationResponse(state, first, "penumpang butuh booking becak online");
    const second = conversationDelta({
      mode: "CLARIFICATION",
      stateDelta: {
        explicitFacts: [
          { path: "features", value: "booking becak online", evidence: "booking becak online" },
          { path: "workflows", value: "penumpang booking perjalanan", evidence: "penumpang booking perjalanan" },
          { path: "constraints", value: "satu kota dulu", evidence: "satu kota dulu" },
          { path: "roles", value: "driver becak", evidence: "driver becak" },
        ],
        resolvedQuestions: [
          {
            question: "Untuk awal, layanan ini dibatasi di satu kota atau langsung lintas kota?",
            evidence: "satu kota dulu",
          },
        ],
        confirmedDecisions: [
          { topic: "service_area", decision: "satu kota dulu", evidence: "satu kota dulu", affects: ["constraints"] },
        ],
      },
      suggestedNextAction: { type: "CREATE_SPEC" },
    });
    state = applyConversationResponse(
      state,
      second,
      "driver becak menerima penumpang booking perjalanan di satu kota dulu dengan booking becak online",
    );
    const readiness = evaluateReadinessDirectly(state);
    const docs = renderArtifacts({ ...state, readiness: readiness.level, readinessScore: readiness.score });
    expect(state.targetUsers).toContain("penumpang");
    expect(state.roles).toContain("driver becak");
    expect(state.workflows).toContain("penumpang booking perjalanan");
    expect(state.features).toContain("booking becak online");
    expect(state.constraints).toContain("satu kota dulu");
    expect(state.decisions).toEqual(expect.arrayContaining([expect.objectContaining({ decision: "satu kota dulu" })]));
    expect(readiness.score).toBeGreaterThan(0);
    expect(docs.PRD).toContain("booking becak online");
    expect(docs.PRD).toContain("driver becak");
    expect(docs.DECISIONS).toContain("satu kota dulu");
    expect(state.openQuestions).not.toContain("Untuk awal, layanan ini dibatasi di satu kota atau langsung lintas kota?");
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
