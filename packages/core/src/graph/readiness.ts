import { ProjectState } from "../schema";

export function evaluateReadiness(state: ProjectState, overallScore: number): string {
  // Simple deterministic readiness calculation
  
  if (state.contradictions.some(c => c.severity === "BLOCKING")) {
    return "IDEA_READY"; // Cannot progress with blockers
  }

  if (overallScore < 30) return "IDEA_READY";
  if (overallScore < 60) return "PROTOTYPE_READY";
  if (overallScore < 90) return "MVP_READY";
  
  return "PRODUCTION_READY";
}