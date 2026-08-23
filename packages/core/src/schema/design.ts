import { z } from "zod";

export const DesignStatusSchema = z.enum([
  "NOT_STARTED",
  "DRAFT",
  "IN_REVIEW",
  "NEEDS_REVIEW",
  "APPROVED",
]);
export type DesignStatus = z.infer<typeof DesignStatusSchema>;

export const DesignReadinessLevelSchema = z.enum([
  "BLOCKED",
  "PARTIAL",
  "READY",
]);
export type DesignReadinessLevel = z.infer<typeof DesignReadinessLevelSchema>;

export const DesignScreenStatusSchema = z.enum([
  "INFERRED",
  "DRAFT",
  "APPROVED",
]);
export const DesignSourceSchema = z.enum(["USER", "SYSTEM", "INFERRED"]);

export const DesignScreenSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  actorIds: z.array(z.string()).default([]),
  purpose: z.string().min(1),
  route: z.string().regex(/^#\/[a-z0-9/-]*$/),
  status: DesignScreenStatusSchema.default("INFERRED"),
  source: DesignSourceSchema.default("INFERRED"),
});
export type DesignScreen = z.infer<typeof DesignScreenSchema>;

export const DesignReadinessSchema = z.object({
  level: DesignReadinessLevelSchema.default("BLOCKED"),
  score: z.number().min(0).max(100).default(0),
  blockers: z.array(z.string()).default([]),
  unresolved: z.array(z.string()).default([]),
});
export type DesignReadiness = z.infer<typeof DesignReadinessSchema>;

export const DesignDirectionSchema = z.object({
  mood: z.string().default("quiet-technical"),
  density: z.string().default("comfortable"),
  navigation: z.string().default("sidebar"),
  visualKeywords: z.array(z.string()).default([]),
  references: z.array(z.string()).default([]),
});
export type DesignDirection = z.infer<typeof DesignDirectionSchema>;

export const DesignRevisionSchema = z.object({
  version: z.number().int().min(1),
  summary: z.string(),
  createdAt: z.string(),
  source: z.enum(["USER", "SYSTEM"]).default("SYSTEM"),
  affectedScreens: z.array(z.string()).default([]),
});
export type DesignRevision = z.infer<typeof DesignRevisionSchema>;

export const DesignDebtSchema = z.object({
  unresolved: z.array(z.string()).default([]),
  count: z.number().int().min(0).default(0),
});
export type DesignDebt = z.infer<typeof DesignDebtSchema>;

export const DesignStateSchema = z.object({
  status: DesignStatusSchema.default("NOT_STARTED"),
  readiness: DesignReadinessSchema.default({
    level: "BLOCKED",
    score: 0,
    blockers: [],
    unresolved: [],
  }),
  direction: DesignDirectionSchema.default({
    mood: "quiet-technical",
    density: "comfortable",
    navigation: "sidebar",
    visualKeywords: [],
    references: [],
  }),
  screenMap: z.array(DesignScreenSchema).default([]),
  activeScreenId: z.string().nullable().default(null),
  currentVersion: z.number().int().min(0).default(0),
  approvedVersion: z.number().int().min(1).nullable().default(null),
  approvedAt: z.string().nullable().default(null),
  stale: z.boolean().default(false),
  staleScreens: z.array(z.string()).default([]),
  debt: DesignDebtSchema.default({ unresolved: [], count: 0 }),
  revisions: z.array(DesignRevisionSchema).default([]),
  assumptions: z.array(z.string()).default([]),
});
export type DesignState = z.infer<typeof DesignStateSchema>;

export const ALLOWED_PROTOTYPE_PATHS = [
  "index.html",
  "styles.css",
  "app.js",
] as const;

export const PrototypeFileSchema = z.object({
  path: z.enum(ALLOWED_PROTOTYPE_PATHS),
  content: z.string().max(180_000),
});
export type PrototypeFile = z.infer<typeof PrototypeFileSchema>;

export const DesignSpecSchema = z.object({
  productName: z.string(),
  direction: DesignDirectionSchema,
  informationArchitecture: z.array(z.string()).default([]),
  navigation: z.string(),
  visualHierarchy: z.string(),
  density: z.string(),
  typography: z.string(),
  spacing: z.string(),
  surfaces: z.string(),
  controls: z.string(),
  components: z.array(z.string()).default([]),
  screenContent: z
    .array(
      z.object({
        screenId: z.string(),
        hierarchy: z.array(z.string()),
      }),
    )
    .default([]),
  responsive: z.string(),
  interactions: z.array(z.string()).default([]),
  states: z.array(z.string()).default([]),
});
export type DesignSpec = z.infer<typeof DesignSpecSchema>;

export const DesignArchitectureOutputSchema = z.object({
  designSpec: DesignSpecSchema,
  summary: z.string(),
  assumptions: z.array(z.string()).default([]),
});
export type DesignArchitectureOutput = z.infer<
  typeof DesignArchitectureOutputSchema
>;

export const PrototypeGenerationOutputSchema = z.object({
  files: z.array(PrototypeFileSchema).min(3).max(3),
  summary: z.string(),
  assumptions: z.array(z.string()).default([]),
});
export type PrototypeGenerationOutput = z.infer<
  typeof PrototypeGenerationOutputSchema
>;

export const DesignGenerationResultSchema = z.object({
  designSpec: DesignSpecSchema,
  screenMap: z.array(DesignScreenSchema),
  files: z.array(PrototypeFileSchema).min(3).max(3),
  summary: z.string(),
  assumptions: z.array(z.string()).default([]),
});
export type DesignGenerationResult = z.infer<
  typeof DesignGenerationResultSchema
>;

export const DesignRevisionImpactSchema = z.enum([
  "VISUAL_ONLY",
  "DESIGN_STRUCTURE",
  "POTENTIAL_PRODUCT_DECISION",
]);
export type DesignRevisionImpact = z.infer<typeof DesignRevisionImpactSchema>;

export function emptyDesignState(): DesignState {
  return DesignStateSchema.parse({});
}
