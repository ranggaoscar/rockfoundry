import { z } from "zod";

export const QuestionOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
});
export type QuestionOption = z.infer<typeof QuestionOptionSchema>;

export const QuestionSchema = z.object({
  id: z.string(),
  topic: z.string().optional(),
  category: z.string().optional(),
  text: z.string(),
  contextReferences: z.array(z.string()), // Parts of project state referenced
  relatedRequirementIds: z.array(z.string()),
  affects: z.array(z.string()).default([]),

  answerType: z.enum([
    "SINGLE_CHOICE",
    "MULTIPLE_CHOICE",
    "FREE_TEXT",
    "BOOLEAN",
  ]),
  options: z.array(QuestionOptionSchema).optional(),

  recommendation: z.string().optional(),
  tradeoffs: z.string().optional(),

  priority: z.number().min(1).max(10),
  reasonAsked: z.string(), // Explain why this is being asked now
});
export type Question = z.infer<typeof QuestionSchema>;
