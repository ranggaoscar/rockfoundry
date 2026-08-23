import type { ProjectState } from "../schema/project";
import type { DesignReadiness } from "../schema/design";

function accepted(state: ProjectState) {
  return state.decisions.filter((decision) => decision.status === "ACCEPTED");
}

export function evaluateDesignReadiness(state: ProjectState): DesignReadiness {
  const actors = [...state.targetUsers, ...state.roles].filter(Boolean);
  const workflows = state.workflows.filter(Boolean);
  const entities = state.entities.filter(Boolean);
  const decisions = accepted(state);
  const blockers: string[] = [];
  const unresolved: string[] = [];

  if (!state.rawIdea.trim() && !state.normalizedSummary)
    blockers.push("No product idea has been captured.");
  if (actors.length === 0) unresolved.push("Main actor(s) are still unclear.");
  if (workflows.length === 0)
    unresolved.push("Important workflows are still unresolved.");
  if (entities.length === 0)
    unresolved.push("Core entities/resources are still unresolved.");
  if (decisions.length === 0)
    unresolved.push("No confirmed product decisions yet.");

  const signals = [
    actors.length > 0,
    workflows.length > 0,
    entities.length > 0,
    decisions.length > 0,
    Boolean(state.normalizedSummary || state.rawIdea.trim()),
  ].filter(Boolean).length;

  let level: DesignReadiness["level"] = "BLOCKED";
  if (blockers.length === 0 && signals >= 4 && decisions.length > 0)
    level = "READY";
  else if (blockers.length === 0) level = "PARTIAL";

  const score = Math.min(100, signals * 16 + Math.min(decisions.length, 4) * 5);
  return { level, score, blockers, unresolved };
}
