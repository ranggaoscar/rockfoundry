import {
  ConversationAgentResponseSchema,
  ProjectStateSchema,
  applyConversationResponseWithPolicy,
  evaluateReadinessDirectly,
  generateGenericDecisionCandidates,
  type ConversationAgentResponse,
  type ProjectState,
} from "@rockfoundry/core";
import { prisma } from "@rockfoundry/db";
import { getAiGateway } from "./ai-provider";
import { z } from "zod";
type ConversationAction = ConversationAgentResponse["suggestedNextAction"];

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
 
export type RecentConversationMessage = {
  role: "user" | "assistant";
  text: string;
};

type ConversationMessageLike = {
  id?: unknown;
  role?: unknown;
  content?: unknown;
  text?: unknown;
  conversationTurnId?: unknown;
};

export type CurrentConversationMessageIdentity = {
  id?: string;
  conversationTurnId?: string;
};

const MAX_RECENT_CONVERSATION_ENTRIES = 12;
const MAX_RECENT_CONVERSATION_CHARACTERS = 6000;
export const MAX_RECENT_CONVERSATION_DB_ENTRIES = 24;

function normalizeConversationText(text: string) {
  return text.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function conversationMessageIdentity(
  entry: ConversationMessageLike,
): CurrentConversationMessageIdentity | undefined {
  const id = typeof entry.id === "string" ? entry.id : undefined;
  const conversationTurnId =
    typeof entry.conversationTurnId === "string"
      ? entry.conversationTurnId
      : undefined;
  return id || conversationTurnId ? { id, conversationTurnId } : undefined;
}

function isCurrentConversationMessage(
  entry: ConversationMessageLike,
  identity?: CurrentConversationMessageIdentity,
) {
  if (!identity) return false;
  return Boolean(
    (identity.id && entry.id === identity.id) ||
      (identity.conversationTurnId &&
        entry.conversationTurnId === identity.conversationTurnId),
  );
}

function findCurrentConversationMessageIdentity(
  entries: readonly ConversationMessageLike[],
  latestUserMessage: string,
) {
  const latestNormalized = normalizeConversationText(latestUserMessage);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.role !== "user") continue;
    const rawText = typeof entry.content === "string" ? entry.content : entry.text;
    if (
      typeof rawText === "string" &&
      normalizeConversationText(rawText) === latestNormalized
    ) {
      return conversationMessageIdentity(entry);
    }
  }
  return undefined;
}
 
export function conversationProjectContext(state: ProjectState) {
  const clarificationAdvisory =
    state.generationMetadata.conversationClarificationAdvisory;
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
    risks: state.risks,
    unresolvedRisks: state.risks,
    clarificationAdvisory:
      clarificationAdvisory && typeof clarificationAdvisory === "object"
        ? clarificationAdvisory
        : undefined,
  };
}

export function conversationUiState(
  state: ProjectState,
  action: ConversationAction,
) {
  const draftSpecReady = state.draftSpecReady || action.type === "CREATE_SPEC";
  return {
    draftSpecReady,
    showQuestionOptions:
      action.type === "ASK_CONTEXTUAL_QUESTION" && !draftSpecReady,
    showDraftSpecCta: draftSpecReady,
    openSpecWorkbench: action.type === "CREATE_SPEC",
    openDesignWorkbench: action.type === "OPEN_DESIGN" && draftSpecReady,
  };
}

export function formatRecentConversation(
  entries: readonly ConversationMessageLike[],
  latestUserMessage: string,
  currentMessageIdentity?: CurrentConversationMessageIdentity,
): RecentConversationMessage[] {
  const latestNormalized = normalizeConversationText(latestUserMessage);
  const identity =
    currentMessageIdentity ||
    findCurrentConversationMessageIdentity(entries, latestUserMessage);
  const messages = entries.flatMap((entry): RecentConversationMessage[] => {
    const role: RecentConversationMessage["role"] | null =
      entry.role === "user" || entry.role === "assistant" ? entry.role : null;
    const rawText = typeof entry.content === "string" ? entry.content : entry.text;
    if (!role || typeof rawText !== "string") return [];
    const text = rawText.trim();
    if (
      !text ||
      (identity
        ? isCurrentConversationMessage(entry, identity)
        : normalizeConversationText(text) === latestNormalized)
    ) {
      return [];
    }
    return [{ role, text }];
  });

  const selected: RecentConversationMessage[] = [];
  let characters = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (selected.length >= MAX_RECENT_CONVERSATION_ENTRIES || characters >= MAX_RECENT_CONVERSATION_CHARACTERS) break;
    const remaining = MAX_RECENT_CONVERSATION_CHARACTERS - characters;
    const text = messages[index].text.slice(0, remaining);
    if (!text) continue;
    selected.unshift({ role: messages[index].role, text });
    characters += text.length;
  }
  return selected;
}

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
  const preTurnReadiness = evaluateReadinessDirectly(input.state);
  const highestImpactRisk = preTurnReadiness.decisionDebt.topRisks[0] || null;
  const persistedMessages = await prisma.conversationMessage.findMany({
    where: { projectId: input.projectId },
    orderBy: { createdAt: "desc" },
    take: MAX_RECENT_CONVERSATION_DB_ENTRIES,
  });
  const recentConversation = formatRecentConversation(
    [...persistedMessages].reverse(),
    input.text,
  );
  const response = await getAiGateway().runConversationAgent({
    project: projectContext(input.state),
    latestUserMessage: input.text,
    mode: input.mode,
    riskContext: relevantRisks(input.state),
    recentConversation,
    draftSpecReady: input.state.draftSpecReady || preTurnReadiness.draftSpecReady,
    importantUnresolvedCount:
      input.state.openQuestions.length +
      input.state.assumptions.filter((assumption) => !assumption.resolved).length,
    highestImpactRisk,
  });
  const parsed = ConversationAgentResponseSchema.parse(response);
  const applied = applyConversationResponseWithPolicy(input.state, parsed, input.text);
  const postTurnReadiness = applied.readiness;
  const state = ProjectStateSchema.parse({
    ...applied.state,
    readiness: postTurnReadiness.level,
    draftSpecReady: postTurnReadiness.draftSpecReady,
    readinessScore: postTurnReadiness.score,
    readinessBreakdown: postTurnReadiness.breakdown,
    decisionDebt: postTurnReadiness.decisionDebt,
    discovery: {
      ...applied.state.discovery,
      evaluated: postTurnReadiness.discovery.evaluated,
      importantDecisionsRemaining: postTurnReadiness.discovery.importantDecisionsRemaining,
      unresolvedTopics: postTurnReadiness.discovery.unresolvedTopics,
    },
  });
  await persistConversationActivities(input.projectId, applied.response);
  return { response: applied.response, state };
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
