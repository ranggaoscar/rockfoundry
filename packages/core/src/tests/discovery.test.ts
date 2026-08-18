import { describe, expect, it } from "vitest";
import {
  createInitialProjectState,
  deriveProjectTitle,
  evaluateDiscovery,
  evaluateReadinessDirectly,
  QuestionEngine,
  validateQuestionQuality,
} from "../index";

function project(rawIdea: string) {
  const state = createInitialProjectState({
    id: "fixture",
    name: deriveProjectTitle(rawIdea),
    rawIdea,
  });
  state.targetUsers = ["Sales team"];
  state.entities = ["Customer", "Quotation", "Brand"];
  state.features = ["Track follow-ups", "Manage quotations"];
  state.workflows = ["Capture a lead and schedule a follow-up"];
  return state;
}

describe("Decision Debt discovery", () => {
  it("selects a contextual CRM decision before generic questions", () => {
    const state = project(
      "CRM for 5 marble brands, with sales per brand, an owner who sees all, leads from WhatsApp, Instagram, and the website, plus follow-ups and quotations.",
    );
    const [first] = new QuestionEngine().generateQuestions(state, [], 1);

    expect(first?.topic).toBe("customer_identity");
    expect(first?.text).toMatch(/customer|brand/i);
    expect(first?.text).not.toMatch(
      /database|authentication|platform|tech stack/i,
    );
    expect(validateQuestionQuality(first!, state).accepted).toBe(true);
    expect(evaluateDiscovery(state).importantDecisionsRemaining).toBe(5);
  });

  it("chooses different first themes for rental and inventory fixtures", () => {
    const rental = createInitialProjectState({
      id: "rental",
      name: "3-Branch Car Rental",
      rawIdea: "Rental mobil 3 cabang.",
    });
    rental.entities = ["Vehicle", "Booking", "Customer"];
    const inventory = createInitialProjectState({
      id: "inventory",
      name: "3-Warehouse Slab Inventory",
      rawIdea: "Inventory slab marmer untuk tiga gudang.",
    });
    inventory.entities = ["Warehouse", "Inventory item", "Inventory movement"];

    const rentalFirst = new QuestionEngine().generateQuestions(
      rental,
      [],
      1,
    )[0];
    const inventoryFirst = new QuestionEngine().generateQuestions(
      inventory,
      [],
      1,
    )[0];

    expect(rentalFirst?.topic).toBe("vehicle_location");
    expect(inventoryFirst?.topic).toBe("slab_identity");
    expect(rentalFirst?.topic).not.toBe(inventoryFirst?.topic);
  });

  it("records a natural answer and lets the graph choose the next topic", () => {
    const state = project(
      "CRM for 5 marble brands, with sales per brand, an owner who sees all, leads from WhatsApp, Instagram, and the website, plus follow-ups and quotations.",
    );
    const engine = new QuestionEngine();
    const first = engine.generateQuestions(state, [], 1)[0];
    const processed = engine.processAnswer(
      state,
      first.id,
      "Sebenernya satu customer, cuma quotation-nya harus tetap jelas dari brand mana.",
      first,
    );
    const next = engine.generateQuestions(processed.updatedState, [], 1)[0];
    const readiness = evaluateReadinessDirectly(processed.updatedState);

    expect(processed.decision?.topic).toBe("customer_identity");
    expect(processed.decision?.decision).toBe("company_wide");
    expect(processed.updatedState.decisionGraph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relation: "AFFECTS",
          to: "customer model",
        }),
      ]),
    );
    expect(next?.topic).toBe("sales_visibility");
    expect(readiness.discovery.importantDecisionsRemaining).toBe(4);
  });

  it("creates semantic titles without cutting an unfinished sentence", () => {
    expect(
      deriveProjectTitle(
        "Gua mau bikin CRM untuk 5 brand marmer. Setiap brand punya sales sendiri.",
      ),
    ).toBe("5-Brand Marble CRM");
    expect(deriveProjectTitle("Rental mobil 3 cabang.")).toBe(
      "3-Branch Car Rental",
    );
  });

  it("rejects generic discovery questions", () => {
    const state = project("CRM for marble sales teams.");
    const result = validateQuestionQuality(
      {
        id: "generic",
        text: "Who are your target users?",
        contextReferences: ["rawIdea"],
        relatedRequirementIds: ["users"],
        affects: [],
        answerType: "FREE_TEXT",
        priority: 5,
        reasonAsked: "Generic test",
      },
      state,
    );
    expect(result.accepted).toBe(false);
  });

  it("does not turn an unevaluated requirement list into zero remaining", () => {
    const state = createInitialProjectState({
      id: "unknown",
      name: "New project",
      rawIdea: "Build a tool",
    });
    const readiness = evaluateReadinessDirectly(state);

    expect(readiness.discovery.evaluated).toBe(false);
    expect(readiness.discovery.importantDecisionsRemaining).toBeNull();
  });
});
