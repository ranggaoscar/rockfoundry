import { z } from "zod";
import type { ProjectState } from "../schema/project";
import { ProjectStateSchema } from "../schema/project";

export const ArtifactComposerLabelSchema = z.enum([
  "CONFIRMED",
  "ASSUMPTION",
  "PROPOSAL",
  "OPEN_QUESTION",
]);
export type ArtifactComposerLabel = z.infer<typeof ArtifactComposerLabelSchema>;

export const ArtifactComposerConversationEntrySchema = z.object({
  role: z.enum(["user", "assistant", "tool", "system"]),
  text: z.string().min(1),
  id: z.string().optional(),
});
export type ArtifactComposerConversationEntry = z.infer<
  typeof ArtifactComposerConversationEntrySchema
>;

export const ArtifactComposerFactSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  value: z.string().min(1),
  source: z.enum([
    "USER",
    "AGENT_INFERENCE",
    "REFERENCE_WEBSITE",
    "REFERENCE_GITHUB",
    "RESEARCH",
    "TOOL",
    "SYSTEM",
  ]),
  confidence: z.enum([
    "EXPLICIT",
    "STRONGLY_INFERRED",
    "WEAKLY_INFERRED",
    "UNKNOWN",
  ]),
  evidence: z.string().optional(),
});
export type ArtifactComposerFact = z.infer<typeof ArtifactComposerFactSchema>;

export const ArtifactComposerPreviousArtifactSchema = z.object({
  type: z.enum([
    "BRD",
    "PRD",
    "ERD",
    "USER_FLOWS",
    "SCREEN_MAP",
    "DESIGN_BRIEF",
  ]),
  version: z.number().int().nonnegative(),
  content: z.string(),
});
export type ArtifactComposerPreviousArtifact = z.infer<
  typeof ArtifactComposerPreviousArtifactSchema
>;

export const ArtifactComposerInputSchema = z.object({
  rawIdea: z.string(),
  conversation: z.object({
    recent: z.array(ArtifactComposerConversationEntrySchema).default([]),
    fullUseful: z.array(ArtifactComposerConversationEntrySchema).default([]),
  }),
  canonicalTruth: z.object({
    facts: z.array(ArtifactComposerFactSchema).default([]),
    provenance: z.record(z.string(), z.unknown()).default({}),
  }),
  groundedUserFacts: z.array(ArtifactComposerFactSchema).default([]),
  unresolved: z.object({
    assumptions: z.array(z.string()).default([]),
    proposals: z.array(z.string()).default([]),
    openQuestions: z.array(z.string()).default([]),
    contradictions: z.array(z.string()).default([]),
  }),
  previousDraft: z.object({
    version: z.number().int().nonnegative().nullable(),
    artifacts: z.array(ArtifactComposerPreviousArtifactSchema).default([]),
  }),
});
export type ArtifactComposerInput = z.infer<typeof ArtifactComposerInputSchema>;

export const ArtifactComposerItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  label: ArtifactComposerLabelSchema,
  evidenceIds: z.array(z.string()).default([]),
  rationale: z.string().optional(),
});
export type ArtifactComposerItem = z.infer<typeof ArtifactComposerItemSchema>;

export const ArtifactComposerSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  paragraphs: z.array(z.string().min(1)).default([]),
  items: z.array(ArtifactComposerItemSchema).default([]),
});
export type ArtifactComposerSection = z.infer<typeof ArtifactComposerSectionSchema>;

export const ArtifactComposerDocumentSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  sections: z.array(ArtifactComposerSectionSchema).min(1),
});
export type ArtifactComposerDocument = z.infer<typeof ArtifactComposerDocumentSchema>;

export const ArtifactComposerOutputSchema = z.object({
  BRD: ArtifactComposerDocumentSchema,
  PRD: ArtifactComposerDocumentSchema,
  ERD: ArtifactComposerDocumentSchema,
  USER_FLOWS: ArtifactComposerDocumentSchema,
  SCREEN_MAP: ArtifactComposerDocumentSchema,
  DESIGN_BRIEF: ArtifactComposerDocumentSchema,
});
export type ArtifactComposerOutput = z.infer<typeof ArtifactComposerOutputSchema>;

const CANONICAL_ARRAY_FIELDS = [
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
] as const;

function provenanceId(path: string) {
  return `provenance:${path}`;
}

function explicitUserProvenance(state: ProjectState, path: string) {
  const value = state.provenance[path];
  return value?.source === "USER" && value.confidence === "EXPLICIT";
}

