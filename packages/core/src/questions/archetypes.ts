import type { Confidence, RequirementCategory } from "../schema";
import type { ArtifactGapSignal } from "./artifact-gap-signals";
import type { StructuralContext } from "./context-extractor";

export type RiskDimensions = {
  workflow: number;
  data: number;
  permissions: number;
  crossBoundary: number;
  contradiction: number;
};

export type SubjectType =
  | "ACTOR"
  | "ENTITY"
  | "RESOURCE"
  | "WORKFLOW"
  | "ACTION"
  | "OUTCOME"
  | "CHANNEL"
  | "BOUNDARY"
  | "UNKNOWN";

export type DecisionCandidate = {
  topic: string;
  archetype: string;
  subject?: string;
  subjectType?: SubjectType;
  prerequisites: string[];
  prerequisitesSatisfied: boolean;
  title: string;
  intent: string;
  description: string;
  category: RequirementCategory;
  affects: string[];
  risk: RiskDimensions;
  priority: number;
  riskWeight: number;
  estimatedChangeCost: number;
  evidence: string[];
  confidence: Confidence;
  domainSpecificity: "GENERIC";
  artifactGap?: string;
};

type CandidateDefinition = {
  topic: string;
  archetype: string;
  title: string;
  category: RequirementCategory;
  intent: string;
  description: string;
  affects: string[];
  risk: RiskDimensions;
  priority: number;
  riskWeight: number;
  estimatedChangeCost: number;
  relevant: (context: StructuralContext, gaps: ArtifactGapSignal[]) => boolean;
  artifactGap?: string;
};

const baseRisk = {
  workflow: 5,
  data: 5,
  permissions: 5,
  crossBoundary: 2,
  contradiction: 4,
};

function evidenceFor(
  context: StructuralContext,
  definition: CandidateDefinition,
  gaps: ArtifactGapSignal[],
) {
  const gapEvidence = gaps
    .filter((gap) => gap.id === definition.artifactGap)
    .map((gap) => gap.evidence);
  return [
    ...context.entities.slice(0, 4).map((item) => item.value),
    ...context.roles.slice(0, 3).map((item) => item.value),
    ...context.workflows.slice(0, 2).map((item) => item.value),
    ...gapEvidence,
  ].filter(Boolean);
}

function candidate(
  definition: CandidateDefinition,
  context: StructuralContext,
  gaps: ArtifactGapSignal[],
): DecisionCandidate {
  const lifecycleSubject = context.entities.find(
    (item) => !/^(?:mencari|ingin|membantu|melihat|menggunakan)$/i.test(item.value),
  );
  const subject =
    definition.archetype === "PRODUCT_IDENTITY"
      ? "product boundary"
      : lifecycleSubject?.value || context.workflows[0]?.value;
  const subjectType =
    definition.archetype === "PRODUCT_IDENTITY"
      ? "OUTCOME"
      : lifecycleSubject
        ? /room|slot|resource|vehicle|dentist/i.test(lifecycleSubject.value)
          ? "RESOURCE"
          : "ENTITY"
        : context.workflows[0]
          ? "WORKFLOW"
          : "UNKNOWN";
  const prerequisites =
    definition.archetype === "LIFECYCLE"
      ? ["valid lifecycle-capable subject", "product identity resolved"]
      : definition.archetype === "CONFLICT_CAPACITY"
        ? ["limited resource or time-slot evidence"]
        : definition.archetype === "CROSS_BOUNDARY"
          ? ["multiple boundaries"]
          : [];
  const prerequisitesSatisfied =
    definition.archetype === "LIFECYCLE"
      ? Boolean(subject && ["ENTITY", "RESOURCE", "WORKFLOW"].includes(subjectType)) &&
        !context.productIdentityAmbiguous
      : definition.archetype === "CONFLICT_CAPACITY"
        ? context.signals.resourceConstraint
        : definition.archetype === "CROSS_BOUNDARY"
          ? context.boundaries.length > 1
          : true;
  return {
    ...definition,
    subject,
    subjectType,
    prerequisites,
    prerequisitesSatisfied,
    evidence: evidenceFor(context, definition, gaps),
    confidence: context.entities.some((item) => item.confidence === "EXPLICIT")
      ? "STRONGLY_INFERRED"
      : "WEAKLY_INFERRED",
    domainSpecificity: "GENERIC",
  };
}

/**
 * Reusable product-decision archetypes. These describe structural failure
 * modes, not industries. A definition only emits when the context provides
 * evidence that the failure mode is material.
 */
