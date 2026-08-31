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
  draftSpecReady: boolean;
};

export type DraftSpecMaturity = { ready: boolean; missing: string[] };

type MaturityDimension = "actor" | "job" | "experience" | "boundary";

const PROVENANCE_PREFIXES: Record<MaturityDimension, string[]> = {
  actor: ["targetUsers", "user", "roles", "role"],
  job: ["objectives", "objective", "problems", "problem"],
  experience: ["workflows", "workflow", "features", "feature"],
  boundary: ["constraints", "constraint"],
};

function hasExplicitUserProvenance(
  state: ProjectState,
  dimension: MaturityDimension,
  values: string[],
) {
  return values.some((value) =>
    PROVENANCE_PREFIXES[dimension].some((prefix) => {
      const provenance = state.provenance[`${prefix}.${value}`];
      return provenance?.source === "USER" && provenance.confidence === "EXPLICIT";
    }),
  );
}

function hasLabeledResolvedAssumption(
  state: ProjectState,
  dimension: MaturityDimension,
) {
  const labels: Record<MaturityDimension, RegExp> = {
    actor: /\b(?:primary actor|primary user|target user|actor|role|roles|user|users)\b/i,
    job: /\b(?:core job|job to be done|objective|problem|goal|purpose)\b/i,
    experience: /\b(?:core experience|workflow|feature|capability|flow)\b/i,
    boundary: /\b(?:mvp|scope|boundary|out of scope|exclude|excluded|constraint)\b/i,
  };
  return state.assumptions.some(
    (assumption) =>
      assumption.resolved && labels[dimension].test(assumption.statement.trim()),
  );
}

function hasExplicitDecisionBoundary(state: ProjectState) {
  return state.decisions.some((decision) => {
    if (decision.source !== "USER" || decision.confidence !== "EXPLICIT") return false;
    const provenance = state.provenance[`decision.${decision.topic}`];
    return provenance?.source === "USER" && provenance.confidence === "EXPLICIT";
  });
}

export function evaluateDraftSpecMaturity(state: ProjectState): DraftSpecMaturity {
  const missing: string[] = [];
  if (!state.rawIdea.trim() && !state.normalizedSummary?.trim()) {
    missing.push("product identity");
  }
  if (
    !hasExplicitUserProvenance(state, "actor", [
      ...state.targetUsers,
      ...state.roles,
    ]) &&
    !hasLabeledResolvedAssumption(state, "actor")
  ) {
    missing.push("primary actor");
  }
  if (
    !hasExplicitUserProvenance(state, "job", [
      ...state.objectives,
      ...state.problems,
    ]) &&
    !hasLabeledResolvedAssumption(state, "job")
  ) {
    missing.push("core job");
  }
  if (
    !hasExplicitUserProvenance(state, "experience", [
      ...state.workflows,
      ...state.features,
    ]) &&
    !hasLabeledResolvedAssumption(state, "experience")
  ) {
    missing.push("core experience");
  }
  if (
    !hasExplicitUserProvenance(state, "boundary", state.constraints) &&
    !hasExplicitDecisionBoundary(state) &&
    !hasLabeledResolvedAssumption(state, "boundary")
  ) {
    missing.push("MVP boundary");
  }
  return { ready: missing.length === 0, missing };
}

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
  const preliminaryDebt = evaluateDecisionDebt(state);
  const requiresFoundation =
    /\b(?:application|aplikasi|platform|website|web app|mobile app|system|sistem|software|social media platform)\b/i.test(
      state.rawIdea,
    );
  const actorGrounded = state.targetUsers.length > 0 || state.roles.length > 0;
  const foundationGrounded =
    !requiresFoundation ||
    (actorGrounded &&
      state.entities.length > 0 &&
      (state.objectives.length > 0 || state.workflows.length > 0));
  const draftMaturity = evaluateDraftSpecMaturity(state);
  const level =
    blocking.length > 0 || !foundationGrounded
      ? "NOT_READY"
      : discovery.importantDecisionsRemaining === 0 &&
          preliminaryDebt.unresolvedHighRiskCount === 0
        ? "BUILD_READY"
        : draftMaturity.ready
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
    draftSpecReady: draftMaturity.ready,
  };
}
