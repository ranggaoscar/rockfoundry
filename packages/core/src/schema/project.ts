import { z } from "zod";

export const ConfidenceSchema = z.enum([
  "EXPLICIT",
  "STRONGLY_INFERRED",
  "WEAKLY_INFERRED",
  "UNKNOWN",
]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const ProvenanceSourceSchema = z.enum([
  "USER",
  "AGENT_INFERENCE",
  "REFERENCE_WEBSITE",
  "REFERENCE_GITHUB",
  "TOOL",
  "SYSTEM",
]);
export type ProvenanceSource = z.infer<typeof ProvenanceSourceSchema>;

export const ReferenceSchema = z.object({
  id: z.string(),
  type: z.enum(["URL", "GITHUB_REPO"]),
  url: z.string().url(),
  status: z.enum(["PENDING", "ANALYZED", "FAILED"]),
  metadata: z.record(z.string(), z.unknown()).optional(),
  source: ProvenanceSourceSchema.default("TOOL"),
  untrusted: z.boolean().default(true),
});
export type Reference = z.infer<typeof ReferenceSchema>;

export const DecisionSchema = z.object({
  id: z.string(),
  topic: z.string(),
  decision: z.string(),
  reason: z.string().optional(),
  source: ProvenanceSourceSchema.default("USER"),
  confidence: ConfidenceSchema.default("EXPLICIT"),
  status: z
    .enum(["PROPOSED", "ACCEPTED", "REJECTED", "SUPERSEDED"])
    .default("ACCEPTED"),
  affects: z.array(z.string()).default([]),
  supersedes: z.string().optional(),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const AssumptionSchema = z.object({
  id: z.string(),
  statement: z.string(),
  confidence: ConfidenceSchema,
  impact: z.enum(["LOW", "MEDIUM", "HIGH"]),
  source: ProvenanceSourceSchema.default("AGENT_INFERENCE"),
  validationStrategy: z.string().optional(),
  resolved: z.boolean().default(false),
});
export type Assumption = z.infer<typeof AssumptionSchema>;

export const ContradictionSchema = z.object({
  id: z.string(),
  severity: z.enum(["BLOCKING", "WARNING", "INFO"]),
  conflictingFields: z.array(z.string()),
  explanation: z.string(),
  recommendedResolution: z.string(),
  status: z.enum(["OPEN", "RESOLVED"]).default("OPEN"),
});
export type Contradiction = z.infer<typeof ContradictionSchema>;

export const DecisionGraphNodeSchema = z.object({
  id: z.string(),
  topic: z.string(),
  decisionId: z.string(),
  status: z.enum(["ACTIVE", "SUPERSEDED"]),
});
export type DecisionGraphNode = z.infer<typeof DecisionGraphNodeSchema>;

export const DecisionGraphEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  relation: z.enum(["AFFECTS", "DEPENDS_ON", "CONTRADICTS", "DERIVED_FROM"]),
  rationale: z.string().optional(),
});
export type DecisionGraphEdge = z.infer<typeof DecisionGraphEdgeSchema>;

export const DecisionGraphSchema = z.object({
  nodes: z.array(DecisionGraphNodeSchema).default([]),
  edges: z.array(DecisionGraphEdgeSchema).default([]),
});
export type DecisionGraph = z.infer<typeof DecisionGraphSchema>;

export const DiscoveryStateSchema = z.object({
  evaluated: z.boolean().default(false),
  importantDecisionsRemaining: z.number().int().min(0).nullable().default(null),
  unresolvedTopics: z.array(z.string()).default([]),
  activeQuestionId: z.string().optional(),
});
export type DiscoveryState = z.infer<typeof DiscoveryStateSchema>;

export const ReadinessLevelSchema = z.enum([
  "NOT_READY",
  "DRAFT_READY",
  "BUILD_READY",
]);
export type ReadinessLevel = z.infer<typeof ReadinessLevelSchema>;

export const ProjectStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  rawIdea: z.string(),
  normalizedSummary: z.string().optional(),
  productType: z.string().optional(),
  targetUsers: z.array(z.string()).default([]),
  platforms: z.array(z.string()).default([]),
  objectives: z.array(z.string()).default([]),
  problems: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  entities: z.array(z.string()).default([]),
  features: z.array(z.string()).default([]),
  workflows: z.array(z.string()).default([]),
  roles: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
  integrations: z.array(z.string()).default([]),
  design: z.array(z.string()).default([]),
  businessRules: z.array(z.string()).default([]),
  references: z.array(ReferenceSchema).default([]),
  assumptions: z.array(AssumptionSchema).default([]),
  decisions: z.array(DecisionSchema).default([]),
  openQuestions: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  contradictions: z.array(ContradictionSchema).default([]),
  requirements: z.array(z.string()).default([]),
  provenance: z
    .record(
      z.string(),
      z.object({
        source: ProvenanceSourceSchema,
        confidence: ConfidenceSchema,
        evidence: z.string().optional(),
      }),
    )
    .default({}),
  decisionGraph: DecisionGraphSchema.default({ nodes: [], edges: [] }),
  discovery: DiscoveryStateSchema.default({
    evaluated: false,
    importantDecisionsRemaining: null,
    unresolvedTopics: [],
  }),
  readiness: ReadinessLevelSchema.default("NOT_READY"),
  readinessScore: z.number().min(0).max(100).default(0),
  readinessBreakdown: z
    .object({
      business: z.number().min(0).max(100),
      product: z.number().min(0).max(100),
      data: z.number().min(0).max(100),
    })
    .default({ business: 0, product: 0, data: 0 }),
  generationMetadata: z.record(z.string(), z.unknown()).default({}),
});
export type ProjectState = z.infer<typeof ProjectStateSchema>;

