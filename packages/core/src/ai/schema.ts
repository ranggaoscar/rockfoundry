import { z } from "zod";

export const ConfidenceSchema = z.enum([
  "EXPLICIT",
  "STRONGLY_INFERRED",
  "WEAKLY_INFERRED",
  "UNKNOWN"
]);

export const ExtractedItemSchema = z.object({
  value: z.any(),
  confidence: ConfidenceSchema,
  evidenceText: z.string().optional(),
  extractionReason: z.string()
});
export type ExtractedItem = z.infer<typeof ExtractedItemSchema>;

export const InitialIdeaExtractionSchema = z.object({
  normalizedSummary: ExtractedItemSchema.optional(),
  productType: ExtractedItemSchema.optional(),
  projectAudience: ExtractedItemSchema.optional(),
  primaryUsers: z.array(ExtractedItemSchema).default([]),
  userProblems: z.array(ExtractedItemSchema).default([]),
  objectives: z.array(ExtractedItemSchema).default([]),
  proposedCapabilities: z.array(ExtractedItemSchema).default([]),
  coreEntities: z.array(ExtractedItemSchema).default([]),
  expectedWorkflows: z.array(ExtractedItemSchema).default([]),
  integrationsMentioned: z.array(ExtractedItemSchema).default([]),
  platforms: z.array(ExtractedItemSchema).default([]),
  businessModel: ExtractedItemSchema.optional(),
  privacySignals: z.array(ExtractedItemSchema).default([]),
  scaleSignals: z.array(ExtractedItemSchema).default([]),
  designSignals: z.array(ExtractedItemSchema).default([]),
  constraints: z.array(ExtractedItemSchema).default([]),
  assumptions: z.array(ExtractedItemSchema).default([]),
  ambiguities: z.array(ExtractedItemSchema).default([]),
  possibleContradictions: z.array(ExtractedItemSchema).default([]),
  unsupportedClaims: z.array(ExtractedItemSchema).default([])
});
export type InitialIdeaExtraction = z.infer<typeof InitialIdeaExtractionSchema>;
