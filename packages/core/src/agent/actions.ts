import { z } from "zod";
import {
  ConfidenceSchema,
  ProjectStateSchema,
  ProvenanceSourceSchema,
} from "../schema";

const ActionBase = { id: z.string().min(1), rationale: z.string().optional() };
export const AskUserActionSchema = z.object({
  ...ActionBase,
  type: z.literal("ASK_USER"),
  questionId: z.string(),
  question: z.string(),
  relatedRequirementIds: z.array(z.string()).default([]),
  options: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        description: z.string().optional(),
      }),
    )
    .default([]),
});
export const CallToolActionSchema = z.object({
  ...ActionBase,
  type: z.literal("CALL_TOOL"),
  toolName: z.string(),
  input: z.record(z.string(), z.unknown()).default({}),
});
export const RecordDecisionActionSchema = z.object({
  ...ActionBase,
  type: z.literal("RECORD_DECISION"),
  topic: z.string(),
  decision: z.string(),
  reason: z.string().optional(),
  source: ProvenanceSourceSchema.default("USER"),
  affects: z.array(z.string()).default([]),
});
export const CreateAssumptionActionSchema = z.object({
  ...ActionBase,
  type: z.literal("CREATE_ASSUMPTION"),
  statement: z.string(),
  confidence: ConfidenceSchema,
  impact: z.enum(["LOW", "MEDIUM", "HIGH"]),
});
export const RaiseContradictionActionSchema = z.object({
  ...ActionBase,
  type: z.literal("RAISE_CONTRADICTION"),
  severity: z.enum(["BLOCKING", "WARNING", "INFO"]),
  explanation: z.string(),
  conflictingFields: z.array(z.string()).default([]),
  recommendedResolution: z.string(),
});
export const ResolveContradictionActionSchema = z.object({
  ...ActionBase,
  type: z.literal("RESOLVE_CONTRADICTION"),
  contradictionId: z.string(),
  resolution: z.string(),
});
export const UpdateRequirementActionSchema = z.object({
  ...ActionBase,
  type: z.literal("UPDATE_REQUIREMENT"),
  requirementId: z.string(),
  status: z.enum([
    "UNRESOLVED",
    "ASSUMED",
    "INFERRED",
    "ANSWERED",
    "CONFLICTING",
  ]),
  resolution: z.string().optional(),
  confidence: z.number().min(0).max(100).optional(),
});
export const GenerateArtifactActionSchema = z.object({
  ...ActionBase,
  type: z.literal("GENERATE_ARTIFACT"),
  artifactType: z.enum(["BRD", "PRD", "ERD", "ALL"]),
  approvalRequired: z.boolean().default(true),
});
export const WaitForUserActionSchema = z.object({
  ...ActionBase,
  type: z.literal("WAIT_FOR_USER"),
  reason: z.string(),
});

export const AgentActionSchema = z.discriminatedUnion("type", [
  AskUserActionSchema,
  CallToolActionSchema,
  RecordDecisionActionSchema,
  CreateAssumptionActionSchema,
  RaiseContradictionActionSchema,
  ResolveContradictionActionSchema,
  UpdateRequirementActionSchema,
  GenerateArtifactActionSchema,
  WaitForUserActionSchema,
]);
export type AgentAction = z.infer<typeof AgentActionSchema>;
export type AgentActionType = AgentAction["type"];

export const AgentObservationSchema = z.object({
  type: z.string(),
  summary: z.string(),
  data: z.record(z.string(), z.unknown()).default({}),
});
export type AgentObservation = z.infer<typeof AgentObservationSchema>;

export function parseAgentAction(value: unknown): AgentAction {
  return AgentActionSchema.parse(value);
}

export function requiresHumanApproval(action: AgentAction) {
  return (
    action.type === "RECORD_DECISION" ||
    action.type === "RESOLVE_CONTRADICTION" ||
    action.type === "GENERATE_ARTIFACT"
  );
}

export function isTerminalAction(action: AgentAction) {
  return action.type === "WAIT_FOR_USER" || action.type === "GENERATE_ARTIFACT";
}

export const AgentStateSnapshotSchema = z.object({
  project: ProjectStateSchema,
  lastObservation: AgentObservationSchema.optional(),
  iteration: z.number().int().min(0).default(0),
});
export type AgentStateSnapshot = z.infer<typeof AgentStateSnapshotSchema>;
