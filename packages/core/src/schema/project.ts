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
