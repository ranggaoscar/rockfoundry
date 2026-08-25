import { z } from "zod";
import {
  ProjectStateSchema,
  type Assumption,
  type ProjectState,
} from "../schema";
import { recordDecision } from "../decision-graph";
import { evaluateReadinessDirectly } from "../graph/evaluator";

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

export const ConversationQuickReplySchema = z.object({
  label: z.string().min(1),
  value: z.string().optional(),
  description: z.string().optional(),
});
export type ConversationQuickReply = z.infer<
  typeof ConversationQuickReplySchema
>;

export const ConversationExplicitFactSchema = z.object({
  path: z.string().min(1),
  value: z.string().min(1),
  evidence: z.string().min(1),
});
export type ConversationExplicitFact = z.infer<
  typeof ConversationExplicitFactSchema
>;

export const ConversationConfirmedDecisionSchema = z.object({
  topic: z.string().min(1),
  decision: z.string().min(1),
  reason: z.string().optional(),
  affects: z.array(z.string()).default([]),
  evidence: z.string().min(1),
});
export type ConversationConfirmedDecision = z.infer<
  typeof ConversationConfirmedDecisionSchema
>;

export const ConversationCorrectionSchema = z.object({
  path: z.string().min(1),
  value: z.string().min(1),
  replaces: z.string().optional(),
  evidence: z.string().min(1),
});
export type ConversationCorrection = z.infer<
  typeof ConversationCorrectionSchema
>;

export const ConversationResolvedQuestionSchema = z.object({
  question: z.string().min(1),
  evidence: z.string().min(1),
});
export const ConversationResolvedAssumptionSchema = z.object({
  statement: z.string().min(1),
  resolution: z.string().min(1),
  evidence: z.string().min(1),
});

export const ConversationStateDeltaSchema = z.object({
  explicitFacts: z.array(ConversationExplicitFactSchema).default([]),
  confirmedDecisions: z.array(ConversationConfirmedDecisionSchema).default([]),
  corrections: z.array(ConversationCorrectionSchema).default([]),
  resolvedQuestions: z.array(ConversationResolvedQuestionSchema).default([]),
  resolvedAssumptions: z.array(ConversationResolvedAssumptionSchema).default([]),
});
export type ConversationStateDelta = z.infer<
  typeof ConversationStateDeltaSchema
>;

export const ConversationProposalSchema = z.object({
  topic: z.string().min(1),
  statement: z.string().min(1),
  reason: z.string().min(1),
  affects: z.array(z.string()).default([]),
});
export type ConversationProposal = z.infer<
  typeof ConversationProposalSchema
>;

export const ConversationAssumptionSchema = z.object({
  statement: z.string().min(1),
  confidence: z.enum(["STRONGLY_INFERRED", "WEAKLY_INFERRED", "UNKNOWN"]),
  impact: z.enum(["LOW", "MEDIUM", "HIGH"]),
  validationStrategy: z.string().optional(),
});
export type ConversationAssumption = z.infer<
  typeof ConversationAssumptionSchema
>;

export const ConversationRiskSchema = z.object({
  topic: z.string().min(1),
  title: z.string().min(1),
  reason: z.string().min(1),
  priority: z.number().int().min(1).max(10).default(5),
});
export type ConversationRisk = z.infer<typeof ConversationRiskSchema>;

export const ConversationSuggestedActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("NONE") }),
  z.object({
    type: z.literal("ASK_CONTEXTUAL_QUESTION"),
    question: z.string().min(1),
    quickReplies: z.array(ConversationQuickReplySchema).default([]),
  }),
  z.object({ type: z.literal("CREATE_SPEC") }),
  z.object({ type: z.literal("OPEN_DESIGN") }),
  z.object({ type: z.literal("GENERATE_HANDOFF") }),
]);
export type ConversationSuggestedAction = z.infer<
  typeof ConversationSuggestedActionSchema
>;

