import { ProjectState } from "../schema";

export type ConsistencySeverity = "PASS" | "WARNING" | "BLOCKING";
export interface ConsistencyIssue {
  severity: ConsistencySeverity;
  message: string;
  document?: "BRD" | "PRD" | "ERD";
  field?: string;
}
export interface ConsistencyReport {
  status: ConsistencySeverity;
  issues: ConsistencyIssue[];
  summary: { total: number; blockers: number; warnings: number };
}

export function validateConsistency(state: ProjectState): ConsistencyReport {
  const issues: ConsistencyIssue[] = [];
  const add = (
    severity: ConsistencySeverity,
    message: string,
    document?: ConsistencyIssue["document"],
    field?: string,
  ) => issues.push({ severity, message, document, field });

  if (!state.rawIdea.trim())
    add("BLOCKING", "The project has no raw idea.", "BRD", "rawIdea");
  if (state.targetUsers.length === 0)
    add("WARNING", "No target user is explicit yet.", "BRD", "targetUsers");
  if (state.objectives.length === 0)
    add(
      "WARNING",
      "No business objective is explicit yet.",
      "BRD",
      "objectives",
    );
  if (state.features.length > 0 && state.entities.length === 0)
    add(
      "WARNING",
      "Features exist but no data entities are defined.",
      "ERD",
      "entities",
    );
  if (state.entities.length > 0 && state.features.length === 0)
    add(
      "WARNING",
      "Data entities exist but no product behavior uses them.",
      "PRD",
      "features",
    );
  if (state.roles.length > 1 && state.permissions.length === 0)
    add(
      "WARNING",
      "Multiple roles exist but their permissions are unresolved.",
      "PRD",
      "permissions",
    );
  if (
    state.contradictions.some(
      (item) => item.status === "OPEN" && item.severity === "BLOCKING",
    )
  )
    add(
      "BLOCKING",
      "At least one blocking contradiction remains open.",
      "PRD",
      "contradictions",
    );
  if (
    state.decisions.some(
      (item) => item.status === "ACCEPTED" && item.confidence !== "EXPLICIT",
    )
  )
    add(
      "WARNING",
      "An accepted decision is not sourced from an explicit user confirmation.",
      "BRD",
      "decisions",
    );
  if (state.openQuestions.length > 0)
    add(
      "WARNING",
      `${state.openQuestions.length} open question(s) remain visible in the documents.`,
      "PRD",
      "openQuestions",
    );
  if (state.entities.length > 0 && state.businessRules.length === 0)
    add(
      "WARNING",
      "Entities are present but no business rules are explicit.",
      "ERD",
      "businessRules",
    );

  const blockers = issues.filter(
    (issue) => issue.severity === "BLOCKING",
  ).length;
  const warnings = issues.filter(
    (issue) => issue.severity === "WARNING",
  ).length;
  return {
    status: blockers > 0 ? "BLOCKING" : warnings > 0 ? "WARNING" : "PASS",
    issues,
    summary: { total: issues.length, blockers, warnings },
  };
}
