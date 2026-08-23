import { describe, expect, it } from "vitest";
import {
  createInitialProjectState,
  detectConversationLanguage,
  detectDiscoveryDomain,
  extractStructuralContext,
  genericQuestionForTopic,
  QuestionEngine,
} from "../index";

describe("workspace language and question presentation", () => {
  it("treats short Indonesian ideas as Indonesian", () => {
    expect(detectConversationLanguage("bangun web jualan mobil")).toBe("id");
    expect(
      detectConversationLanguage(
        "Gua mau bikin platform penitipan hewan. Ada customer, pet, room, booking.",
      ),
    ).toBe("id");
  });

  it("does not treat a short sales idea as the rental beachhead", () => {
    const state = createInitialProjectState({
      id: "car-sales",
      name: "Bangun Web Jualan Mobil",
      rawIdea: "bangun web jualan mobil",
    });
    expect(detectDiscoveryDomain(state)).toBe("GENERAL");
  });

  it("does not interpolate the project title into a monetization template", () => {
    const state = createInitialProjectState({
      id: "car-sales",
      name: "Bangun Web Jualan Mobil",
      rawIdea: "bangun web jualan mobil",
    });
    const first = new QuestionEngine().generateQuestions(state, [], 1)[0];
    expect(first).toBeTruthy();
    expect(first!.text).not.toMatch(/How does .+ plan to make money/i);
    expect(first!.text).not.toContain(state.name);
    expect(first!.text.toLowerCase()).toMatch(
      /mobil|produk|tertarik|hasil utama/,
    );
  });

  it("extracts a product noun from a short idea without mutating canonical state", () => {
    const state = createInitialProjectState({
      id: "short",
      name: "New project",
      rawIdea: "bangun web jualan mobil",
    });
    const context = extractStructuralContext(state);
    expect(context.language).toBe("id");
    expect(
      context.entities.some((item) => item.value.toLowerCase() === "mobil"),
    ).toBe(true);
    expect(state.entities).toEqual([]);
  });

  it("renders natural Indonesian discovery copy without internal enums or verb entities", () => {
    const idea =
      "Saya mau membuat aplikasi kasir untuk warteg supaya pesanan dan pembayaran lebih mudah dicatat.";
    let state = createInitialProjectState({
      id: "warteg-kasir",
      name: "Kasir Warteg",
      rawIdea: idea,
    });
    const engine = new QuestionEngine();
    const context = extractStructuralContext(state);
    expect(context.language).toBe("id");
    expect(
      context.entities.map((item) => item.value.toLowerCase()),
    ).not.toContain("membuat");
    expect(
      context.entities.map((item) => item.value.toLowerCase()).join(" "),
    ).not.toMatch(/membuat,\s*kasir,\s*warteg/);

    // Simulate previously accepted generic decisions that used to leak enums,
    // plus a grounded operational entity for ownership relevance.
    state = {
      ...state,
      entities: ["pesanan"],
      roles: ["kasir"],
      decisions: [
        {
          id: "d1",
          topic: "primary_workflow",
          decision: "order_first",
          status: "ACCEPTED",
          reason: "test",
          source: "USER",
          confidence: "EXPLICIT",
          affects: ["workflow"],
        },
        {
          id: "d2",
          topic: "lifecycle_transitions",
          decision: "simple_lifecycle",
          status: "ACCEPTED",
          reason: "test",
          source: "USER",
          confidence: "EXPLICIT",
          affects: ["states"],
        },
      ],
      workflows: [
        "Primary workflow outcome: order_first",
        "Lifecycle transition rule: simple_lifecycle",
      ],
    };

    const ownership = genericQuestionForTopic(state, "ownership_boundary");
    expect(ownership).toBeTruthy();
    const text = ownership!.text;
    expect(text).toMatch(/siapa|bertanggung jawab|penanggung/i);
    expect(text).not.toMatch(/order_first|simple_lifecycle/i);
    expect(text).not.toMatch(
      /Primary workflow outcome|Lifecycle transition rule/i,
    );
    expect(text).not.toMatch(/membuat,\s*kasir,\s*warteg/i);
    expect(text).not.toMatch(/\bOwnership\b/);
    expect(ownership!.recommendation || "").not.toMatch(
      /order_first|simple_lifecycle|Ownership/i,
    );
    for (const option of ownership!.options || []) {
      expect(option.label).not.toMatch(/order_first|simple_lifecycle|[_]/);
      expect(option.label).not.toMatch(/\bOwnership\b/);
    }

    const impact = engine.processAnswer(
      state,
      ownership!.id,
      ownership!.options?.[0]?.id || "creator_owns",
      ownership!,
    ).impact;
    expect(impact?.headline).toMatch(/Sudah diputuskan|Locked/i);
    expect(impact?.headline + " " + impact?.detail).not.toMatch(
      /order_first|simple_lifecycle/,
    );
  });

  it("uses plain Indonesian for generic discovery copy across archetypes", () => {
    const jargon =
      /\b(record|role|workflow|visibility|assignment|ownership|resource|override|availability|approval boundary|permission|audit trail|money state|retention|deletion|privacy behavior|acceptance criteria|unresolved|duplicate|channel|histori|approve|reject|slot|conflict|refund|dispute|delete|scope|user)\b/i;
    const state = createInitialProjectState({
      id: "plain-id",
      name: "Kasir Warteg",
      rawIdea:
        "Saya mau membuat aplikasi kasir untuk warteg supaya pesanan dan pembayaran lebih mudah dicatat. Ada kasir dan pemilik. Pesanan ditangani kasir. Meja terbatas jadi jadwal bisa bentrok. Pelanggan yang sama kadang muncul dua kali. Perlu riwayat perubahan, nota, dan aturan hapus data lama.",
    });
    state.entities = ["pesanan", "pembayaran", "pelanggan"];
    state.roles = ["kasir", "pemilik"];
    state.workflows = ["mencatat pesanan"];

    const topics = [
      "ownership_boundary",
      "visibility_boundary",
      "lifecycle_transitions",
      "resource_conflict_policy",
      "assignment_behavior",
      "duplicate_semantics",
      "approval_responsibility",
      "money_responsibility",
      "retention_deletion",
    ] as const;

    const examples: Record<string, string> = {};
    for (const topic of topics) {
      const question = genericQuestionForTopic(state, topic);
      expect(question, topic).toBeTruthy();
      expect(question!.topic).toBe(topic);
      const visible = [
        question!.text,
        question!.recommendation || "",
        ...(question!.options || []).flatMap((option) => [
          option.label,
          option.description || "",
        ]),
      ].join("\n");
      examples[topic] = question!.text;
      expect(visible, topic).not.toMatch(jargon);
      expect(
        question!.text.split(/[.?!]/).filter(Boolean).length,
      ).toBeLessThanOrEqual(3);
    }

    const english = createInitialProjectState({
      id: "plain-en",
      name: "Clinic desk",
      rawIdea:
        "I want a clinic desk app with staff, patients, rooms, bookings, payments, and history.",
    });
    english.entities = ["patient", "booking"];
    english.roles = ["staff", "owner"];
    english.workflows = ["book a room"];
    const englishOwnership = genericQuestionForTopic(
      english,
      "ownership_boundary",
    );
    expect(englishOwnership).toBeTruthy();
    expect(englishOwnership!.text).toMatch(/owns the record|responsibility/i);
    expect(englishOwnership!.options?.map((option) => option.id)).toEqual(
      genericQuestionForTopic(state, "ownership_boundary")!.options?.map(
        (option) => option.id,
      ),
    );
    expect(examples.visibility_boundary).toMatch(/siapa yang boleh melihat/i);
    expect(examples.approval_responsibility).toMatch(/menyetujui|menolak/i);
    expect(examples.retention_deletion).toMatch(/berapa lama|dihapus/i);
  });

  it("rejects a second answer to a stale question id at the engine queue level", () => {
    const state = createInitialProjectState({
      id: "crm",
      name: "5-Brand Marble CRM",
      rawIdea:
        "CRM for 5 marble brands, with sales per brand, an owner who sees all, leads from WhatsApp, Instagram, and the website.",
    });
    state.targetUsers = ["Sales team"];
    state.entities = ["Customer", "Quotation", "Brand"];
    state.workflows = ["Capture a lead and schedule a follow-up"];
    const engine = new QuestionEngine();
    const first = engine.generateQuestions(state, [], 1)[0];
    const answered = engine.processAnswer(
      state,
      first.id,
      first.options?.[0]?.id || "company_wide",
      first,
    );
    const next = engine.generateQuestions(answered.updatedState, [], 1)[0];
    expect(next?.id).not.toBe(first.id);
    expect(
      engine
        .generateQuestions(answered.updatedState, [], 5)
        .some((item) => item.id === first.id),
    ).toBe(false);
  });
});