function countLabel(rawIdea: string, pattern: RegExp) {
  const match = rawIdea.match(pattern);
  return match?.[1] ? `${match[1]}-` : "Multi-";
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (/^(crm|erp|pos|api|whatsapp|instagram)$/i.test(word))
        return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/** Create a stable, semantic title from explicit domain cues in the idea. */
export function deriveProjectTitle(rawIdea: string) {
  const idea = rawIdea.trim();
  const lower = idea.toLowerCase();
  if (!idea) return "New project";

  if (/crm|customer relationship|sales pipeline|lead management/.test(lower)) {
    const brandCount = countLabel(
      idea,
      /\b(\d+)\s+(?:brand|brands|merek|merk)\b/i,
    );
    const material = /marble|marmer|stone|slab|granite/.test(lower)
      ? "Marble"
      : "Sales";
    return `${brandCount}Brand ${material} CRM`;
  }

  if (/rental|car rental|vehicle rental|sewa mobil|booking mobil/.test(lower)) {
    const branchCount = countLabel(
      idea,
      /\b(\d+)\s+(?:branch|branches|cabang)\b/i,
    );
    return `${branchCount}Branch Car Rental`;
  }

  if (/inventory|warehouse|gudang|slab|stock|stok/.test(lower)) {
    const warehouseCount = countLabel(
      idea,
      /\b(\d+)\s+(?:warehouse|warehouses|gudang)\b/i,
    );
    const material = /marble|marmer|slab|granite|stone/.test(lower)
      ? "Slab"
      : "Inventory";
    return warehouseCount === "Multi-"
      ? `${material} Inventory`
      : `${warehouseCount}Warehouse ${material} Inventory`;
  }

  const sentence = idea.split(/[.!?\n]/, 1)[0] || idea;
  const cleaned = sentence
    .replace(
      /^(?:i want to|i'd like to|i would like to|build|create|make|buat|bikin|gua mau bikin|gue mau bikin)\s+/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter(Boolean).slice(0, 6);
  const fallback = words.join(" ").replace(/[,:;]+$/, "");
  return fallback ? titleCase(fallback) : "New project";
}

export function createInitialProjectState(input: {
  id: string;
  name: string;
  rawIdea?: string;
}): ProjectState {
  return ProjectStateSchema.parse({
    id: input.id,
    name: input.name,
    rawIdea: input.rawIdea || "",
  });
}
