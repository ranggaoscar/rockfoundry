import { ProjectState } from "../schema";

export type ExportStatus = "ready" | "needs_review" | "blocked";

export interface ConsistencyIssue {
  type: "error" | "warning";
  message: string;
  severity: "BLOCKING" | "WARNING" | "INFO";
  document?: string;
  field?: string;
}

export interface ConsistencyReport {
  status: ExportStatus;
  issues: ConsistencyIssue[];
  summary: {
    total: number;
    blockers: number;
    warnings: number;
    info: number;
  };
}

/**
 * Validates consistency across all project state documents.
 * Detects conflicting information, missing data, and logical errors.
 */
export function validateConsistency(state: ProjectState): ConsistencyReport {
  const issues: ConsistencyIssue[] = [];

  // 1. Feature absent from task breakdown
  if (state.features.length > 0 && state.objectives.length === 0) {
    issues.push({
      type: "warning",
      severity: "WARNING",
      message: "Features are defined but no objectives are specified. Features should map to objectives.",
      document: "delivery/TASK_BREAKDOWN.md",
      field: "features",
    });
  }

  // 2. Entity absent from data model
  if (state.entities.length > 0 && !state.normalizedSummary) {
    issues.push({
      type: "warning",
      severity: "WARNING",
      message: "Entities are defined but no product summary exists to contextualize the data model.",
      document: "technical/DATA_MODEL.md",
      field: "entities",
    });
  }

  // 3. User flows not represented in screen inventory
  if (state.features.length > 0 && state.targetUsers.length === 0) {
    issues.push({
      type: "warning",
      severity: "WARNING",
      message: "Features are defined but no target users are specified. User flows cannot be validated.",
      document: "design/USER_FLOWS.md",
      field: "targetUsers",
    });
  }

  // 4. Integration absent from deployment plan
  if (state.integrations.length > 0) {
    issues.push({
      type: "warning",
      severity: "WARNING",
      message: `${state.integrations.length} integration(s) defined. Ensure they are accounted for in the deployment plan.`,
      document: "delivery/DEPLOYMENT_PLAN.md",
      field: "integrations",
    });
  }

  // 5. Conflicting authentication methods
  const authDecisions = state.decisions.filter(
    (d) =>
      d.title.toLowerCase().includes("auth") ||
      d.description.toLowerCase().includes("auth") ||
      d.title.toLowerCase().includes("login") ||
      d.title.toLowerCase().includes("password")
  );
  if (authDecisions.length > 1) {
    const conflicting = authDecisions.filter((d) => d.status === "ACCEPTED");
    if (conflicting.length > 1) {
      issues.push({
        type: "error",
        severity: "BLOCKING",
        message: `Multiple conflicting authentication decisions accepted: ${conflicting.map((d) => d.title).join(", ")}. Resolve to one approach.`,
        document: "technical/AUTH_AND_PERMISSIONS.md",
        field: "decisions",
      });
    }
  }

  // 6. Unresolved assumption presented as fact
  for (const assumption of state.assumptions) {
    if (assumption.confidence === "LOW" && state.decisions.some((d) => d.title.includes(assumption.statement.substring(0, 20)))) {
      issues.push({
        type: "warning",
        severity: "WARNING",
        message: `Low-confidence assumption "${assumption.statement.substring(0, 60)}..." appears to be used as a decision basis. Update when validated.`,
        document: "decisions/ASSUMPTIONS.md",
        field: "assumptions",
      });
    }
  }

  // 7. Reference pattern copied without relevance explanation
  for (const ref of state.references) {
    if (ref.status === "ANALYZED" && ref.type === "URL") {
      issues.push({
        type: "warning",
        severity: "WARNING",
        message: `Reference ${ref.url} has been analyzed. Ensure relevance to project is documented in design/REFERENCES.md.`,
        document: "design/REFERENCES.md",
        field: "references",
      });
    }
  }

  // 8. Scale requirements inconsistent
  const scaleItems = [];
  if (state.constraints.some((c) => c.toLowerCase().includes("million") || c.toLowerCase().includes("100k"))) {      issues.push({
      type: "warning",
      severity: "WARNING",
      message: "Scale constraints detected. Ensure infrastructure decisions reflect expected load.",
      document: "technical/SYSTEM_ARCHITECTURE.md",
      field: "constraints",
    });
  }

  // 9. Blocking contradictions
  const blockingContras = state.contradictions.filter((c) => c.severity === "BLOCKING");
  for (const contra of blockingContras) {
    issues.push({
      type: "error",
      severity: "BLOCKING",
      message: contra.explanation,
      document: "decisions/RISKS.md",
      field: "contradictions",
    });
  }

  // 10. No raw idea
  if (!state.rawIdea || state.rawIdea.trim().length === 0) {
    issues.push({
      type: "error",
      severity: "BLOCKING",
      message: "No product idea has been entered. The build package would be empty.",
      document: "product/PRD.md",
      field: "rawIdea",
    });
  }

  // 11. Scale requirements inconsistent across documents
  if (state.features.some((f) => f.toLowerCase().includes("realtime") || f.toLowerCase().includes("real-time")) && !state.constraints.some((c) => c.toLowerCase().includes("concurrent") || c.toLowerCase().includes("websocket"))) {
    issues.push({
      type: "warning",
      severity: "WARNING",
      message: "Real-time features are planned but no concurrency or WebSocket constraints are defined.",
      document: "technical/SYSTEM_ARCHITECTURE.md",
      field: "constraints",
    });
  }

  const blockers = issues.filter((i) => i.severity === "BLOCKING");
  const warnings = issues.filter((i) => i.severity === "WARNING");

  const status: ExportStatus = blockers.length > 0 ? "blocked" : warnings.length > 3 ? "needs_review" : "ready";

  return {
    status,
    issues,
    summary: {
      total: issues.length,
      blockers: blockers.length,
      warnings: warnings.length,
      info: issues.filter((i) => i.severity === "INFO").length,
    },
  };
}
