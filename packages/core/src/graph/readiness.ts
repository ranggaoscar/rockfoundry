import { ProjectState } from "../schema";
import { ReadinessResult, evaluateReadinessDirectly } from "../graph/evaluator";

export { evaluateReadinessDirectly } from "./evaluator";
export type { ReadinessResult } from "./evaluator";

export function evaluateReadiness(
  state: ProjectState,
  overallScore?: number,
): ReadinessResult["level"] {
  const result = evaluateReadinessDirectly(state);
  if (result.blocking.length > 0) return "NOT_READY";
  const score = overallScore ?? result.score;
  if (score >= 72) return "BUILD_READY";
  if (score >= 38) return "DRAFT_READY";
  return "NOT_READY";
}
