import type { DecisionDebt, DecisionDebtRisk, ProjectState } from "../schema";
import {
  acceptedDecision,
  CRM_DECISION_META,
  type CrmDecisionTopic,
} from "../questions/crm-catalog";
import { evaluateDiscovery } from "../questions/requirements";
import {
  derivedBusinessRuleLines,
  derivedDataOwnershipLines,
  derivedEdgeCaseLines,
  derivedNonGoals,
  derivedPermissionLines,
  derivedRelationshipLines,
} from "../export/derived";

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
    vehicle_location: "Do not invent which branch owns vehicle availability.",
    cross_branch_booking: "Do not invent cross-branch pickup/return behavior.",
    vehicle_transfer:
      "Do not invent vehicle transfer side effects on bookings or availability.",
    pickup_return: "Do not invent late-return, damage, or no-return handling.",
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
    artifact_business_problem: "Do not invent the business problem statement.",
    artifact_current_process: "Do not invent the current as-is process.",
    artifact_states_statuses:
      "Do not invent entity states, status machines, or transition rules.",
    artifact_error_behaviour:
      "Do not invent error handling, empty states, or failure recovery.",
    artifact_security_privacy:
      "Do not invent auth, privacy, or security boundaries.",
    artifact_performance: "Do not invent performance or scale expectations.",
    artifact_lifecycle:
      "Do not invent record lifecycle, archival, or soft-delete rules.",
    artifact_data_retention: "Do not invent data retention or deletion policy.",
    artifact_indexes:
      "Do not invent database indexes or uniqueness constraints beyond explicit decisions.",
    artifact_future_scope:
      "Do not expand future scope beyond what is explicitly listed.",
    artifact_screen_inventory:
      "Do not invent a full screen inventory or IA from generic SaaS defaults.",
    artifact_integrations_detail:
      "Do not invent integration contracts that are not listed.",
  };
  return (
    map[topic] ||
    `Do not invent a product rule for unresolved decision: ${title}.`
  );
}

function isStillUnresolved(lines: string[]): boolean {
  return (
    lines.length === 0 ||
    lines.every((line) => /\[UNRESOLVED\]/i.test(line) || !line.trim())
  );
}

function hasAcceptedDecision(state: ProjectState, topic: string) {
  return Boolean(acceptedDecision(state, topic));
}

/**
 * Residual invention risk that lives in the 9-artifact package itself —
 * sections a coding agent still has to invent even after the discovery queue.
 */