export const ConversationAgentResponseSchema = z.object({
  message: z.string().min(1),
  mode: ConversationModeSchema,
  quickReplies: z.array(ConversationQuickReplySchema).default([]),
  stateDelta: ConversationStateDeltaSchema.default({
    explicitFacts: [],
    confirmedDecisions: [],
    corrections: [],
    resolvedQuestions: [],
    resolvedAssumptions: [],
  }),
  proposals: z.array(ConversationProposalSchema).default([]),
  assumptions: z.array(ConversationAssumptionSchema).default([]),
  unresolvedRisks: z.array(ConversationRiskSchema).default([]),
  suggestedNextAction: ConversationSuggestedActionSchema.default({ type: "NONE" }),
});
export type ConversationAgentResponse = z.infer<
  typeof ConversationAgentResponseSchema
>;

const ARRAY_FACT_PATHS = new Set([
  "targetUsers",
  "platforms",
  "objectives",
  "problems",
  "constraints",
  "entities",
  "features",
  "workflows",
  "roles",
  "permissions",
  "integrations",
  "design",
  "businessRules",
]);

/** Normalize user/evidence text before deterministic substring matching. */
export function normalizeConversationText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘“”"`]/g, "")
    .replace(/[‐‑‒–—―-]/g, " ")
    .replace(/[,.!?;:()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isGroundedConversationEvidence(
  evidence: string,
  latestUserMessage: string,
): boolean {
  const normalizedEvidence = normalizeConversationText(evidence);
  const normalizedLatest = normalizeConversationText(latestUserMessage);
  return (
    normalizedEvidence.length >= 3 &&
    /[\p{L}\p{N}]/u.test(normalizedEvidence) &&
    normalizedLatest.includes(normalizedEvidence)
  );
}

function isGroundedConversationValue(value: string, latestUserMessage: string) {
  const normalizedValue = normalizeConversationText(value);
  const normalizedLatest = normalizeConversationText(latestUserMessage);
  return (
    normalizedValue.length >= 3 &&
    /[\p{L}\p{N}]/u.test(normalizedValue) &&
    normalizedLatest.includes(normalizedValue)
  );
}

function isGroundedConversationDecision(
  topic: string,
  decision: string,
  latestUserMessage: string,
) {
  if (!isGroundedConversationValue(decision, latestUserMessage)) return false;
  const normalizedTopic = normalizeConversationText(topic.replace(/[_-]+/g, " "));
  const topicIsIdentifier = /^[\p{L}\p{N}]+(?:[_-][\p{L}\p{N}]+)+$/u.test(
    topic.trim(),
  );
  return (
    topicIsIdentifier ||
    (normalizedTopic.length >= 3 &&
      normalizeConversationText(latestUserMessage).includes(normalizedTopic))
  );
}
function isGroundedExplicitFact(
  item: ConversationExplicitFact,
  latestUserMessage: string,
) {
  return (
    isGroundedConversationEvidence(item.evidence, latestUserMessage) &&
    isGroundedConversationValue(item.value, latestUserMessage)
  );
}

function isGroundedCorrection(
  item: ConversationCorrection,
  latestUserMessage: string,
) {
  return (
    isGroundedConversationEvidence(item.evidence, latestUserMessage) &&
    isGroundedConversationValue(item.value, latestUserMessage) &&
    (!item.replaces || isGroundedConversationValue(item.replaces, latestUserMessage))
  );
}

function isGroundedResolutionTarget(target: string, latestUserMessage: string) {
  return isGroundedConversationValue(target, latestUserMessage);
}

function isGroundedConfirmedDecision(
  item: ConversationConfirmedDecision,
  latestUserMessage: string,
) {
  return (
    isGroundedConversationEvidence(item.evidence, latestUserMessage) &&
    isGroundedConversationDecision(item.topic, item.decision, latestUserMessage)
  );
}

/** Keep canonical deltas grounded and allow at most one contextual ask. */
export function groundConversationResponse(
  rawResponse: ConversationAgentResponse,
  latestUserMessage: string,
): ConversationAgentResponse {
  const response = ConversationAgentResponseSchema.parse(rawResponse);
  return {
    ...response,
    stateDelta: {
      explicitFacts: response.stateDelta.explicitFacts.filter((item) =>
        isGroundedExplicitFact(item, latestUserMessage),
      ),
      confirmedDecisions: response.stateDelta.confirmedDecisions.filter((item) =>
        isGroundedConfirmedDecision(item, latestUserMessage),
      ),
      corrections: response.stateDelta.corrections.filter((item) =>
        isGroundedCorrection(item, latestUserMessage),
      ),
      resolvedQuestions: response.stateDelta.resolvedQuestions.filter((item) =>
        isGroundedConversationEvidence(item.evidence, latestUserMessage),
      ),
      resolvedAssumptions: response.stateDelta.resolvedAssumptions.filter((item) =>
        isGroundedConversationEvidence(item.evidence, latestUserMessage),
      ),
    },
  };
}

export function enforceConversationQuestionPolicy(
  rawResponse: ConversationAgentResponse,
  state: ProjectState,
  options: { draftSpecReady?: boolean } = {},
): ConversationAgentResponse {
  const response = ConversationAgentResponseSchema.parse(rawResponse);
  const action = response.suggestedNextAction;
  if (action.type !== "ASK_CONTEXTUAL_QUESTION") return response;
  if (options.draftSpecReady ?? state.draftSpecReady) {
    return { ...response, suggestedNextAction: { type: "CREATE_SPEC" } };
  }
  const normalizedQuestion = normalizeConversationText(action.question);
  const previousResolutions = state.generationMetadata.conversationResolutions;
  const resolvedQuestions = Array.isArray(previousResolutions)
    ? previousResolutions.flatMap((entry) => {
        if (!entry || typeof entry !== "object" || !("question" in entry)) return [];
        const question = entry.question;
        return typeof question === "string" ? [question] : [];
      })
    : [];
  const duplicate = [...state.openQuestions, ...resolvedQuestions].some(
    (question) => normalizeConversationText(question) === normalizedQuestion,
  );
  return duplicate
    ? { ...response, suggestedNextAction: { type: "NONE" } }
    : response;
}
function cloneState(state: ProjectState): ProjectState {
  return ProjectStateSchema.parse(JSON.parse(JSON.stringify(state)));
}

function addProvenance(
  state: ProjectState,
  key: string,
  evidence: string,
  source: "USER" | "AGENT_INFERENCE",
  confidence: "EXPLICIT" | "STRONGLY_INFERRED" | "WEAKLY_INFERRED" | "UNKNOWN",
) {
  state.provenance[key] = { source, confidence, evidence };
}

function arrayField(state: ProjectState, path: string): string[] | null {
  if (!ARRAY_FACT_PATHS.has(path)) return null;
  const value = state[path as keyof ProjectState];
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? (value as string[])
    : null;
}

function applyExplicitFact(state: ProjectState, fact: ConversationExplicitFact) {
  const values = arrayField(state, fact.path);
  if (values) {
    if (!values.includes(fact.value)) values.push(fact.value);
    addProvenance(
      state,
      `${fact.path}.${fact.value}`,
      fact.evidence,
      "USER",
      "EXPLICIT",
    );
    return;
  }
  if (fact.path === "normalizedSummary" || fact.path === "productType") {
    state[fact.path] = fact.value;
    addProvenance(state, fact.path, fact.evidence, "USER", "EXPLICIT");
  }
}

function applyCorrection(state: ProjectState, correction: ConversationCorrection) {
  const values = arrayField(state, correction.path);
  const previousValue = correction.replaces;
  if (values) {
    if (previousValue) {
      const index = values.indexOf(previousValue);
      if (index >= 0) values.splice(index, 1);
    }
    if (!values.includes(correction.value)) values.push(correction.value);
    addProvenance(
      state,
      `${correction.path}.${correction.value}`,
      correction.evidence,
      "USER",
      "EXPLICIT",
    );
  } else if (
    correction.path === "normalizedSummary" ||
    correction.path === "productType"
  ) {
    state[correction.path] = correction.value;
    addProvenance(
      state,
      correction.path,
      correction.evidence,
      "USER",
      "EXPLICIT",
    );
  }

  const history = Array.isArray(state.generationMetadata.conversationCorrections)
    ? state.generationMetadata.conversationCorrections
    : [];
  history.push({
    path: correction.path,
    from: previousValue || null,
    to: correction.value,
    evidence: correction.evidence,
    createdAt: new Date().toISOString(),
  });
  state.generationMetadata = {
    ...state.generationMetadata,
    conversationCorrections: history,
  };
}

function applyAssumption(state: ProjectState, assumption: ConversationAssumption) {
  if (state.assumptions.some((item) => item.statement === assumption.statement)) {
    return;
  }
  const item: Assumption = {
    id: `conversation-assumption-${state.assumptions.length + 1}`,
    statement: assumption.statement,
    confidence: assumption.confidence,
    impact: assumption.impact,
    source: "AGENT_INFERENCE",
    validationStrategy: assumption.validationStrategy,
    resolved: false,
  };
  state.assumptions.push(item);
  addProvenance(
    state,
    `assumption.${assumption.statement}`,
    assumption.validationStrategy || "Conversation Agent inference.",
    "AGENT_INFERENCE",
    assumption.confidence,
  );
}

function appendConversationResolution(
  state: ProjectState,
  resolution: {
    kind: "QUESTION" | "ASSUMPTION";
    question?: string;
    statement?: string;
    resolution: string;
    evidence: string;
  },
) {
  const history = Array.isArray(state.generationMetadata.conversationResolutions)
    ? state.generationMetadata.conversationResolutions
    : [];
  history.push({
    ...resolution,
    source: "USER",
    confidence: "EXPLICIT",
    createdAt: new Date().toISOString(),
  });
  state.generationMetadata = {
    ...state.generationMetadata,
    conversationResolutions: history,
  };
}

export function applyConversationResponse(
  currentState: ProjectState,
  rawResponse: ConversationAgentResponse,
  latestUserMessage: string,
): ProjectState {
  const state = cloneState(currentState);
  const response = enforceConversationQuestionPolicy(
    groundConversationResponse(rawResponse, latestUserMessage),
    state,
  );
  const existingAssumptionIds = new Set(
    state.assumptions.map((assumption) => assumption.id),
  );

  for (const fact of response.stateDelta.explicitFacts) {
    applyExplicitFact(state, fact);
  }
  for (const correction of response.stateDelta.corrections) {
    applyCorrection(state, correction);
  }
  for (const decision of response.stateDelta.confirmedDecisions) {
    const recorded = recordDecision(state, {
      topic: decision.topic,
      decision: decision.decision,
      reason: decision.reason || decision.evidence,
      source: "USER",
      affects: decision.affects,
    });
    Object.assign(state, recorded.state);
    addProvenance(
      state,
      `decision.${decision.topic}`,
      decision.evidence,
      "USER",
      "EXPLICIT",
    );
  }
  for (const assumption of response.assumptions) {
    applyAssumption(state, assumption);
  }

  for (const resolved of response.stateDelta.resolvedQuestions) {
    const index = state.openQuestions.findIndex(
      (question) =>
        normalizeConversationText(question) ===
        normalizeConversationText(resolved.question),
    );
    if (index < 0 || !isGroundedConversationEvidence(resolved.evidence, latestUserMessage)) continue;
    const question = state.openQuestions[index];
    state.openQuestions.splice(index, 1);
    addProvenance(
      state,
      `resolvedQuestion.${question}`,
      resolved.evidence,
      "USER",
      "EXPLICIT",
    );
    appendConversationResolution(state, {
      kind: "QUESTION",
      question,
      resolution: resolved.evidence,
      evidence: resolved.evidence,
    });
  }
  for (const resolved of response.stateDelta.resolvedAssumptions) {
    const assumption = state.assumptions.find(
      (item) =>
        existingAssumptionIds.has(item.id) &&
        normalizeConversationText(item.statement) ===
          normalizeConversationText(resolved.statement),
    );
    if (!assumption || !isGroundedConversationEvidence(resolved.evidence, latestUserMessage)) continue;
    assumption.resolved = true;
    addProvenance(
      state,
      `assumption.${assumption.statement}`,
      resolved.evidence,
      "USER",
      "EXPLICIT",
    );
    appendConversationResolution(state, {
      kind: "ASSUMPTION",
      statement: assumption.statement,
      resolution: resolved.resolution,
      evidence: resolved.evidence,
    });
  }

  const proposals = Array.isArray(state.generationMetadata.conversationProposals)
    ? state.generationMetadata.conversationProposals
    : [];
  for (const proposal of response.proposals) {
    proposals.push({
      ...proposal,
      status: "PROPOSED",
      createdAt: new Date().toISOString(),
    });
  }
  const risks = new Set(state.risks);
  for (const risk of response.unresolvedRisks) {
    risks.add(`${risk.title}: ${risk.reason}`);
  }
  state.risks = [...risks];
  if (response.suggestedNextAction.type === "ASK_CONTEXTUAL_QUESTION") {
    if (!state.openQuestions.includes(response.suggestedNextAction.question)) {
      state.openQuestions.push(response.suggestedNextAction.question);
    }
  }
  state.discovery.activeQuestionId = undefined;
  state.generationMetadata = {
    ...state.generationMetadata,
    conversationProposals: proposals,
    lastConversationMode: response.mode,
    lastConversationAction: response.suggestedNextAction.type,
  };
  return ProjectStateSchema.parse(state);
}
export function applyConversationResponseWithPolicy(
  currentState: ProjectState,
  rawResponse: ConversationAgentResponse,
  latestUserMessage: string,
) {
  const grounded = groundConversationResponse(rawResponse, latestUserMessage);
  const state = applyConversationResponse(
    currentState,
    grounded,
    latestUserMessage,
  );
  const readiness = evaluateReadinessDirectly(state);
  const response = enforceConversationQuestionPolicy(
    grounded,
    currentState,
    { draftSpecReady: readiness.draftSpecReady },
  );
  if (
    grounded.suggestedNextAction.type === "ASK_CONTEXTUAL_QUESTION" &&
    response.suggestedNextAction.type !== "ASK_CONTEXTUAL_QUESTION"
  ) {
    const normalizedQuestion = normalizeConversationText(
      grounded.suggestedNextAction.question,
    );
    const previousCount = currentState.openQuestions.filter(
      (question) => normalizeConversationText(question) === normalizedQuestion,
    ).length;
    for (
      let index = state.openQuestions.length - 1;
      index >= 0 &&
      state.openQuestions.filter(
        (question) => normalizeConversationText(question) === normalizedQuestion,
      ).length > previousCount;
      index -= 1
    ) {
      if (normalizeConversationText(state.openQuestions[index]) === normalizedQuestion) {
        state.openQuestions.splice(index, 1);
      }
    }
  }
  const unresolvedDetailTopics = [
    ...new Set(
      grounded.unresolvedRisks
        .filter((risk) =>
          /timeout|cancellation|payment/i.test(
            `${risk.topic} ${risk.title} ${risk.reason}`,
          ),
        )
        .map((risk) => risk.topic),
    ),
  ];
  state.generationMetadata = {
    ...state.generationMetadata,
    conversationClarificationAdvisory: {
      maxQuestionsPerTurn: 1,
      requestedThisTurn:
        grounded.suggestedNextAction.type === "ASK_CONTEXTUAL_QUESTION" ? 1 : 0,
      voluntaryContinuationAllowed: true,
      unresolvedDetailTopics,
    },
    lastConversationAction: response.suggestedNextAction.type,
  };
  return {
    state: ProjectStateSchema.parse(state),
    response,
    readiness,
  };
}
