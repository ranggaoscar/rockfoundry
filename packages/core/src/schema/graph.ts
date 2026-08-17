import { z } from "zod";

export const RequirementCategorySchema = z.enum([
  "PRODUCT",
  "USERS",
  "WORKFLOW",
  "DATA",
  "PERMISSIONS",
  "INTEGRATIONS",
  "DESIGN",
  "SCALE",
  "SECURITY",
  "DEPLOYMENT",
  "LAUNCH",
]);
export type RequirementCategory = z.infer<typeof RequirementCategorySchema>;

export const RequirementStatusSchema = z.enum([
  "UNRESOLVED",
  "ASSUMED",
  "INFERRED",
  "ANSWERED",
  "CONFLICTING",
]);
export type RequirementStatus = z.infer<typeof RequirementStatusSchema>;

export const RequirementNodeSchema = z.object({
  id: z.string(),
  category: RequirementCategorySchema,
  title: z.string(),
  description: z.string(),

  // Dependencies & Triggers
  appliesWhen: z.custom<(state: any) => boolean>().optional(), // Takes ProjectState -> boolean
  dependencies: z.array(z.string()).default([]), // IDs of other requirements

  // Weighting
  priority: z.number().min(1).max(10).default(5),
  riskWeight: z.number().min(1).max(10).default(5),

  // State
  status: RequirementStatusSchema.default("UNRESOLVED"),
  source: z.enum(["SYSTEM", "USER", "AI", "EXTERNAL"]).default("SYSTEM"),
  evidence: z.string().optional(),
  confidence: z.number().min(0).max(100).default(0), // 0-100
  resolution: z.string().optional(),
});
export type RequirementNode = z.infer<typeof RequirementNodeSchema>;

// Represents the resolved/calculated graph state
export const GraphStateSchema = z.object({
  applicableNodes: z.array(RequirementNodeSchema),
  completionByCategory: z.record(RequirementCategorySchema, z.number()), // 0-100 percentages
  overallReadinessScore: z.number(), // 0-100
  topUnresolved: z.array(RequirementNodeSchema), // Highest priority/risk unresolved
});
export type GraphState = z.infer<typeof GraphStateSchema>;
