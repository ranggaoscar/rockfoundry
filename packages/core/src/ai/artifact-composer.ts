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
  requestedDocumentTypes: z
    .array(
      z.enum(["BRD", "PRD", "ERD", "USER_FLOWS", "SCREEN_MAP", "DESIGN_BRIEF"]),
    )
    .default(["BRD", "PRD", "ERD", "USER_FLOWS", "SCREEN_MAP", "DESIGN_BRIEF"]),
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
export type ArtifactComposerSection = z.infer<
  typeof ArtifactComposerSectionSchema
>;

export const ArtifactComposerDocumentSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  sections: z.array(ArtifactComposerSectionSchema).min(1),
});
export type ArtifactComposerDocument = z.infer<
  typeof ArtifactComposerDocumentSchema
>;

export const ArtifactComposerOutputSchema = z.object({
  BRD: ArtifactComposerDocumentSchema,
  PRD: ArtifactComposerDocumentSchema,
  ERD: ArtifactComposerDocumentSchema,
  USER_FLOWS: ArtifactComposerDocumentSchema,
  SCREEN_MAP: ArtifactComposerDocumentSchema,
  DESIGN_BRIEF: ArtifactComposerDocumentSchema,
});
export type ArtifactComposerOutput = z.infer<
  typeof ArtifactComposerOutputSchema
>;

export const ARTIFACT_COMPOSER_DOCUMENT_TYPES = [
  "BRD",
  "PRD",
  "ERD",
  "USER_FLOWS",
  "SCREEN_MAP",
  "DESIGN_BRIEF",
] as const;
export type ArtifactComposerDocumentType =
  (typeof ARTIFACT_COMPOSER_DOCUMENT_TYPES)[number];

const FALLBACK_MARKER = "needs review before it can be treated as complete.";

function isMeaningfulDocument(document: ArtifactComposerDocument) {
  const content = [
    document.title,
    document.summary,
    ...document.sections.flatMap((section) => [
      section.title,
      ...section.paragraphs,
      ...section.items.map((item) => item.text),
    ]),
  ]
    .join(" ")
    .trim();
  const itemCount = document.sections.reduce(
    (count, section) => count + section.items.length,
    0,
  );
  return (
    !content.toLowerCase().includes(FALLBACK_MARKER) &&
    content.length >= 80 &&
    itemCount >= 1
  );
}

