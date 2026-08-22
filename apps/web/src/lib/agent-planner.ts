import {
  AgentActionSchema,
  type AgentObservation,
  type AgentPlanner,
  type DecisionCandidate,
  type ProjectState,
} from "@rockfoundry/core";
import { getAiGateway } from "./ai-provider";
import { resolveProviderSettings } from "./provider-config";

function plannerContext(input: {
  project: ProjectState;
  candidates: DecisionCandidate[];
  observations: AgentObservation[];
  tools: Array<{ name: string; description: string }>;
  latestUserMessage?: string;
}) {
  return JSON.stringify({
    language: /\b(saya|mau|ingin|bikin|untuk|dengan)\b/i.test(input.project.rawIdea)
      ? "id"
      : "en",
    latestUserMessage: input.latestUserMessage || null,
    summary: input.project.normalizedSummary || input.project.rawIdea,
    activeQuestionId: input.project.discovery.activeQuestionId || null,
    decisions: input.project.decisions
      .filter((decision) => decision.status === "ACCEPTED")
      .map(({ topic, decision }) => ({ topic, decision })),
    assumptions: input.project.assumptions.map(({ statement, confidence }) => ({ statement, confidence })),
    contradictions: input.project.contradictions.filter((item) => item.status === "OPEN"),
    decisionDebt: input.project.decisionDebt.summary,
    candidates: input.candidates.slice(0, 5).map((candidate) => ({
      topic: candidate.topic,
      archetype: candidate.archetype,
      subject: candidate.subject,
      subjectType: candidate.subjectType,
      priority: candidate.priority,
      evidence: candidate.evidence,
      affects: candidate.affects,
      prerequisites: candidate.prerequisites,
    })),
    tools: input.tools,
    observations: input.observations.map(({ type, summary }) => ({ type, summary })),
  });
}

const SYSTEM = `You are RockFoundry's constrained discovery planner. Return exactly one JSON AgentAction.
You may choose only a provided tool or one candidate topic. Research is evidence, never a human decision. Never emit RECORD_DECISION unless the latest user message explicitly answers the active question and source is USER. Do not invent tools. Prefer ASK_USER for the highest-ranked foundational unresolved candidate. Do not expose internal reasoning.`;

export function createModelDiscoveryPlanner(candidates: DecisionCandidate[]): AgentPlanner | null {
  const settings = resolveProviderSettings();
  if (settings.mode !== "openai-compatible") return null;
  return {
    async nextAction(input) {
      const result = await getAiGateway().runPlannerAction<unknown>({
        system: SYSTEM,
        user: plannerContext({ ...input, candidates }),
      });
      return AgentActionSchema.parse(result.data);
    },
  };
}