export function unresolvedArtifactGaps(
  state: ProjectState,
): DecisionDebtRisk[] {
  const gaps: DecisionDebtRisk[] = [];
  const push = (
    topic: string,
    title: string,
    reason: string,
    riskWeight: number,
  ) => {
    gaps.push({ topic, title, reason, riskWeight });
  };

  if (!state.problems.length) {
    push(
      "artifact_business_problem",
      "Business problem",
      "BRD business problem is still empty — a coding agent will invent why the product exists.",
      8,
    );
  }
  if (!state.objectives.length) {
    push(
      "artifact_objectives",
      "Business objectives",
      "No explicit objectives — success criteria will be invented at implementation time.",
      7,
    );
  }

  // Structural sections the generator still marks [UNRESOLVED] unless filled.
  push(
    "artifact_current_process",
    "Current process",
    "As-is process is unresolved in the BRD.",
    6,
  );
  if (
    !hasAcceptedDecision(state, "lifecycle_transitions") &&
    !hasAcceptedDecision(state, "completion_semantics")
  ) {
    push(
      "artifact_states_statuses",
      "States and statuses",
      "Entity states and transitions are unresolved in the PRD.",
      10,
    );
  }
  push(
    "artifact_error_behaviour",
    "Error behaviour",
    "Error, empty, and failure behavior is unresolved in the PRD.",
    8,
  );
  if (!hasAcceptedDecision(state, "lifecycle_transitions")) {
    push(
      "artifact_lifecycle",
      "Entity lifecycle",
      "Record lifecycle (create → active → archive/delete) is unresolved in the ERD.",
      9,
    );
  }
  if (
    !hasAcceptedDecision(state, "retention_deletion") &&
    !state.constraints.some((item) =>
      /retention|archive|delete|hapus/i.test(item),
    )
  ) {
    push(
      "artifact_data_retention",
      "Data retention",
      "Retention and deletion policy is unresolved in the ERD.",
      7,
    );
  }
  push(
    "artifact_indexes",
    "Indexes and uniqueness",
    "ERD indexes and uniqueness constraints are unresolved.",
    5,
  );
  push(
    "artifact_performance",
    "Performance expectations",
    "Performance expectations are unresolved in the PRD.",
    5,
  );
  push(
    "artifact_future_scope",
    "Future scope",
    "Future scope is unresolved — agents may scope-creep features.",
    4,
  );
  push(
    "artifact_screen_inventory",
    "Screen inventory / IA",
    "Navigation and screen inventory are unresolved in the PRD.",
    6,
  );

  const hasSecurityCue =
    state.constraints.some((item) =>
      /privacy|security|auth|login|permission|sensitive|personal/i.test(item),
    ) ||
    state.permissions.length > 0 ||
    state.decisions.some((item) =>
      /visibility|permission|role|access/i.test(item.topic),
    );
  if (!hasSecurityCue) {
    push(
      "artifact_security_privacy",
      "Security & privacy",
      "No auth or privacy boundary is explicit — a coding agent will invent one.",
      9,
    );
  }

  if (isStillUnresolved(derivedPermissionLines(state)) && !hasSecurityCue) {
    // already covered by security gap
  } else if (isStillUnresolved(derivedPermissionLines(state))) {
    push(
      "artifact_permissions_detail",
      "Permission matrix",
      "Permission detail is still thin relative to the roles in scope.",
      6,
    );
  }

  if (isStillUnresolved(derivedRelationshipLines(state))) {
    push(
      "artifact_relationships",
      "Data relationships",
      "Entity relationships are unresolved beyond identity fields.",
      8,
    );
  }
  if (isStillUnresolved(derivedDataOwnershipLines(state))) {
    push(
      "artifact_data_ownership",
      "Data ownership",
      "Data ownership rules are unresolved in the ERD.",
      8,
    );
  }
  if (isStillUnresolved(derivedBusinessRuleLines(state))) {
    push(
      "artifact_business_rules",
      "Business rules",
      "Business rules section has no accepted decision-derived content.",
      7,
    );
  }
  if (isStillUnresolved(derivedNonGoals(state))) {
    push(
      "artifact_non_goals",
      "Non-goals",
      "Non-goals are unresolved — scope boundaries will be invented.",
      5,
    );
  }
  if (
    isStillUnresolved(derivedEdgeCaseLines(state)) &&
    state.decisions.filter((item) =>
      ["ACCEPTED", "PROPOSED"].includes(item.status),
    ).length === 0
  ) {
    push(
      "artifact_edge_cases",
      "Edge cases",
      "No decision-linked edge cases are available yet.",
      5,
    );
  }

  if (!state.integrations.length) {
    // Only flag when the idea mentions external systems.
    if (
      /integrasi|integration|whatsapp|instagram|api|webhook|erp|payment|gateway/i.test(
        `${state.rawIdea} ${state.normalizedSummary || ""}`,
      )
    ) {
      push(
        "artifact_integrations_detail",
        "Integration contracts",
        "Integrations are implied by the idea but not specified as contracts.",
        7,
      );
    }
  }

  return gaps.sort((left, right) => right.riskWeight - left.riskWeight);
}

