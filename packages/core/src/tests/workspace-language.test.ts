import { describe, expect, it } from "vitest";
import {
  createInitialProjectState,
  detectConversationLanguage,
  detectDiscoveryDomain,
  extractStructuralContext,
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
