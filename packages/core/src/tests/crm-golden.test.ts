import { describe, expect, it } from "vitest";
import {
  CRM_DECISION_ORDER,
  CRM_GOLDEN_IDEAS,
  createInitialProjectState,
  deriveProjectTitle,
  detectContradictions,
  evaluateDecisionDebt,
  QuestionEngine,
  recordDecision,
  validateQuestionQuality,
} from "../index";

function crmState(rawIdea: string) {
  const state = createInitialProjectState({
    id: "crm-golden",
    name: deriveProjectTitle(rawIdea),
    rawIdea,
  });
  state.targetUsers = ["Sales team", "Owner"];
  state.entities = ["Customer", "Lead", "Quotation", "Brand"];
  state.features = ["Track leads", "Manage quotations", "Follow-ups"];
  state.workflows = ["Capture lead", "Send quotation"];
  state.roles = ["Sales", "Owner"];
  return state;
}

describe("CRM golden path", () => {
  it("asks identity → visibility → ownership in the first three questions for every golden idea", () => {
    for (const fixture of CRM_GOLDEN_IDEAS) {
      const state = crmState(fixture.rawIdea);
      const engine = new QuestionEngine();
      const firstThree = engine.generateQuestions(state, [], 3);
      const topics = firstThree.map((question) => question.topic);

      expect(topics, fixture.id).toEqual([...fixture.expectedFirstTopics]);
      for (const question of firstThree) {
        expect(validateQuestionQuality(question, state).accepted).toBe(true);
        expect(question.text).not.toMatch(
          /database|authentication|tech stack|do you need auth/i,
        );
        expect(question.text).toMatch(
          /brand|customer|sales|owner|lead|quotation|whatsapp|instagram|histori|identitas/i,
        );
      }
    }
  });

  it("keeps the full CRM queue stable through answers", () => {
    const state = crmState(CRM_GOLDEN_IDEAS[0].rawIdea);
    const engine = new QuestionEngine();
    const seen: string[] = [];
    let current = state;

    for (const expected of CRM_DECISION_ORDER) {
      const next = engine.generateQuestions(current, [], 1)[0];
      expect(next).toBeTruthy();
      if (!next) throw new Error(`missing question for ${expected}`);
      expect(next.topic).toBe(expected);
      seen.push(next.topic || expected);
      const processed = engine.processAnswer(
        current,
        next.id,
        next.options?.[0]?.id || "yes",
        next,
      );
      expect(processed.impact?.headline).toMatch(/Locked/i);
      expect(processed.impact?.detail).toMatch(/ripples|affect/i);
      current = processed.updatedState;
    }

    expect(seen).toEqual([...CRM_DECISION_ORDER]);
    expect(evaluateDecisionDebt(current).unresolvedHighRiskCount).toBe(0);
  });

  it("flags CRM decision contradictions that coding agents would otherwise invent around", () => {
    let state = crmState(CRM_GOLDEN_IDEAS[0].rawIdea);
    ({ state } = recordDecision(state, {
      topic: "customer_identity",
      decision: "unit_specific",
      affects: ["customer model"],
    }));
    ({ state } = recordDecision(state, {
      topic: "sales_visibility",
      decision: "all_sales_all_brands",
      affects: ["sales permissions"],
    }));

    const found = detectContradictions(state);
    expect(found.some((item) => item.id === "crm-unit-customers-vs-open-sales")).toBe(
      true,
    );
  });

  it("flags shared identity with no duplicate reconciliation", () => {
    let state = crmState(CRM_GOLDEN_IDEAS[0].rawIdea);
    ({ state } = recordDecision(state, {
      topic: "customer_identity",
      decision: "company_wide",
    }));
    ({ state } = recordDecision(state, {
      topic: "duplicate_handling",
      decision: "never_merge",
    }));

    const found = detectContradictions(state);
    expect(
      found.some((item) => item.id === "crm-shared-customer-vs-no-dedupe"),
    ).toBe(true);
  });
});