function canonicalFacts(state: ProjectState): ArtifactComposerFact[] {
  const facts: ArtifactComposerFact[] = [];
  for (const field of CANONICAL_ARRAY_FIELDS) {
    for (const value of state[field]) {
      const path = `${field}.${value}`;
      if (!explicitUserProvenance(state, path)) continue;
      const provenance = state.provenance[path];
      facts.push({
        id: provenanceId(path),
        path: field,
        value,
        source: provenance.source,
        confidence: provenance.confidence,
        evidence: provenance.evidence,
      });
    }
  }
  for (const field of ["rawIdea", "normalizedSummary", "productType"] as const) {
    const value = state[field];
    if (!value || !explicitUserProvenance(state, field)) continue;
    const provenance = state.provenance[field];
    facts.push({
      id: provenanceId(field),
      path: field,
      value,
      source: provenance.source,
      confidence: provenance.confidence,
      evidence: provenance.evidence,
    });
  }
  for (const decision of state.decisions) {
    const path = `decision.${decision.topic}`;
    if (
      decision.status !== "ACCEPTED" ||
      !explicitUserProvenance(state, path) ||
      decision.source !== "USER" ||
      decision.confidence !== "EXPLICIT"
    )
      continue;
    const provenance = state.provenance[path];
    facts.push({
      id: provenanceId(path),
      path,
      value: `${decision.topic}: ${decision.decision}`,
      source: provenance.source,
      confidence: provenance.confidence,
      evidence: provenance.evidence,
    });
  }
  return facts;
}

function unresolvedValues(state: ProjectState) {
  return {
    assumptions: state.assumptions
      .filter((item) => !item.resolved)
      .map((item) => item.statement),
    proposals: Array.isArray(state.generationMetadata.conversationProposals)
      ? state.generationMetadata.conversationProposals.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const proposal = item as Record<string, unknown>;
          return typeof proposal.statement === "string"
            ? [proposal.statement]
            : [];
        })
      : [],
    openQuestions: state.openQuestions,
    contradictions: state.contradictions
      .filter((item) => item.status === "OPEN")
      .map((item) => item.explanation),
  };
}

/** Build provider input without treating raw or inferred state as confirmed truth. */
export function buildArtifactComposerInput(
  state: ProjectState,
  conversation: {
    recent?: ArtifactComposerConversationEntry[];
    fullUseful?: ArtifactComposerConversationEntry[];
  } = {},
  previousDraft: {
    version?: number | null;
    artifacts?: ArtifactComposerPreviousArtifact[];
  } = {},
): ArtifactComposerInput {
  const parsed = ProjectStateSchema.parse(state);
  const facts = canonicalFacts(parsed);
  const previousArtifacts = previousDraft.artifacts || [];
  return ArtifactComposerInputSchema.parse({
    rawIdea: parsed.rawIdea,
    conversation: {
      recent: conversation.recent || [],
      fullUseful: conversation.fullUseful || [],
    },
    canonicalTruth: {
      facts,
      provenance: Object.fromEntries(
        facts.map((fact) => [fact.id, {
          path: fact.path,
          source: fact.source,
          confidence: fact.confidence,
          evidence: fact.evidence,
        }]),
      ),
    },
    groundedUserFacts: facts.filter(
      (fact) => fact.source === "USER" && fact.confidence === "EXPLICIT",
    ),
    unresolved: unresolvedValues(parsed),
    previousDraft: {
      version: previousDraft.version ?? null,
      artifacts: previousArtifacts,
    },
  });
}

/** Keep model output structured while preventing unsupported claims from becoming facts. */
export function normalizeArtifactComposerOutput(
  output: unknown,
  input: ArtifactComposerInput,
): ArtifactComposerOutput {
  const parsed = ArtifactComposerOutputSchema.parse(output);
  const normalizeItem = (item: ArtifactComposerItem): ArtifactComposerItem => {
    if (item.label !== "CONFIRMED") return item;
    const supportedFacts = item.evidenceIds
      .map((id) => input.canonicalTruth.facts.find((fact) => fact.id === id))
      .filter((fact): fact is ArtifactComposerFact => Boolean(fact));
    const grounded = supportedFacts.some(
      (fact) =>
        fact.source === "USER" &&
        fact.confidence === "EXPLICIT" &&
        item.text.toLocaleLowerCase().includes(fact.value.toLocaleLowerCase()),
    );
    if (grounded) {
      return {
        ...item,
        evidenceIds: supportedFacts.map((fact) => fact.id),
      };
    }
    const reason =
      "Downgraded to PROPOSAL: the claim text is not supported by explicit user canonical evidence.";
    return {
      ...item,
      label: "PROPOSAL",
      evidenceIds: supportedFacts.map((fact) => fact.id),
      rationale: item.rationale ? `${item.rationale} ${reason}` : reason,
    };
  };
  return ArtifactComposerOutputSchema.parse({
    ...parsed,
    ...Object.fromEntries(
      Object.entries(parsed).map(([type, document]) => [
        type,
        {
          ...document,
          sections: document.sections.map((section) => ({
            ...section,
            items: section.items.map(normalizeItem),
          })),
        },
      ]),
    ),
  });
}
