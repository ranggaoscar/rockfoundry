import type { DecisionDebt, DecisionDebtRisk, ProjectState } from "../schema";
import {
  CRM_DECISION_META,
  type CrmDecisionTopic,
} from "../questions/crm-catalog";
import { evaluateDiscovery } from "../questions/requirements";

export type DecisionDebtResult = DecisionDebt;

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function riskLevel(score: number): DecisionDebt["inventionRisk"] {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

function warningForTopic(topic: string, title: string): string {
  const crm = CRM_DECISION_META[topic as CrmDecisionTopic];
  if (crm?.inventWarning) return crm.inventWarning;
  const map: Record<string, string> = {
    vehicle_location:
      "Do not invent which branch owns vehicle availability.",
    cross_branch_booking:
      "Do not invent cross-branch pickup/return behavior.",
    vehicle_transfer:
      "Do not invent vehicle transfer side effects on bookings or availability.",
    pickup_return:
      "Do not invent late-return, damage, or no-return handling.",
    slab_identity:
      "Do not invent whether inventory is item-level or aggregate-only.",
    warehouse_transfer:
      "Do not invent multi-warehouse transfer confirmation rules.",
    movement_history:
      "Do not invent whether full movement history is required.",
    reservation:
      "Do not invent reservation hold behavior against quotations or stock.",
    measurement_semantics:
      "Do not invent units of measure or conversion rules.",
    primary_workflow:
      "Do not invent the primary user workflow or happy path order.",
    record_relationships:
      "Do not invent record ownership or long-term relationship rules.",
    role_boundaries:
      "Do not invent role permissions or data visibility boundaries.",
  };
  return (
    map[topic] ||
    `Do not invent a product rule for unresolved decision: ${title}.`
  );
}

/**
 * Decision Debt = residual risk that a coding agent will invent product behavior.
 * Higher score = more debt = more invention risk.
 */
export function evaluateDecisionDebt(state: ProjectState): DecisionDebtResult {
  const discovery = evaluateDiscovery(state);
  const openContradictions = state.contradictions.filter(
    (item) => item.status === "OPEN",
  );
  const blockingContradictions = openContradictions.filter(
    (item) => item.severity === "BLOCKING",
  );
  const unresolvedAssumptions = state.assumptions.filter(
    (item) => !item.resolved,
  );
  const highImpactAssumptions = unresolvedAssumptions.filter(
    (item) => item.impact === "HIGH",
  );
  const decided = state.decisions.filter((item) =>
    ["ACCEPTED", "PROPOSED"].includes(item.status),
  );

  const unresolvedRequirements = (discovery.requirements || []).filter(
    (item) => ["UNRESOLVED", "CONFLICTING"].includes(item.status),
  );
  const highRiskUnresolved = unresolvedRequirements
    .filter((item) => item.priority >= 8)
    .sort(
      (left, right) =>
        right.priority * right.riskWeight - left.priority * left.riskWeight,
    );

  const topRisks: DecisionDebtRisk[] = highRiskUnresolved
    .slice(0, 5)
    .map((item) => ({
      topic: item.id,
      title: item.title,
      reason: item.description,
      riskWeight: item.priority * item.riskWeight,
    }));

  // Weighted debt accumulation.
  let score = 0;
  if (!state.rawIdea.trim()) score += 18;

  for (const item of highRiskUnresolved) {
    score += Math.min(18, item.priority * item.riskWeight * 0.12);
  }
  for (const item of unresolvedRequirements.filter((entry) => entry.priority < 8)) {
    score += 3;
  }

  score += blockingContradictions.length * 16;
  score += openContradictions.length * 5;
  score += highImpactAssumptions.length * 8;
  score += unresolvedAssumptions.length * 2;
  score += Math.min(12, state.openQuestions.length * 1.5);

  // Explicit accepted decisions pay down debt.
  score -= Math.min(28, decided.length * 4);
  if (discovery.importantDecisionsRemaining === 0 && discovery.evaluated) {
    score -= 12;
  }
  if (state.readiness === "BUILD_READY") score -= 8;

  score = clamp(score);
  const inventionRisk = riskLevel(score);

  const codingAgentWarnings = [
    ...topRisks.map((risk) => warningForTopic(risk.topic, risk.title)),
    ...blockingContradictions.map(
      (item) => `Resolve before build: ${item.explanation}`,
    ),
    ...highImpactAssumptions.slice(0, 3).map(
      (item) =>
        `Do not treat this unresolved high-impact assumption as fact: ${item.statement}`,
    ),
  ].slice(0, 12);

  const summary =
    inventionRisk === "CRITICAL"
      ? "Critical Decision Debt: a coding agent would have to invent major product rules."
      : inventionRisk === "HIGH"
        ? "High Decision Debt: several material decisions are still open."
        : inventionRisk === "MEDIUM"
          ? "Medium Decision Debt: draft is possible, but MVP still has invention risk."
          : "Low Decision Debt: major product decisions are explicit enough to hand off.";

  return {
    score,
    inventionRisk,
    unresolvedHighRiskCount: highRiskUnresolved.length,
    openContradictionCount: openContradictions.length,
    unresolvedAssumptionCount: unresolvedAssumptions.length,
    decidedCount: decided.length,
    topRisks,
    codingAgentWarnings,
    summary,
  };
}
