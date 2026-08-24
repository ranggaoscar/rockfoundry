import { prisma } from "@rockfoundry/db";
import {
  createInitialProjectState,
  evaluateReadinessDirectly,
  ProjectStateSchema,
  type ProjectState,
} from "@rockfoundry/core";

export function jsonError(
  message: string,
  status = 500,
  extra?: Record<string, unknown>,
) {
  return Response.json({ error: message, ...extra }, { status });
}

export function parseProjectState(project: {
  id: string;
  name: string;
  description?: string | null;
  canonicalState: string;
}): ProjectState {
  try {
    return ProjectStateSchema.parse(JSON.parse(project.canonicalState));
  } catch {
    return createInitialProjectState({
      id: project.id,
      name: project.name,
      rawIdea: project.description || "",
    });
  }
}

export async function getLocalProject(id: string) {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || project.deletedAt) return null;
  return project;
}

export async function getProjectActivity(projectId: string) {
  const runs = await prisma.toolRun.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    take: 24,
  });
  return runs.map((run) => ({
    id: run.id,
    toolName: run.toolName,
    status: run.status,
    inputSummary: run.inputSummary,
    outputSummary: run.outputSummary,
    failureReason: run.failureReason,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
  }));
}

export async function getProjectMessages(projectId: string) {
  const messages = await prisma.conversationMessage.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  return messages.map(publicMessage);
}

export function publicMessage(message: {
  id: string;
  role: string;
  content: string;
  metadata: string | null;
  createdAt: Date;
}) {
  let metadata: Record<string, unknown> = {};
  try {
    const parsed = message.metadata ? JSON.parse(message.metadata) : {};
    if (parsed && typeof parsed === "object") metadata = parsed;
  } catch {
    metadata = {};
  }
  return {
    id: message.id,
    role: ["user", "assistant", "tool", "system"].includes(message.role)
      ? message.role
      : "system",
    text: message.content,
    questionId:
      typeof metadata.questionId === "string" ? metadata.questionId : undefined,
    topic: typeof metadata.topic === "string" ? metadata.topic : undefined,
    options: Array.isArray(metadata.options) ? metadata.options : undefined,
    recommendation:
      typeof metadata.recommendation === "string"
        ? metadata.recommendation
        : undefined,
    recommendedOptionId:
      typeof metadata.recommendedOptionId === "string"
        ? metadata.recommendedOptionId
        : undefined,
    recommendationReason:
      typeof metadata.recommendationReason === "string"
        ? metadata.recommendationReason
        : undefined,
    detail: typeof metadata.detail === "string" ? metadata.detail : undefined,
    category:
      typeof metadata.category === "string" ? metadata.category : undefined,
    createdAt: message.createdAt,
  };
}

export async function saveProjectState(
  projectId: string,
  state: ProjectState,
  expectedVersion?: number,
  description?: string,
  name?: string,
  assistantMessage?: {
    content: string;
    metadata: Record<string, unknown>;
  },
) {
  const parsed = ProjectStateSchema.parse({
    ...state,
    name: name?.trim() || state.name,
  });
  const current = await prisma.project.findUnique({ where: { id: projectId } });
  if (!current || current.deletedAt) throw new Error("PROJECT_NOT_FOUND");
  if (expectedVersion !== undefined && current.version !== expectedVersion)
    throw new Error("PROJECT_VERSION_CONFLICT");
  const version = current.version + 1;
  const readiness = evaluateReadinessDirectly(parsed);
  const nextState = ProjectStateSchema.parse({
    ...parsed,
    readiness: readiness.level,
    readinessScore: readiness.score,
    readinessBreakdown: readiness.breakdown,
    decisionDebt: readiness.decisionDebt,
    discovery: {
      ...parsed.discovery,
      evaluated: readiness.discovery.evaluated,
      importantDecisionsRemaining:
        readiness.discovery.importantDecisionsRemaining,
      unresolvedTopics: readiness.discovery.unresolvedTopics,
    },
  });
  await prisma.$transaction(async (transaction) => {
    await transaction.project.update({
      where: { id: projectId },
      data: {
        name: name?.trim() || nextState.name,
        canonicalState: JSON.stringify(nextState),
        version,
        ...(description === undefined ? {} : { description }),
      },
    });
    await transaction.projectStateRevision.create({
      data: {
        projectId,
        version,
        state: JSON.stringify(nextState),
        reason: "canonical state update",
      },
    });
    if (assistantMessage) {
      const existing = await transaction.conversationMessage.findFirst({
        where: {
          projectId,
          role: "assistant",
          content: assistantMessage.content,
        },
      });
      if (!existing) {
        await transaction.conversationMessage.create({
          data: {
            projectId,
            role: "assistant",
            content: assistantMessage.content,
            metadata: JSON.stringify({
              source: "AGENT",
              ...assistantMessage.metadata,
            }),
          },
        });
      }
    }
  });
  return { state: nextState, version };
}

export function publicProject(project: {
  id: string;
  name: string;
  description: string | null;
  canonicalState: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...project,
    canonicalState: JSON.parse(project.canonicalState),
  };
}
