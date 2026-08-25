import {
  ConversationAgentResponseSchema,
  applyConversationResponse,
  evaluateReadinessDirectly,
  generateGenericDecisionCandidates,
  type ConversationAgentResponse,
  type ProjectState,
} from "@rockfoundry/core";
import { prisma } from "@rockfoundry/db";
import { getAiGateway } from "./ai-provider";
import { z } from "zod";

export const ConversationModeSchema = z.enum([
  "BRAINSTORM",
  "CLARIFICATION",
  "CORRECTION",
  "SPEC_REQUEST",
  "DESIGN_REQUEST",
  "RESEARCH_REQUEST",
  "REFERENCE",
  "HANDOFF_REQUEST",
]);
export type ConversationMode = z.infer<typeof ConversationModeSchema>;

export type ConversationAgentInput = {
  projectId: string;
  text: string;
  mode: ConversationMode;
  state: ProjectState;
};

function relevantRisks(state: ProjectState) {
  return generateGenericDecisionCandidates(state)
    .slice(0, 6)
    .map((risk) => ({
      topic: risk.topic,
      title: risk.title,
      reason: risk.description,
      priority: risk.priority,
    }));
}

function projectContext(state: ProjectState) {
  return {
    name: state.name,
    rawIdea: state.rawIdea,
    normalizedSummary: state.normalizedSummary || "",
    productType: state.productType || "",
    targetUsers: state.targetUsers,
    roles: state.roles,
    entities: state.entities,
    workflows: state.workflows,
    features: state.features,
    objectives: state.objectives,
    constraints: state.constraints,
    integrations: state.integrations,
    acceptedDecisions: state.decisions
      .filter((decision) => decision.status === "ACCEPTED")
      .map(({ topic, decision, reason, affects }) => ({
        topic,
        decision,
        reason,
        affects,
      })),
    proposals: Array.isArray(state.generationMetadata.conversationProposals)
      ? state.generationMetadata.conversationProposals
      : [],
    assumptions: state.assumptions
      .filter((assumption) => !assumption.resolved)
      .map(({ statement, confidence, impact }) => ({
        statement,
        confidence,
        impact,
      })),
    openQuestions: state.openQuestions,
  };
}

export async function runConversationAgent(input: ConversationAgentInput) {
  const readiness = evaluateReadinessDirectly(input.state);
  const highestImpactRisk = readiness.decisionDebt.topRisks[0] || null;
  const response = await getAiGateway().runConversationAgent({
    project: projectContext(input.state),
    latestUserMessage: input.text,
    mode: input.mode,
    riskContext: relevantRisks(input.state),
    draftSpecReady: input.state.draftSpecReady || readiness.draftSpecReady,
    importantUnresolvedCount:
      input.state.openQuestions.length +
      input.state.assumptions.filter((assumption) => !assumption.resolved).length,
    highestImpactRisk,
  });
  const parsed = ConversationAgentResponseSchema.parse(response);
  const nextState = applyConversationResponse(input.state, parsed, input.text);
  await persistConversationActivities(input.projectId, parsed);
  return { response: parsed, state: nextState };
}

async function persistConversationActivities(
  projectId: string,
  response: ConversationAgentResponse,
) {
  if (!response.unresolvedRisks.length && !response.proposals.length) return;
  await prisma.agentRun.create({
    data: {
      projectId,
      goal: "Curate the latest natural conversation turn",
      status: "COMPLETED",
      actionType: response.mode,
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });
}

export function modeFromMessage(
  text: string,
  explicitMode?: ConversationMode,
): ConversationMode {
  if (explicitMode) return explicitMode;
  if (/https?:\/\//i.test(text)) return "REFERENCE";
  if (/\b(riset|research|cari|bandingkan|referensi)\b/i.test(text)) {
    return "RESEARCH_REQUEST";
  }
  if (/\b(buat|bikin|generate)\s+(design|desain|prototype)\b/i.test(text)) {
    return "DESIGN_REQUEST";
  }
  if (/\b(spec|spesifikasi|product spec|handoff|dokumen)\b/i.test(text)) {
    return /handoff|dokumen/i.test(text) ? "HANDOFF_REQUEST" : "SPEC_REQUEST";
  }
  if (/\b(sebenarnya|bukan|koreksi|revisi|eh|ternyata)\b/i.test(text)) {
    return "CORRECTION";
  }
  return "BRAINSTORM";
}
