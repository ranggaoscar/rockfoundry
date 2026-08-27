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
  resolvedAssumptions: z
    .array(ConversationResolvedAssumptionSchema)
    .default([]),
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
export type ConversationProposal = z.infer<typeof ConversationProposalSchema>;

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
  suggestedNextAction: ConversationSuggestedActionSchema.default({
    type: "NONE",
  }),
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

/** Normalize user/evidence text before deterministic grounding checks. */
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

function isAllowedCanonicalPath(path: string) {
  return (
    ARRAY_FACT_PATHS.has(path) ||
    path === "normalizedSummary" ||
    path === "productType"
  );
}

/** Evidence must be a source span after harmless Unicode/whitespace punctuation normalization. */
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

function canonicalValueFromEvidence(
  path: string,
  value: string,
  evidence: string,
  latestUserMessage: string,
) {
  if (!isAllowedCanonicalPath(path)) return null;
  if (!isGroundedConversationEvidence(evidence, latestUserMessage)) return null;
  const normalizedValue = normalizeConversationText(value);
  const normalizedEvidence = normalizeConversationText(evidence);
  if (normalizedValue.length < 3 || !/[\p{L}\p{N}]/u.test(normalizedValue))
    return null;
  return normalizedEvidence.includes(normalizedValue) ? value : null;
}

function groundedNeutralFacts(
  response: ConversationAgentResponse,
  latestUserMessage: string,
) {
  const candidates = [
    ...response.stateDelta.explicitFacts.map((item) => ({
      path: item.path,
      proposedValue: item.value,
      evidence: item.evidence,
    })),
    ...response.stateDelta.corrections.map((item) => ({
      path: item.path,
      proposedValue: item.value,
      evidence: item.evidence,
    })),
    ...response.stateDelta.confirmedDecisions.map((item) => ({
      path: `decision.${item.topic}`,
      proposedValue: item.decision,
      evidence: item.evidence,
    })),
  ];
  return candidates.flatMap((item) => {
    const normalizedProposed = normalizeConversationText(item.proposedValue);
    const normalizedEvidence = normalizeConversationText(item.evidence);
    const directlySupported = item.path.startsWith("decision.")
      ? normalizedEvidence.includes(normalizedProposed)
      : canonicalValueFromEvidence(
          item.path,
          item.proposedValue,
          item.evidence,
          latestUserMessage,
        );
    if (directlySupported) return [];
    if (
      (!item.path.startsWith("decision.") &&
        !isAllowedCanonicalPath(item.path)) ||
      !isGroundedConversationEvidence(item.evidence, latestUserMessage)
    ) {
      return [];
    }
    return [{ ...item, source: "USER", confidence: "EXPLICIT" }];
  });
}

function groundedExplicitFact(
  item: ConversationExplicitFact,
  latestUserMessage: string,
) {
  const value = canonicalValueFromEvidence(
    item.path,
    item.value,
    item.evidence,
    latestUserMessage,
  );
  return value ? { ...item, value } : null;
}

function groundedCorrection(
  item: ConversationCorrection,
  latestUserMessage: string,
) {
  const value = canonicalValueFromEvidence(
    item.path,
    item.value,
    item.evidence,
    latestUserMessage,
  );
  const replaces = item.replaces && normalizeConversationText(item.replaces);
  const latest = normalizeConversationText(latestUserMessage);
  if (!value || !replaces || !latest.includes(replaces)) return null;
  return { ...item, value };
}