/**
 * Decision Debt = residual risk that a coding agent will invent product behavior.
 * Higher score = more debt = more invention risk.
 *
 * Finishing the discovery question queue is necessary but not sufficient:
 * unresolved artifact sections still count as invention risk.
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

  const unresolvedRequirements = (discovery.requirements || []).filter((item) =>
    ["UNRESOLVED", "CONFLICTING"].includes(item.status),
  );
  const highRiskUnresolved = unresolvedRequirements
    .filter((item) => item.priority >= 8)
    .sort(
      (left, right) =>
        right.priority * right.riskWeight - left.priority * left.riskWeight,
    );

  const artifactGaps = unresolvedArtifactGaps(state);
  const highArtifactGaps = artifactGaps.filter((item) => item.riskWeight >= 7);

  const topRisks: DecisionDebtRisk[] = [
    ...highRiskUnresolved.slice(0, 4).map((item) => ({
      topic: item.id,
      title: item.title,
      reason: item.description,
      riskWeight: item.priority * item.riskWeight,
    })),
    ...highArtifactGaps.slice(0, 4),
  ]
    .sort((left, right) => right.riskWeight - left.riskWeight)
    .slice(0, 6);

  // Weighted debt accumulation.
  let score = 0;
  if (!state.rawIdea.trim()) score += 18;

  // Count the highest-consequence open decisions without letting a long
  // candidate list saturate the score before a single answer can move it.
  for (const item of highRiskUnresolved.slice(0, 5)) {
    score += Math.min(12, item.priority * item.riskWeight * 0.08);
  }
  for (const item of unresolvedRequirements.filter(
    (entry) => entry.priority < 8,
  )) {
    score += 3;
  }

  // Residual artifact invention risk — this is what made "0/100 LOW" a lie.
  for (const gap of artifactGaps.slice(0, 12)) {
    score += Math.min(4, gap.riskWeight * 0.3);
  }
  score += Math.min(8, Math.floor(artifactGaps.length / 4) * 2);

  score += blockingContradictions.length * 16;
  score += openContradictions.length * 5;
  score += highImpactAssumptions.length * 8;
  score += unresolvedAssumptions.length * 2;
  score += Math.min(12, state.openQuestions.length * 1.5);

  // Explicit accepted decisions pay down discovery debt — but not to zero
  // while artifact sections remain open.
  score -= Math.min(18, decided.length * 3);
  if (discovery.importantDecisionsRemaining === 0 && discovery.evaluated) {
    score -= 6;
  }
  if (state.readiness === "BUILD_READY") score -= 8;

  // Floor: if material artifact gaps remain, debt cannot claim LOW/solved.
  // A coding agent reading "LOW" while staring at open BRD/PRD/ERD sections
  // is being lied to — keep at least MEDIUM when several high gaps remain.
  if (highArtifactGaps.length >= 3) {
    score = Math.max(score, 28);
  } else if (artifactGaps.length >= 6) {
    score = Math.max(score, 22);
  } else if (artifactGaps.length >= 3) {
    score = Math.max(score, 16);
  }

  score = clamp(score);
  const inventionRisk = riskLevel(score);

  const codingAgentWarnings = [
    ...topRisks.map((risk) => warningForTopic(risk.topic, risk.title)),
    ...blockingContradictions.map(
      (item) => `Resolve before build: ${item.explanation}`,
    ),
    ...highImpactAssumptions
      .slice(0, 3)
      .map(
        (item) =>
          `Do not treat this unresolved high-impact assumption as fact: ${item.statement}`,
      ),
  ].slice(0, 12);

  const artifactNote =
    artifactGaps.length > 0
      ? ` ${artifactGaps.length} artifact sections remain unresolved for a coding agent.`
      : "";

  const summary =
    inventionRisk === "CRITICAL"
      ? `Critical Decision Debt: a coding agent would have to invent major product rules.${artifactNote}`
      : inventionRisk === "HIGH"
        ? `High Decision Debt: several material decisions are still open.${artifactNote}`
        : inventionRisk === "MEDIUM"
          ? `Medium Decision Debt: draft is possible, but MVP still has invention risk.${artifactNote}`
          : artifactGaps.length > 0
            ? `Low discovery-queue debt, but${artifactNote}`
            : "Low Decision Debt: major product decisions are explicit enough to hand off.";

  return {
    score,
    inventionRisk,
    unresolvedHighRiskCount: highRiskUnresolved.length,
    unresolvedArtifactSectionCount: artifactGaps.length,
    openContradictionCount: openContradictions.length,
    unresolvedAssumptionCount: unresolvedAssumptions.length,
    decidedCount: decided.length,
    topRisks,
    codingAgentWarnings,
    summary,
  };
}