export const GENERIC_DECISION_ARCHETYPES: CandidateDefinition[] = [
  {
    topic: "product_identity",
    archetype: "PRODUCT_IDENTITY",
    title: "Product boundary",
    category: "PRODUCT",
    intent: "Decide whether the product is a job-search utility or also a two-sided employer marketplace.",
    description: "The actor boundary determines the first workflow, permissions, and data model.",
    affects: ["actors", "product scope", "job posting workflow", "candidate workflow"],
    risk: { ...baseRisk, workflow: 10, data: 8, permissions: 8, contradiction: 8 },
    priority: 10,
    riskWeight: 10,
    estimatedChangeCost: 10,
    relevant: (context) => context.productIdentityAmbiguous,
  },
  {
    topic: "identity_boundary",
    archetype: "IDENTITY",
    title: "Identity boundary",
    category: "DATA",
    intent:
      "Decide whether the same real-world thing appearing in different contexts is one record or multiple records.",
    description:
      "Identity semantics affect history, duplicates, relationships, search, and future migrations.",
    affects: [
      "identity model",
      "duplicate handling",
      "history",
      "search",
      "data relationships",
    ],
    risk: { ...baseRisk, data: 9, crossBoundary: 8, contradiction: 8 },
    priority: 9,
    riskWeight: 9,
    estimatedChangeCost: 9,
    relevant: (context) =>
      context.entities.length >= 2 &&
      (context.signals.identity ||
        context.signals.history ||
        context.roles.length > 0 ||
        context.boundaries.length > 0),
  },
  {
    topic: "ownership_boundary",
    archetype: "OWNERSHIP",
    title: "Operational ownership",
    category: "WORKFLOW",
    intent:
      "Decide who owns a record or process after creation and what happens when responsibility changes.",
    description:
      "Ownership drives assignment, accountability, reassignment, notifications, permissions, and reporting.",
    affects: [
      "ownership",
      "assignment",
      "permissions",
      "notifications",
      "history",
    ],
    risk: { ...baseRisk, workflow: 9, permissions: 8, contradiction: 8 },
    priority: 9,
    riskWeight: 9,
    estimatedChangeCost: 9,
    relevant: (context) =>
      context.entities.length > 0 &&
      (context.roles.length > 0 ||
        context.signals.assignment ||
        context.workflows.length > 0),
  },
  {
    topic: "visibility_boundary",
    archetype: "VISIBILITY",
    title: "Visibility boundary",
    category: "PERMISSIONS",
    intent:
      "Decide which roles can see which records, history, and cross-boundary data.",
    description:
      "Visibility rules affect privacy, navigation, search scope, collaboration, and auditability.",
    affects: [
      "permissions",
      "privacy",
      "search scope",
      "navigation",
      "auditability",
    ],
    risk: { ...baseRisk, permissions: 10, crossBoundary: 8, contradiction: 9 },
    priority: 10,
    riskWeight: 10,
    estimatedChangeCost: 9,
    relevant: (context) =>
      context.entities.length > 0 &&
      (context.roles.length >= 2 ||
        context.signals.visibility ||
        context.signals.history ||
        context.boundaries.length > 0),
  },
  {
    topic: "lifecycle_transitions",
    archetype: "LIFECYCLE",
    title: "Lifecycle and transitions",
    category: "WORKFLOW",
    intent:
      "Decide which states a central record moves through and what event means completion, cancellation, or reopening.",
    description:
      "Lifecycle semantics determine valid actions, history, notifications, reporting, and acceptance criteria.",
    affects: [
      "states",
      "transitions",
      "workflow",
      "notifications",
      "acceptance criteria",
    ],
    risk: { ...baseRisk, workflow: 10, data: 8, contradiction: 8 },
    priority: 10,
    riskWeight: 9,
    estimatedChangeCost: 9,
    artifactGap: "states_statuses",
    relevant: (context, gaps) =>
      context.entities.length > 0 &&
      (context.signals.lifecycle ||
        context.signals.stateTransitions ||
        context.workflows.length > 0 ||
        gaps.some((gap) => gap.id === "states_statuses")),
  },
  {
    topic: "resource_conflict_policy",
    archetype: "CONFLICT_CAPACITY",
    title: "Resource conflict policy",
    category: "WORKFLOW",
    intent:
      "Decide what happens when two requests compete for the same constrained resource or time slot.",
    description:
      "Conflict behavior affects availability, booking integrity, overrides, notifications, and recovery.",
    affects: [
      "availability",
      "scheduling",
      "capacity",
      "conflict handling",
      "notifications",
    ],
    risk: { ...baseRisk, workflow: 10, data: 8, contradiction: 9 },
    priority: 10,
    riskWeight: 10,
    estimatedChangeCost: 9,
    relevant: (context) =>
      context.signals.resourceConstraint &&
      (context.signals.scheduling || context.workflows.length > 0),
  },
  {
    topic: "assignment_behavior",
    archetype: "ASSIGNMENT",
    title: "Assignment behavior",
    category: "WORKFLOW",
    intent:
      "Decide how work is assigned, whether it can be reassigned, and what remains true after reassignment.",
    description:
      "Assignment rules control queues, accountability, workload visibility, and historical ownership.",
    affects: [
      "assignment",
      "ownership",
      "work queues",
      "permissions",
      "history",
    ],
    risk: { ...baseRisk, workflow: 9, permissions: 7, contradiction: 8 },
    priority: 8,
    riskWeight: 8,
    estimatedChangeCost: 8,
    relevant: (context) =>
      context.signals.assignment &&
      context.roles.length > 0 &&
      context.entities.length > 0,
  },
  {
    topic: "cross_boundary_behavior",
    archetype: "CROSS_BOUNDARY",
    title: "Cross-boundary behavior",
    category: "WORKFLOW",
    intent:
      "Decide what happens when a record or process moves between teams, units, locations, or organizational boundaries.",
    description:
      "Cross-boundary behavior changes ownership, visibility, history, availability, and reporting.",
    affects: [
      "cross-boundary workflow",
      "ownership",
      "visibility",
      "history",
      "reporting",
    ],
    risk: {
      ...baseRisk,
      workflow: 9,
      permissions: 8,
      crossBoundary: 10,
      contradiction: 9,
    },
    priority: 9,
    riskWeight: 9,
    estimatedChangeCost: 9,
    relevant: (context) =>
      context.boundaries.length > 0 &&
      context.entities.length > 0 &&
      (context.workflows.length > 0 || context.signals.history),
  },
  {
    topic: "duplicate_semantics",
    archetype: "DUPLICATE",
    title: "Duplicate semantics",
    category: "DATA",
    intent:
      "Decide what counts as the same record and whether a possible duplicate is merged, linked, flagged, or kept separate.",
    description:
      "Duplicate behavior affects identity, history, trust, search, and irreversible data changes.",
    affects: [
      "identity model",
      "duplicate detection",
      "merge workflow",
      "history",
      "data quality",
    ],
    risk: { ...baseRisk, data: 10, workflow: 8, contradiction: 9 },
    priority: 8,
    riskWeight: 9,
    estimatedChangeCost: 9,
    relevant: (context) =>
      context.entities.length >= 2 &&
      (context.signals.duplicate || context.signals.identity),
  },
  {
    topic: "history_auditability",
    archetype: "HISTORY",
    title: "History and auditability",
    category: "DATA",
    intent:
      "Decide which changes remain visible, who can inspect them, and whether history follows the record or its current owner.",
    description:
      "History decisions affect trust, privacy, correction workflows, reporting, and legal/audit exposure.",
    affects: ["audit trail", "history", "privacy", "corrections", "reporting"],
    risk: { ...baseRisk, data: 9, permissions: 8, contradiction: 8 },
    priority: 8,
    riskWeight: 8,
    estimatedChangeCost: 8,
    artifactGap: "history",
    relevant: (context, gaps) =>
      context.entities.length > 0 &&
      (context.signals.history ||
        context.signals.auditability ||
        gaps.some((gap) => gap.id === "history")),
  },
  {
    topic: "completion_semantics",
    archetype: "COMPLETION",
    title: "Completion semantics",
    category: "PRODUCT",
    intent:
      "Decide what evidence makes the main workflow complete and whether a completed record can be reopened.",
    description:
      "Completion semantics determine reporting, downstream actions, notifications, and user expectations.",
    affects: [
      "completion",
      "states",
      "reporting",
      "notifications",
      "acceptance criteria",
    ],
    risk: { ...baseRisk, workflow: 9, data: 7, contradiction: 7 },
    priority: 8,
    riskWeight: 8,
    estimatedChangeCost: 7,
    relevant: (context) =>
      context.workflows.length > 0 &&
      (context.signals.completion || context.signals.lifecycle),
  },
  {
    topic: "approval_responsibility",
    archetype: "APPROVAL",
    title: "Approval responsibility",
    category: "PERMISSIONS",
    intent:
      "Decide who can approve, reject, or override a consequential transition and what evidence is retained.",
    description:
      "Approval rules affect permissions, state transitions, auditability, and blocked work.",
    affects: [
      "approvals",
      "permissions",
      "states",
      "auditability",
      "notifications",
    ],
    risk: { ...baseRisk, permissions: 9, workflow: 8, contradiction: 8 },
    priority: 8,
    riskWeight: 8,
    estimatedChangeCost: 8,
    relevant: (context) =>
      context.roles.length >= 2 &&
      (context.signals.stateTransitions || context.signals.assignment),
  },
  {
    topic: "money_responsibility",
    archetype: "MONEY",
    title: "Money responsibility",
    category: "WORKFLOW",
    intent:
      "Decide who is responsible for money-related state changes and what happens on cancellation, failure, refund, or dispute.",
    description:
      "Money behavior affects ownership, lifecycle, reconciliation, notifications, and user trust.",
    affects: [
      "money state",
      "ownership",
      "cancellation",
      "refunds",
      "reconciliation",
    ],
    risk: { ...baseRisk, workflow: 9, data: 8, contradiction: 9 },
    priority: 8,
    riskWeight: 9,
    estimatedChangeCost: 9,
    relevant: (context) => context.signals.money,
  },
  {
    topic: "retention_deletion",
    archetype: "RETENTION",
    title: "Retention and deletion",
    category: "SECURITY",
    intent:
      "Decide how long records and history remain available, and what deletion means for linked records.",
    description:
      "Retention behavior affects privacy, auditability, history, legal exposure, and data relationships.",
    affects: [
      "retention",
      "deletion",
      "privacy",
      "history",
      "data relationships",
    ],
    risk: { ...baseRisk, data: 8, permissions: 8, contradiction: 8 },
    priority: 7,
    riskWeight: 8,
    estimatedChangeCost: 8,
    artifactGap: "retention",
    relevant: (context, gaps) =>
      context.entities.length > 0 &&
      (context.signals.retention ||
        context.signals.history ||
        context.signals.documents ||
        gaps.some((gap) => gap.id === "retention")),
  },
  {
    topic: "primary_workflow",
    archetype: "WORKFLOW_ANCHOR",
    title: "Primary workflow",
    category: "WORKFLOW",
    intent:
      "Define the first observable outcome that proves the product is useful.",
    description:
      "The first successful outcome anchors scope and acceptance criteria.",
    affects: ["primary workflow", "scope", "acceptance criteria"],
    risk: { ...baseRisk, workflow: 8, data: 5, contradiction: 5 },
    priority: 7,
    riskWeight: 7,
    estimatedChangeCost: 6,
    relevant: (context) =>
      context.entities.length > 0 || context.workflows.length > 0,
  },
  {
    topic: "record_relationships",
    archetype: "RELATIONSHIPS",
    title: "Record relationships",
    category: "DATA",
    intent:
      "Define which records must stay connected so their history can be understood together.",
    description:
      "Relationships shape the ERD, search, history, reporting, and downstream workflow behavior.",
    affects: ["data relationships", "history", "search", "reporting"],
    risk: { ...baseRisk, data: 8, workflow: 7, contradiction: 6 },
    priority: 7,
    riskWeight: 7,
    estimatedChangeCost: 7,
    artifactGap: "relationships",
    relevant: (context, gaps) =>
      context.entities.length >= 2 ||
      gaps.some((gap) => gap.id === "relationships"),
  },
  {
    topic: "role_boundaries",
    archetype: "ROLE_BOUNDARIES",
    title: "Role boundaries",
    category: "PERMISSIONS",
    intent: "Define what each known role can see or change.",
    description:
      "Role boundaries prevent ownership, privacy, and data-visibility gaps later.",
    affects: ["permissions", "navigation", "data visibility", "ownership"],
    risk: { ...baseRisk, permissions: 8, workflow: 6, contradiction: 7 },
    priority: 7,
    riskWeight: 7,
    estimatedChangeCost: 7,
    artifactGap: "ownership",
    relevant: (context, gaps) =>
      context.roles.length > 0 || gaps.some((gap) => gap.id === "ownership"),
  },
];

export function archetypeByTopic(topic: string) {
  return GENERIC_DECISION_ARCHETYPES.find((item) => item.topic === topic);
}

export function buildGenericCandidates(
  context: StructuralContext,
  gaps: ArtifactGapSignal[],
): DecisionCandidate[] {
  return GENERIC_DECISION_ARCHETYPES.filter((definition) =>
    definition.relevant(context, gaps),
  ).map((definition) => candidate(definition, context, gaps));
}