/** Product truth may be tolerant; publication still requires substantive documents. */
export function assessArtifactComposerQuality(output: ArtifactComposerOutput) {
  const malformedTypes = ARTIFACT_COMPOSER_DOCUMENT_TYPES.filter(
    (type) => !isMeaningfulDocument(output[type]),
  );
  return {
    malformedTypes,
    meaningful: malformedTypes.length === 0,
    repairable: malformedTypes.length > 0 && malformedTypes.length <= 2,
  };
}

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
  for (const field of [
    "rawIdea",
    "normalizedSummary",
    "productType",
  ] as const) {
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
        facts.map((fact) => [
          fact.id,
          {
            path: fact.path,
            source: fact.source,
            confidence: fact.confidence,
            evidence: fact.evidence,
          },
        ]),
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

function documentFallback(
  type: string,
  details?: string,
): ArtifactComposerDocument {
  const title = type.replace(/_/g, " ");
  const text =
    details || `${title} needs review before it can be treated as complete.`;
  return {
    title,
    summary: text,
    sections: [
      {
        id: "review",
        title: "Review required",
        paragraphs: [],
        items: [
          {
            id: "review-required",
            text,
            label: "OPEN_QUESTION",
            evidenceIds: [],
            rationale:
              "The provider response was incomplete or malformed; no claims were confirmed.",
          },
        ],
      },
    ],
  };
}

function markdownDocument(
  value: string,
  fallbackTitle: string,
): ArtifactComposerDocument | null {
  const lines = value
    .replace(/```(?:markdown|md)?/gi, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line, index, all) => line || (index > 0 && all[index - 1]));
  if (!lines.some((line) => line)) return null;

  const titleLine = lines.find((line) => /^#\s+/.test(line));
  const title = titleLine?.replace(/^#\s+/, "").trim() || fallbackTitle;
  const contentLines = titleLine
    ? lines.slice(lines.indexOf(titleLine) + 1)
    : lines;
  const sections: ArtifactComposerSection[] = [];
  let current: ArtifactComposerSection = {
    id: "overview",
    title: "Overview",
    paragraphs: [],
    items: [],
  };
  const flush = () => {
    if (current.paragraphs.length || current.items.length || !sections.length) {
      sections.push(current);
    }
  };
  for (const line of contentLines) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      flush();
      current = {
        id:
          heading[1]
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "section",
        title: heading[1].trim(),
        paragraphs: [],
        items: [],
      };
      continue;
    }
    const bullet = line.match(/^[-*+]\s+(.+)$/);
    if (bullet) {
      const raw = bullet[1].trim();
      const labelMatch = raw.match(
        /^\*\*(ASSUMPTION|PROPOSAL|OPEN_QUESTION|CONFIRMED)\*\*\s*(.*)$/i,
      );
      const requestedLabel = labelMatch?.[1]?.toUpperCase();
      const label: ArtifactComposerLabel =
        requestedLabel === "ASSUMPTION" || requestedLabel === "OPEN_QUESTION"
          ? requestedLabel
          : "PROPOSAL";
      const text = (labelMatch?.[2] || raw).trim();
      if (text) {
        current.items.push({
          id: `item-${current.items.length + 1}`,
          text,
          label,
          evidenceIds: [],
        });
      }
      continue;
    }
    if (line && !/^#{1,6}\s+/.test(line)) current.paragraphs.push(line);
  }
  flush();
  const summary = sections[0]?.paragraphs[0] || `Draft ${title} for review.`;
  const bodyText = contentLines
    .filter((line) => line && !/^#{1,6}\s+/.test(line))
    .join(" ");
  if (
    bodyText &&
    sections.length &&
    !sections
      .flatMap((section) => section.paragraphs)
      .join(" ")
      .includes(bodyText)
  ) {
    sections[0].paragraphs.push(bodyText);
  }
  return {
    title,
    summary,
    sections: sections.length
      ? sections
      : [
          {
            id: "overview",
            title: "Overview",
            paragraphs: [summary],
            items: [],
          },
        ],
  };
}

function structuredDocument(
  value: Record<string, unknown>,
  type: string,
): ArtifactComposerDocument {
  const title =
    typeof value.title === "string" && value.title.trim()
      ? value.title.trim()
      : type.replace(/_/g, " ");
  const rawSections = Array.isArray(value.sections) ? value.sections : [];
  if (
    !title.trim() ||
    (!rawSections.length && typeof value.summary !== "string")
  ) {
    return documentFallback(type);
  }
  const sections = rawSections.flatMap((rawSection, sectionIndex) => {
    if (
      !rawSection ||
      typeof rawSection !== "object" ||
      Array.isArray(rawSection)
    )
      return [];
    const section = rawSection as Record<string, unknown>;
    const rawItems = Array.isArray(section.items) ? section.items : [];
    const items = rawItems.flatMap((rawItem, itemIndex) => {
      const parsed = ArtifactComposerItemSchema.safeParse(rawItem);
      if (parsed.success) return [parsed.data];
      if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem))
        return [];
      const item = rawItem as Record<string, unknown>;
      if (typeof item.text !== "string" || !item.text.trim()) return [];
      const label = ArtifactComposerLabelSchema.safeParse(item.label);
      return [
        {
          id:
            typeof item.id === "string" && item.id
              ? item.id
              : `item-${itemIndex + 1}`,
          text: item.text.trim(),
          label:
            label.success && label.data !== "CONFIRMED"
              ? label.data
              : "PROPOSAL",
          evidenceIds: Array.isArray(item.evidenceIds)
            ? item.evidenceIds.filter(
                (id): id is string => typeof id === "string",
              )
            : [],
          ...(typeof item.rationale === "string"
            ? { rationale: item.rationale }
            : {}),
        } satisfies ArtifactComposerItem,
      ];
    });
    const paragraphs = Array.isArray(section.paragraphs)
      ? section.paragraphs.filter(
          (paragraph): paragraph is string =>
            typeof paragraph === "string" && paragraph.trim().length > 0,
        )
      : [];
    return [
      {
        id:
          typeof section.id === "string" && section.id
            ? section.id
            : `section-${sectionIndex + 1}`,
        title:
          typeof section.title === "string" && section.title
            ? section.title
            : "Overview",
        paragraphs,
        items,
      } satisfies ArtifactComposerSection,
    ];
  });
  const summary =
    typeof value.summary === "string" && value.summary.trim()
      ? value.summary.trim()
      : sections[0]?.paragraphs[0] || `Draft ${title} for review.`;
  return {
    title,
    summary,
    sections: sections.length
      ? sections
      : [
          {
            id: "overview",
            title: "Overview",
            paragraphs: [summary],
            items: [],
          },
        ],
  };
}

function unwrapDocument(value: unknown, depth = 0): unknown {
  if (
    depth > 4 ||
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  )
    return value;
  const record = value as Record<string, unknown>;
  for (const key of [
    "document",
    "artifact",
    "data",
    "result",
    "value",
    "output",
  ]) {
    if (key in record) return unwrapDocument(record[key], depth + 1);
  }
  if (typeof record.content === "string") return record.content;
  return value;
}

function normalizeDocument(
  value: unknown,
  type: string,
): ArtifactComposerDocument {
  const unwrapped = unwrapDocument(value);
  if (typeof unwrapped === "string") {
    let parsed: unknown = unwrapped;
    try {
      parsed = JSON.parse(unwrapped);
    } catch {
      return (
        markdownDocument(unwrapped, type.replace(/_/g, " ")) ||
        documentFallback(type)
      );
    }
    return normalizeDocument(parsed, type);
  }
  if (unwrapped && typeof unwrapped === "object" && !Array.isArray(unwrapped)) {
    return structuredDocument(unwrapped as Record<string, unknown>, type);
  }
  return documentFallback(type);
}

/** Normalize provider-specific wrappers and content without coupling document validity. */
export function normalizeArtifactComposerOutputShape(
  output: unknown,
): ArtifactComposerOutput {
  let source: unknown = output;
  for (let depth = 0; depth < 4; depth++) {
    if (!source || typeof source !== "object" || Array.isArray(source)) break;
    const record = source as Record<string, unknown>;
    const nested = ["documents", "artifacts", "output", "data", "result"].find(
      (key) =>
        record[key] &&
        typeof record[key] === "object" &&
        !Array.isArray(record[key]),
    );
    if (!nested) break;
    source = record[nested];
  }
  const record =
    source && typeof source === "object" && !Array.isArray(source)
      ? (source as Record<string, unknown>)
      : {};
  const entries = Array.isArray(record.documents) ? record.documents : [];
  const fromArray = Object.fromEntries(
    entries.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      return typeof item.type === "string"
        ? [[item.type, item.document ?? item.content ?? item.data]]
        : [];
    }),
  );
  const docs = { ...fromArray, ...record } as Record<string, unknown>;
  const types = [
    "BRD",
    "PRD",
    "ERD",
    "USER_FLOWS",
    "SCREEN_MAP",
    "DESIGN_BRIEF",
  ] as const;
  return Object.fromEntries(
    types.map((type) => [type, normalizeDocument(docs[type], type)]),
  ) as ArtifactComposerOutput;
}

/** Keep model output structured while preventing unsupported claims from becoming facts. */
export function normalizeArtifactComposerOutput(
  output: unknown,
  input: ArtifactComposerInput,
): ArtifactComposerOutput {
  const parsed = normalizeArtifactComposerOutputShape(output);
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
      return { ...item, evidenceIds: supportedFacts.map((fact) => fact.id) };
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
  return ArtifactComposerOutputSchema.parse(
    Object.fromEntries(
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
  );
}
