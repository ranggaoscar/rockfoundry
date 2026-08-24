import type { ProjectState } from "../schema";
import { extractStructuralContext } from "./context-extractor";

export type ProductShape = {
  actorCount: number;
  sharedActors: boolean;
  hasMultipleRoles: boolean;
  persistentDataLikely: boolean;
  persistentEntities: number;
  workflowDriven: boolean;
  statefulWorkflow: boolean;
  collaborative: boolean;
  organizationalBoundary: boolean;
  moneyPresent: boolean;
  approvalPresent: boolean;
  constrainedResourcePresent: boolean;
  duplicateRiskPresent: boolean;
  auditHistoryRelevant: boolean;
  deletionRelevant: boolean;
  assignmentRelevant: boolean;
};

const persistent = /\b(history|histori|record|records|riwayat|save|simpan|stored|database|document|dokumen|note|catatan|booking|inventory|stock|lead|customer|order|pesanan)\b/i;
const collaboration = /\b(share|shared|team|tim|collaborat|bersama|multi-user|multiple users?)\b/i;
const approval = /\b(approve|approval|persetujuan|review|override|authorize)\b/i;

/** Derived-only semantics for deciding whether a generic question is askable. */
export function deriveProductShape(state: ProjectState): ProductShape {
  const context = extractStructuralContext(state);
  const text = [
    state.rawIdea,
    ...state.targetUsers,
    ...state.roles,
    ...state.entities,
    ...state.workflows,
    ...state.features,
    ...state.decisions.filter((item) => item.status === "ACCEPTED").map((item) => `${item.topic} ${item.decision}`),
  ].join(" ");
  const distinctActors = new Set(
    [...state.targetUsers, ...state.roles, ...context.roles.map((item) => item.value)]
      .map((value) => value.toLowerCase().trim())
      .filter(Boolean),
  );
  const persistentDataLikely = persistent.test(text) || context.signals.history || context.signals.retention || context.signals.documents;
  const persistentEntities = persistentDataLikely
    ? Math.max(0, state.entities.length)
    : 0;
  const collaborative = collaboration.test(text) || context.signals.visibility || distinctActors.size > 1;
  return {
    actorCount: distinctActors.size,
    sharedActors: collaborative,
    hasMultipleRoles: distinctActors.size > 1,
    persistentDataLikely,
    persistentEntities,
    workflowDriven: state.workflows.length > 0 || context.signals.scheduling || context.signals.assignment,
    statefulWorkflow: context.signals.lifecycle || context.signals.stateTransitions,
    collaborative,
    organizationalBoundary: context.boundaries.length > 0,
    moneyPresent: context.signals.money,
    approvalPresent: approval.test(text) || (context.signals.stateTransitions && distinctActors.size > 1 && /approve|review|confirm|setuju/i.test(text)),
    constrainedResourcePresent: context.signals.resourceConstraint,
    duplicateRiskPresent: context.signals.duplicate || (persistentEntities >= 2 && context.signals.identity),
    auditHistoryRelevant: persistentDataLikely && (context.signals.history || context.signals.auditability),
    deletionRelevant: persistentDataLikely && context.signals.retention,
    assignmentRelevant: (distinctActors.size > 1 || collaborative) && context.signals.assignment,
  };
}

export function isCandidateEligible(topic: string, shape: ProductShape) {
  const simpleUtility =
    shape.actorCount <= 1 &&
    !shape.persistentDataLikely &&
    !shape.workflowDriven &&
    !shape.collaborative &&
    !shape.moneyPresent &&
    !shape.constrainedResourcePresent;
  if (!simpleUtility) return true;
  switch (topic) {
    case "visibility_boundary":
    case "role_boundaries":
    case "ownership_boundary":
    case "assignment_behavior":
    case "lifecycle_transitions":
    case "completion_semantics":
    case "retention_deletion":
    case "duplicate_semantics":
    case "approval_responsibility":
    case "cross_boundary_behavior":
    case "resource_conflict_policy":
    case "history_auditability":
    case "record_relationships":
    case "identity_boundary":
      return false;
    default:
      return true;
  }
}
