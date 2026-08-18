import { describe, expect, it } from "vitest";
import {
  createInitialProjectState,
  deriveProjectTitle,
  evaluateDecisionDebt,
  QuestionEngine,
  validateQuestionQuality,
} from "../index";

function seed(rawIdea: string, entities: string[]) {
  const state = createInitialProjectState({
    id: "support",
    name: deriveProjectTitle(rawIdea),
    rawIdea,
  });
  state.entities = entities;
  state.targetUsers = ["Staff", "Owner"];
  state.features = ["Core workflow"];
  state.workflows = ["Primary operational flow"];
  return state;
}

describe("support domain regressions (not expansion)", () => {
  it("keeps multi-branch rental opening on vehicle location, then cross-branch booking", () => {
    const state = seed(
      "Rental car booking for 3 branches with vehicle transfers and customer history.",
      ["Vehicle", "Booking", "Branch", "Customer"],
    );
    const engine = new QuestionEngine();
    const firstThree = engine.generateQuestions(state, [], 3);
    expect(firstThree.map((item) => item.topic).slice(0, 2)).toEqual([
      "vehicle_location",
      "cross_branch_booking",
    ]);
    for (const question of firstThree) {
      expect(validateQuestionQuality(question, state).accepted).toBe(true);
      expect(question.text).not.toMatch(/authentication|tech stack|database/i);
      expect(question.text).toMatch(
        /branch|vehicle|booking|customer|pickup|return|transfer|cabang|kendaraan/i,
      );
    }

    const first = firstThree[0];
    const answered = engine.processAnswer(
      state,
      first.id,
      first.options?.[0]?.id || "yes",
      first,
    );
    expect(answered.impact?.headline).toMatch(/Locked/i);
    const next = engine.generateQuestions(answered.updatedState, [], 1)[0];
    expect(next?.topic).toBe("cross_branch_booking");
  });

  it("keeps multi-warehouse inventory opening on slab identity, then warehouse transfer", () => {
    const state = seed(
      "Inventory for three marble warehouses tracking slabs, transfers, and current location.",
      ["Warehouse", "Slab", "Inventory movement"],
    );
    const engine = new QuestionEngine();
    const firstThree = engine.generateQuestions(state, [], 3);
    expect(firstThree.map((item) => item.topic).slice(0, 2)).toEqual([
      "slab_identity",
      "warehouse_transfer",
    ]);
    for (const question of firstThree) {
      expect(validateQuestionQuality(question, state).accepted).toBe(true);
      expect(question.text).not.toMatch(/authentication|tech stack|do you need auth/i);
      expect(question.text).toMatch(
        /slab|warehouse|stock|transfer|movement|gudang|marmer|inventory/i,
      );
    }
  });

  it("does not claim zero Decision Debt just because a support domain was detected", () => {
    const rental = seed("Rental mobil 3 cabang.", [
      "Vehicle",
      "Booking",
      "Customer",
    ]);
    const inventory = seed("Inventory slab marmer tiga gudang.", [
      "Warehouse",
      "Slab",
    ]);
    expect(evaluateDecisionDebt(rental).score).toBeGreaterThan(0);
    expect(evaluateDecisionDebt(inventory).score).toBeGreaterThan(0);
    expect(evaluateDecisionDebt(rental).topRisks.length).toBeGreaterThan(0);
    expect(evaluateDecisionDebt(inventory).topRisks.length).toBeGreaterThan(0);
  });
});
