import {
  ProjectState,
  ProjectStateSchema,
  type Decision,
  type DecisionGraph,
} from "./schema";

export type DecisionInput = {
  topic: string;
  decision: string;
  reason?: string;
  source?: Decision["source"];
  affects?: string[];
};

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "decision"
  );
}

export function buildDecisionGraph(state: ProjectState): DecisionGraph {
  const nodes = state.decisions.map((decision) => ({
    id: decision.id,
    topic: decision.topic,
    decisionId: decision.id,
    status:
      decision.status === "SUPERSEDED"
        ? ("SUPERSEDED" as const)
        : ("ACTIVE" as const),
  }));
  const edges = state.decisions.flatMap((decision) =>
    (decision.affects || []).map((concept) => ({
      from: decision.id,
      to: concept,
      relation: "AFFECTS" as const,
      rationale: decision.reason,
    })),
  );
  return { nodes, edges };
}

export function recordDecision(
  state: ProjectState,
  input: DecisionInput,
): { state: ProjectState; decision: Decision } {
  const next = ProjectStateSchema.parse(JSON.parse(JSON.stringify(state)));
  const previous = next.decisions.find(
    (decision) =>
      decision.topic.toLowerCase() === input.topic.toLowerCase() &&
      decision.status === "ACCEPTED",
  );
  if (previous) previous.status = "SUPERSEDED";
  const decision: Decision = {
    id: `decision-${slug(input.topic)}-${Date.now()}`,
    topic: input.topic,
    decision: input.decision,
    reason: input.reason,
    source: input.source || "USER",
    confidence:
      input.source === "USER" || !input.source
        ? "EXPLICIT"
        : "STRONGLY_INFERRED",
    status: "ACCEPTED",
    affects: input.affects || [],
    supersedes: previous?.id,
  };
  next.decisions.push(decision);
  next.decisionGraph = buildDecisionGraph(next);
  return { state: next, decision };
}

export function conceptsAffectedByDecision(
  state: ProjectState,
  decisionId: string,
): string[] {
  const affected = new Set<string>();
  const queue = [decisionId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of state.decisionGraph.edges) {
      if (edge.from === current && !affected.has(edge.to)) {
        affected.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  return [...affected];
}
