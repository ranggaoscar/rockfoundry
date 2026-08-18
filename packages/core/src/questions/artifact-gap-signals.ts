import type { ProjectState } from "../schema";
import { derivedRelationships } from "../export/derived";
import type { StructuralContext } from "./context-extractor";

export type ArtifactGapSignal = {
  id:
    "relationships" | "states_statuses" | "ownership" | "history" | "retention";
  title: string;
  evidence: string;
  affects: string[];
  priority: number;
};

/**
 * Turn honest artifact gaps into discovery input. This never fills the gap;
 * it only gives the generic candidate engine evidence for a focused question.
 */
function hasDecision(state: ProjectState, topic: string) {
  return state.decisions.some(
    (decision) =>
      decision.topic === topic &&
      ["ACCEPTED", "PROPOSED"].includes(decision.status),
  );
}

export function detectArtifactGapSignals(
  state: ProjectState,
  context: StructuralContext,
): ArtifactGapSignal[] {
  const gaps: ArtifactGapSignal[] = [];
  const relationships = derivedRelationships(state);

  if (context.entities.length >= 2 && relationships.length === 0) {
    gaps.push({
      id: "relationships",
      title: "Entity relationships",
      evidence:
        "The artifact has multiple known entities but no canonical relationship connects them yet.",
      affects: ["data relationships", "history", "ERD"],
      priority: 8,
    });
  }
  if (
    context.entities.length > 0 &&
    (context.signals.lifecycle || context.workflows.length > 0) &&
    !hasDecision(state, "lifecycle_transitions") &&
    !hasDecision(state, "completion_semantics")
  ) {
    gaps.push({
      id: "states_statuses",
      title: "States and statuses",
      evidence:
        "Stateful records or workflows are present, but no canonical state-transition rule is recorded.",
      affects: ["states", "transitions", "workflow", "PRD"],
      priority: 9,
    });
  }
  if (
    context.entities.length > 0 &&
    context.roles.length > 0 &&
    !hasDecision(state, "visibility_boundary") &&
    !hasDecision(state, "ownership_boundary") &&
    !hasDecision(state, "role_boundaries")
  ) {
    gaps.push({
      id: "ownership",
      title: "Ownership and visibility",
      evidence:
        "Roles and records are present, but no canonical ownership or visibility rule is recorded.",
      affects: ["ownership", "permissions", "privacy"],
      priority: 9,
    });
  }
  if (
    context.entities.length > 0 &&
    context.signals.history &&
    !hasDecision(state, "history_auditability")
  ) {
    gaps.push({
      id: "history",
      title: "History and auditability",
      evidence:
        "History-like language is present, but no canonical rule says what changes remain auditable.",
      affects: ["history", "auditability", "corrections"],
      priority: 8,
    });
  }
  if (
    context.entities.length > 0 &&
    (context.signals.history || context.signals.documents) &&
    !hasDecision(state, "retention_deletion")
  ) {
    gaps.push({
      id: "retention",
      title: "Retention and deletion",
      evidence:
        "Persistent records or documents are present, but retention/deletion behavior is still unresolved.",
      affects: ["retention", "deletion", "privacy"],
      priority: 6,
    });
  }
  return gaps;
}
