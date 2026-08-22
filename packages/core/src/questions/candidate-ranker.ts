import type { ProjectState } from "../schema";
import type { ArtifactGapSignal } from "./artifact-gap-signals";
import type { DecisionCandidate } from "./archetypes";
import type { StructuralContext } from "./context-extractor";

function acceptedAffects(state: ProjectState) {
  const concepts = new Set<string>();
  for (const decision of state.decisions) {
    if (!["ACCEPTED", "PROPOSED"].includes(decision.status)) continue;
    for (const concept of decision.affects || [])
      concepts.add(concept.toLowerCase());
  }
  for (const edge of state.decisionGraph.edges) {
    if (edge.relation === "AFFECTS") concepts.add(edge.to.toLowerCase());
  }
  return concepts;
}

function scoreCandidate(
  state: ProjectState,
  candidate: DecisionCandidate,
  context: StructuralContext,
  gaps: ArtifactGapSignal[],
) {
  const concepts = acceptedAffects(state);
  const graphOverlap = candidate.affects.filter((concept) =>
    concepts.has(concept.toLowerCase()),
  ).length;
  const gap = candidate.artifactGap
    ? gaps.find((item) => item.id === candidate.artifactGap)
    : undefined;
  const contextDepth =
    context.entities.length +
    context.roles.length +
    context.workflows.length +
    context.boundaries.length;
  const contextBonus = Math.min(8, contextDepth);
  const riskDimensionScore =
    candidate.risk.workflow * 1.2 +
    candidate.risk.data * 1.1 +
    candidate.risk.permissions * 1.1 +
    candidate.risk.crossBoundary * 0.8 +
    candidate.risk.contradiction;
  const confidencePenalty =
    candidate.confidence === "UNKNOWN"
      ? 8
      : candidate.confidence === "WEAKLY_INFERRED"
        ? 3
        : 0;

  const prerequisiteBonus =
    context.productIdentityAmbiguous && candidate.topic === "product_identity"
      ? 10_000
      : 0;

  return (
    prerequisiteBonus +
    candidate.priority * candidate.riskWeight * 2 +
    riskDimensionScore +
    candidate.estimatedChangeCost * 1.5 +
    graphOverlap * 4 +
    (gap ? gap.priority * 2 : 0) +
    contextBonus -
    confidencePenalty
  );
}

/**
 * Rank uncertainty by downstream consequence, not by the number of questions
 * available. Existing decision-graph affects edges provide a dependency bonus
 * so the next question follows known blast radius instead of a fixed script.
 */
export function rankDecisionCandidates(
  state: ProjectState,
  candidates: DecisionCandidate[],
  context: StructuralContext,
  gaps: ArtifactGapSignal[],
): DecisionCandidate[] {
  return candidates
    .filter((candidate) => candidate.prerequisitesSatisfied)
    .map((candidate, index) => ({
      candidate,
      score: scoreCandidate(state, candidate, context, gaps),
      index,
    }))
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;
      if (scoreDelta !== 0) return scoreDelta;
      return left.index - right.index;
    })
    .map((item) => item.candidate);
}
