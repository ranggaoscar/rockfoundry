import { ProjectState } from "../schema";
import { evaluateDiscovery } from "../questions/requirements";
import {
  evaluateDecisionDebt,
  type DecisionDebtResult,
} from "./decision-debt";

export type ReadinessResult = {
  score: number;
  level: "NOT_READY" | "DRAFT_READY" | "BUILD_READY";
  breakdown: { business: number; product: number; data: number };
  blocking: string[];
  discovery: ReturnType<typeof evaluateDiscovery>;
  decisionDebt: DecisionDebtResult;
};

function ratio(known: number, total: number) {
  return total === 0
    ? 0
    : Math.max(0, Math.min(100, Math.round((known / total) * 100)));
}

export function evaluateReadinessDirectly(
  state: ProjectState,
): ReadinessResult {
  const blocking = state.contradictions
    .filter((item) => item.status === "OPEN" && item.severity === "BLOCKING")
    .map((item) => item.explanation);
  const discovery = evaluateDiscovery(state);
  const business = ratio(
    state.objectives.length + state.problems.length + state.targetUsers.length,
    5,
  );
  const product = ratio(
    state.features.length +
      state.workflows.length +
      state.roles.length +
      state.permissions.length,
    6,
  );
  const data = ratio(
    state.entities.length +
      state.businessRules.length +
      state.integrations.length,
    5,
  );
  const unresolved =
    state.openQuestions.length +
    state.assumptions.filter((item) => !item.resolved).length;
  const confidencePenalty =
    state.assumptions.filter(
      (item) => !item.resolved && item.confidence !== "EXPLICIT",
    ).length * 2;
  const contradictionPenalty = state.contradictions
    .filter((item) => item.status === "OPEN")
    .reduce(
      (total, item) => total + (item.severity === "BLOCKING" ? 20 : 6),
      0,
    );
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (business + product + data) / 3 -
          unresolved * 0.75 -
          confidencePenalty -
          contradictionPenalty -
          (discovery.importantDecisionsRemaining === null
            ? state.rawIdea.trim()
              ? 6
              : 0
            : discovery.importantDecisionsRemaining * 1.2),
      ),
    ),
  );
  const level =
    blocking.length > 0
      ? "NOT_READY"
      : score >= 72 &&
          unresolved <= 2 &&
          discovery.importantDecisionsRemaining === 0
        ? "BUILD_READY"
        : score >= 38
          ? "DRAFT_READY"
          : "NOT_READY";
  const decisionDebt = evaluateDecisionDebt({
    ...state,
    readiness: level,
    readinessScore: score,
    readinessBreakdown: { business, product, data },
  });

  return {
    score,
    level,
    breakdown: { business, product, data },
    blocking,
    discovery,
    decisionDebt,
  };
}