function groundedConfirmedDecision(
  item: ConversationConfirmedDecision,
  latestUserMessage: string,
) {
  if (!isGroundedConversationEvidence(item.evidence, latestUserMessage))
    return null;
  const normalizedTopic = normalizeConversationText(
    item.topic.replace(/[_-]+/g, " "),
  );
  const normalizedLatest = normalizeConversationText(latestUserMessage);
  const topicInMessage =
    normalizedTopic.length >= 3 && normalizedLatest.includes(normalizedTopic);
  const traceableAffect = item.affects.some((path) =>
    isAllowedCanonicalPath(path),
  );
  if (!topicInMessage && !traceableAffect) return null;
  const normalizedDecision = normalizeConversationText(item.decision);
  const normalizedEvidence = normalizeConversationText(item.evidence);
  if (
    normalizedDecision.length < 3 ||
    !/[\p{L}\p{N}]/u.test(normalizedDecision) ||
    !normalizedEvidence.includes(normalizedDecision)
  )
    return null;
  return item;
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
      explicitFacts: response.stateDelta.explicitFacts.flatMap((item) => {
        const grounded = groundedExplicitFact(item, latestUserMessage);
        return grounded ? [grounded] : [];
      }),
      confirmedDecisions: response.stateDelta.confirmedDecisions.flatMap(
        (item) => {
          const grounded = groundedConfirmedDecision(item, latestUserMessage);
          return grounded ? [grounded] : [];
        },
      ),
      corrections: response.stateDelta.corrections.flatMap((item) => {
        const grounded = groundedCorrection(item, latestUserMessage);
        return grounded ? [grounded] : [];
      }),
      resolvedQuestions: response.stateDelta.resolvedQuestions.filter((item) =>
        isGroundedConversationEvidence(item.evidence, latestUserMessage),
      ),
      resolvedAssumptions: response.stateDelta.resolvedAssumptions.filter(
        (item) =>
          isGroundedConversationEvidence(item.evidence, latestUserMessage),
      ),
    },
  };
}

