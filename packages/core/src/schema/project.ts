import { z } from "zod";

export const ReferenceSchema = z.object({
  id: z.string(),
  type: z.enum(["URL", "GITHUB_REPO"]),
  url: z.string().url(),
  status: z.enum(["PENDING", "ANALYZED", "FAILED"]),
  metadata: z.record(z.string(), z.any()).optional(),
});
export type Reference = z.infer<typeof ReferenceSchema>;

export const DecisionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  rationale: z.string(),
  status: z.enum(["PROPOSED", "ACCEPTED", "REJECTED"]),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const AssumptionSchema = z.object({
  id: z.string(),
  statement: z.string(),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  impact: z.enum(["LOW", "MEDIUM", "HIGH"]),
  validationStrategy: z.string().optional(),
});
export type Assumption = z.infer<typeof AssumptionSchema>;

export const ContradictionSchema = z.object({
  id: z.string(),
  severity: z.enum(["BLOCKING", "WARNING", "INFO"]),
  conflictingFields: z.array(z.string()),
  explanation: z.string(),
  recommendedResolution: z.string(),
});
export type Contradiction = z.infer<typeof ContradictionSchema>;

export const ReadinessLevelSchema = z.enum([
  "IDEA_READY",
  "PROTOTYPE_READY",
  "MVP_READY",
  "PRODUCTION_READY",
]);
export type ReadinessLevel = z.infer<typeof ReadinessLevelSchema>;

export const ProjectStateSchema = z.object({
  // Identity
  id: z.string(),
  name: z.string(),
  
  // Base
  rawIdea: z.string(),
  normalizedSummary: z.string().optional(),
  productType: z.string().optional(),
  targetUsers: z.array(z.string()).default([]),
  
  // Scope
  objectives: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  entities: z.array(z.string()).default([]),
  features: z.array(z.string()).default([]),
  integrations: z.array(z.string()).default([]),
  
  // Analysis
  references: z.array(ReferenceSchema).default([]),
  assumptions: z.array(AssumptionSchema).default([]),
  decisions: z.array(DecisionSchema).default([]),
  openQuestions: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  
  // Evaluation
  readiness: ReadinessLevelSchema.default("IDEA_READY"),
  contradictions: z.array(ContradictionSchema).default([]),
  
  // Metadata
  generationMetadata: z.record(z.string(), z.any()).default({}),
});
export type ProjectState = z.infer<typeof ProjectStateSchema>;
