import type { ProjectState } from "../schema";
import { validateQuestionQuality } from "../questions/quality";
import type { Question } from "../schema/question";
import type { ToolRegistry } from "../tools/registry";
import type { AgentAction } from "./actions";

export type PlannedActionPolicy = {
  allowed: boolean;
  reasons: string[];
};

/** Deterministic authority guard after schema parsing and before execution. */
export function validatePlannedAction(
  action: AgentAction,
  context: {
    project: ProjectState;
    tools: ToolRegistry;
    questionForAction?: Question;
    candidateTopics?: string[];
    explicitHumanDecision?: boolean;
    humanApprovedArtifact?: boolean;
  },
): PlannedActionPolicy {
  const reasons: string[] = [];
  if (action.type === "CALL_TOOL" && !context.tools.get(action.toolName))
    reasons.push(`Unknown tool: ${action.toolName}`);
  if (
    action.type === "RECORD_DECISION" &&
    (action.source !== "USER" || !context.explicitHumanDecision)
  )
    reasons.push("Only explicit human input may create an accepted decision.");
  if (action.type === "GENERATE_ARTIFACT" && !context.humanApprovedArtifact)
    reasons.push("Artifact generation requires explicit human approval.");
  if (action.type === "ASK_USER") {
    const topic = context.questionForAction?.topic;
    if (!context.questionForAction)
      reasons.push("ASK_USER must resolve to a canonical question.");
    if (
      topic &&
      context.candidateTopics &&
      !context.candidateTopics.includes(topic)
    )
      reasons.push("ASK_USER must select a topic from the candidate shortlist.");
    if (context.questionForAction) {
      const quality = validateQuestionQuality(
        context.questionForAction,
        context.project,
      );
      if (!quality.accepted) reasons.push(...quality.reasons);
    }
  }
  return { allowed: reasons.length === 0, reasons };
}
