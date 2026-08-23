import {
  AgentActionSchema,
  type AgentObservation,
  type AgentPlanner,
  type DecisionCandidate,
  type ProjectState,
  type Question,
} from "@rockfoundry/core";
import { getAiGateway } from "./ai-provider";
import { resolveProviderSettings } from "./provider-config";

function plannerContext(input: {
  project: ProjectState;
  candidates: DecisionCandidate[];
  canonicalQuestion: Question;
  intent: string;
  observations: AgentObservation[];
  tools: Array<{ name: string; description: string }>;
  latestUserMessage?: string;
}) {
  return JSON.stringify({
    language: /\b(saya|mau|ingin|bikin|untuk|dengan)\b/i.test(
      input.project.rawIdea,
    )
      ? "id"
      : "en",
    intent: input.intent,
    latestUserMessage: input.latestUserMessage || null,
    summary: input.project.normalizedSummary || input.project.rawIdea,
    canonicalQuestion: {
      id: input.canonicalQuestion.id,
      topic: input.canonicalQuestion.topic,
      text: input.canonicalQuestion.text,
      relatedRequirementIds: input.canonicalQuestion.relatedRequirementIds,
      options: input.canonicalQuestion.options || [],
    },
    decisions: input.project.decisions
      .filter((decision) => decision.status === "ACCEPTED")
      .map(({ topic, decision }) => ({ topic, decision })),
    contradictions: input.project.contradictions.filter(
      (item) => item.status === "OPEN",
    ),
    decisionDebt: input.project.decisionDebt.summary,
    candidates: input.candidates.slice(0, 5).map((candidate) => ({
      topic: candidate.topic,
      subject: candidate.subject,
      priority: candidate.priority,
      prerequisites: candidate.prerequisites,
    })),
    tools: input.tools,
    observations: input.observations.map(({ type, summary }) => ({
      type,
      summary,
    })),
  });
}

const SYSTEM = `You are RockFoundry's constrained discovery planner. Return exactly one JSON AgentAction.
The canonicalQuestion is deterministic product intelligence. For ASK_USER you MUST use its exact id, text, relatedRequirementIds, and options. You may choose whether to ask it now or call a permitted tool first. For RESEARCH_REQUEST, call web_search before ASK_USER. Research is evidence, never a human decision. Do not invent tools, question IDs, or decisions. Do not expose internal reasoning.`;

export function createModelDiscoveryPlanner(
  candidates: DecisionCandidate[],
  canonicalQuestion: Question,
  intent: string,
): AgentPlanner | null {
  const settings = resolveProviderSettings();
  if (settings.mode !== "openai-compatible") return null;
  return {
    async nextAction(input) {
      const result = await getAiGateway().runPlannerAction<unknown>({
        system: SYSTEM,
        user: plannerContext({
          ...input,
          candidates,
          canonicalQuestion,
          intent,
        }),
      });
      const action = AgentActionSchema.parse(result.data);
      if (
        intent === "RESEARCH_REQUEST" &&
        input.observations.length === 0 &&
        (action.type !== "CALL_TOOL" || action.toolName !== "web_search")
      ) {
        return {
          id: "research-web",
          type: "CALL_TOOL" as const,
          toolName: "web_search",
          input: {
            query: input.latestUserMessage || input.project.rawIdea,
            maxResults: 5,
          },
          rationale:
            "Research intent requires evidence before the next question.",
        };
      }
      return action;
    },
  };
}