export function enforceConversationQuestionPolicy(
  rawResponse: ConversationAgentResponse,
  state: ProjectState,
  options: { draftSpecReady?: boolean; conversationTurnCount?: number } = {},
): ConversationAgentResponse {
  const response = ConversationAgentResponseSchema.parse(rawResponse);
  const action = response.suggestedNextAction;
  if (action.type !== "ASK_CONTEXTUAL_QUESTION") return response;
  const conversationTurnCount =
    options.conversationTurnCount ??
    (typeof state.generationMetadata.conversationTurnCount === "number"
      ? state.generationMetadata.conversationTurnCount
      : 0);
  if (
    (options.draftSpecReady ?? state.draftSpecReady) ||
    conversationTurnCount >= 3
  ) {
    const visibleMessage = /[?？]\s*$/.test(response.message)
      ? /\b(ini|siapa|apakah|boleh|yang|untuk|mau|bisa)\b/i.test(
          response.message,
        )
        ? "Kita sudah tahu cukup banyak untuk membuat Product Draft pertama. Detail yang belum terjawab tetap terlihat di Open Questions."
        : "We know enough to create a first Product Draft. Details that remain unanswered stay visible in Open Questions."
      : response.message;
    return {
      ...response,
      message: visibleMessage,
      suggestedNextAction: { type: "CREATE_SPEC" },
    };
  }
  const normalizedQuestion = normalizeConversationText(action.question);
  const previousResolutions = state.generationMetadata.conversationResolutions;
  const resolvedQuestions = Array.isArray(previousResolutions)
    ? previousResolutions.flatMap((entry) => {
        if (!entry || typeof entry !== "object" || !("question" in entry))
          return [];
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

function applyExplicitFact(
  state: ProjectState,
  fact: ConversationExplicitFact,
) {
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

function applyCorrection(
  state: ProjectState,
  correction: ConversationCorrection,
) {
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

  const history = Array.isArray(
    state.generationMetadata.conversationCorrections,
  )
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

/**
 * Capture narrowly-scoped user-authored authorization and lifecycle rules even
 * when a provider acknowledges them without emitting a structured delta.
 * Only the user's exact sentence is stored; provider paraphrases stay untrusted.
 */
function productRuleSentences(message: string) {
  return message
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function explicitProductRulesFromUserMessage(message: string) {
  return productRuleSentences(message).filter((sentence) => {
      const normalized = normalizeConversationText(sentence);
      const action =
        "(?:confirm|edit|update|delete|cancel|approve|reject|view|create|change|manage|pay|konfirmasi|mengonfirmasi|ubah|mengubah|edit|mengedit|hapus|menghapus|batalkan|membatalkan|setujui|menyetujui|tolak|menolak|lihat|melihat|buat|membuat|kelola|mengelola|bayar|membayar)";
      const subject = "(?:the\\s+)?[\\p{L}\\p{N}/ _-]{2,80}";
      return (
        new RegExp(
          `^(?:only|hanya)\\s+${subject}\\s+(?:can|may|are allowed to|boleh|dapat|bisa)\\s+${action}\\b`,
          "u",
        ).test(normalized) ||
        new RegExp(
          `^${subject}\\s+(?:cannot|cant|must not(?:\\s+be\\s+able\\s+to)?|may not|are not allowed to|are not permitted to|tidak boleh|tidak dapat|tidak bisa|tidak diizinkan(?:\\s+untuk)?|tidak diperbolehkan(?:\\s+untuk)?|dilarang(?:\\s+untuk)?)\\s+${action}\\b`,
          "u",
        ).test(normalized)
      );
    });
}

export function isExplicitProductRuleRefinement(message: string) {
  const sentences = productRuleSentences(message);
  const rules = explicitProductRulesFromUserMessage(message);
  return (
    rules.length > 0 &&
    rules.length === sentences.length &&
    rules.every((rule, index) => rule === sentences[index])
  );
}

export function applyExplicitUserProductRules(
  state: ProjectState,
  message: string,
) {
  for (const rule of explicitProductRulesFromUserMessage(message)) {
    if (
      !state.businessRules.some(
        (existing) =>
          normalizeConversationText(existing) === normalizeConversationText(rule),
      )
    ) {
      state.businessRules.push(rule);
    }
    addProvenance(
      state,
      `businessRules.${rule}`,
      rule,
      "USER",
      "EXPLICIT",
    );
  }
}

function applyAssumption(
  state: ProjectState,
  assumption: ConversationAssumption,
) {
  if (
    state.assumptions.some((item) => item.statement === assumption.statement)
  ) {
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
  const history = Array.isArray(
    state.generationMetadata.conversationResolutions,
  )
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
  const previousTurnCount =
    typeof state.generationMetadata.conversationTurnCount === "number"
      ? state.generationMetadata.conversationTurnCount
      : 0;
  const conversationTurnCount = previousTurnCount + 1;
  state.generationMetadata = {
    ...state.generationMetadata,
    conversationTurnCount,
    productDraftAvailable:
      Boolean(state.rawIdea.trim() || state.normalizedSummary?.trim()) &&
      conversationTurnCount >= 3,
  };
  const raw = ConversationAgentResponseSchema.parse(rawResponse);
  const response = enforceConversationQuestionPolicy(
    groundConversationResponse(raw, latestUserMessage),
    state,
    { conversationTurnCount },
  );
  const groundedUserFacts = Array.isArray(
    state.generationMetadata.groundedUserFacts,
  )
    ? state.generationMetadata.groundedUserFacts
    : [];
  groundedUserFacts.push(...groundedNeutralFacts(raw, latestUserMessage));
  state.generationMetadata = { ...state.generationMetadata, groundedUserFacts };
  const existingAssumptionIds = new Set(
    state.assumptions.map((assumption) => assumption.id),
  );

  for (const fact of response.stateDelta.explicitFacts) {
    applyExplicitFact(state, fact);
  }
  for (const correction of response.stateDelta.corrections) {
    if (!correction.replaces) continue;
    const values = arrayField(state, correction.path);
    if (!values || !values.includes(correction.replaces)) continue;
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
  applyExplicitUserProductRules(state, latestUserMessage);

  for (const resolved of response.stateDelta.resolvedQuestions) {
    const index = state.openQuestions.findIndex(
      (question) =>
        normalizeConversationText(question) ===
        normalizeConversationText(resolved.question),
    );
    if (
      index < 0 ||
      !isGroundedConversationEvidence(resolved.evidence, latestUserMessage)
    )
      continue;
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
    if (
      !assumption ||
      !isGroundedConversationEvidence(resolved.evidence, latestUserMessage)
    )
      continue;
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

  const proposals = Array.isArray(
    state.generationMetadata.conversationProposals,
  )
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
    rawResponse,
    latestUserMessage,
  );
  const readiness = evaluateReadinessDirectly(state);
  const response = enforceConversationQuestionPolicy(grounded, currentState, {
    draftSpecReady: readiness.draftSpecReady,
    conversationTurnCount:
      typeof state.generationMetadata.conversationTurnCount === "number"
        ? state.generationMetadata.conversationTurnCount
        : 0,
  });
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
        (question) =>
          normalizeConversationText(question) === normalizedQuestion,
      ).length > previousCount;
      index -= 1
    ) {
      if (
        normalizeConversationText(state.openQuestions[index]) ===
        normalizedQuestion
      ) {
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
