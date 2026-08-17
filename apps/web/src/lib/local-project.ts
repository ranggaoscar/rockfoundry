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

export async function saveProjectState(
  projectId: string,
  state: ProjectState,
  expectedVersion?: number,
  description?: string,
) {
  const parsed = ProjectStateSchema.parse(state);
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
  });
  await prisma.$transaction([
    prisma.project.update({
      where: { id: projectId },
      data: {
        canonicalState: JSON.stringify(nextState),
        version,
        ...(description === undefined ? {} : { description }),
      },
    }),
    prisma.projectStateRevision.create({
      data: {
        projectId,
        version,
        state: JSON.stringify(nextState),
        reason: "canonical state update",
      },
    }),
  ]);
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
