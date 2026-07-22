import { ProjectState } from "../schema";

export function evaluateReadinessDirectly(state: ProjectState): {
  score: number;
  level: string;
  breakdown: Record<string, number>;
  blocking: string[];
} {
  const blocking: string[] = [];
  const breakdown: Record<string, number> = {};

  // Base completeness (max 50 points)
  let baseScore = 0;
  if (state.normalizedSummary) baseScore += 10;
  if (state.productType) baseScore += 5;
  if (state.targetUsers.length > 0) baseScore += 10;
  if (state.entities.length > 0) baseScore += 10;
  if (state.features.length > 0) baseScore += 10;
  if (state.objectives.length > 0) baseScore += 5;
  breakdown["completeness"] = baseScore;

  // Decision quality (max 30 points)
  let decisionScore = 0;
  if (state.decisions.length > 0) decisionScore += Math.min(20, state.decisions.length * 5);
  if (state.assumptions.length === 0) decisionScore += 10;
  else {
    const lowConf = state.assumptions.filter(a => a.confidence === "LOW").length;
    if (lowConf > 0) decisionScore += Math.max(0, 10 - lowConf * 3);
    else decisionScore += 10;
  }
  breakdown["decisions"] = decisionScore;

  // Risk and contradictions (max 20 points, subtracted)
  let riskPenalty = 0;
  const blockingContras = state.contradictions.filter(c => c.severity === "BLOCKING");
  const warnContras = state.contradictions.filter(c => c.severity === "WARNING");
  riskPenalty += blockingContras.length * 10;
  riskPenalty += warnContras.length * 3;
  if (blockingContras.length > 0) {
    blocking.push(...blockingContras.map(c => c.explanation));
  }
  breakdown["riskPenalty"] = -riskPenalty;

  const total = Math.max(0, Math.min(100, baseScore + decisionScore - riskPenalty));

  let level = "IDEA_READY";
  if (total >= 90 && blocking.length === 0) level = "PRODUCTION_READY";
  else if (total >= 70 && blocking.length === 0) level = "MVP_READY";
  else if (total >= 40) level = "PROTOTYPE_READY";

  return { score: total, level, breakdown, blocking };
}
