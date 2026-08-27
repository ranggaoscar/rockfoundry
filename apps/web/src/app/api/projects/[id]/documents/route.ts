export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { ProjectStateSchema } from "@rockfoundry/core";
import { prisma } from "@rockfoundry/db";
import {
  artifactComposerErrorPayload,
  composeDraftArtifacts,
  currentDraftGeneration,
  latestDraftArtifacts,
  parseDraftGenerationBatches,
  publicDraftArtifact,
  DRAFT_ARTIFACT_FILES,
  DRAFT_ARTIFACT_TYPES,
} from "@/lib/artifact-composer";
import {
  getLocalProject,
  jsonError,
  parseProjectState,
} from "@/lib/local-project";
import { isProductDraftCurrent } from "@/lib/project-truth";

async function draftIsCurrent(
  projectId: string,
  projectVersion: number,
  draftCanonicalVersion: number | null | undefined,
  currentState: ReturnType<typeof parseProjectState>,
) {
  if (draftCanonicalVersion === null || draftCanonicalVersion === undefined)
    return false;
  const revision = await prisma.projectStateRevision.findUnique({
    where: { projectId_version: { projectId, version: draftCanonicalVersion } },
    select: { state: true },
  });
  if (!revision) return draftCanonicalVersion === projectVersion;
  try {
    const draftState = ProjectStateSchema.parse(JSON.parse(revision.state));
    return isProductDraftCurrent(draftState, currentState);
  } catch {
    return draftCanonicalVersion === projectVersion;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getLocalProject(id);
  if (!project) return jsonError("Project not found", 404);
  const latest = await latestDraftArtifacts(id, project.version);
  const current = await currentDraftGeneration(id);
  const artifacts = latest?.artifacts || [];
  const currentDraft = await draftIsCurrent(
    id,
    project.version,
    latest?.generation?.canonicalVersion ?? artifacts[0]?.canonicalVersion,
    parseProjectState(project),
  );
  return Response.json({
    currentVersion: project.version,
    generation: current
      ? {
          id: current.id,
          generationNumber: current.generationNumber,
          canonicalVersion: current.canonicalVersion,
          status: current.status,
          batches: parseDraftGenerationBatches(current.composerMetadata),
        }
      : latest?.generation
        ? {
            id: latest.generation.id,
            generationNumber: latest.generation.generationNumber,
            canonicalVersion: latest.generation.canonicalVersion,
            status: latest.generation.status,
            batches: parseDraftGenerationBatches(latest.generation.composerMetadata),
          }
        : null,
    documents: artifacts.map((artifact) =>
      publicDraftArtifact(artifact, project.version, currentDraft),
    ),
    hasCurrentDraft:
      currentDraft && artifacts.length === DRAFT_ARTIFACT_TYPES.length,
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await getLocalProject(id);
    if (!project) return jsonError("Project not found", 404);
    const state = parseProjectState(project);
    if (!state.rawIdea.trim() && !state.normalizedSummary?.trim())
      return jsonError(
        "Add a product idea before generating a Product Draft.",
        422,
        { code: "DRAFT_INPUT_REQUIRED" },
      );
    const generated = await composeDraftArtifacts(id, project.version, state);
    return Response.json({
      currentVersion: project.version,
      generation: {
        id: generated.generation.id,
        generationNumber: generated.generation.generationNumber,
        canonicalVersion: generated.generation.canonicalVersion,
        status: generated.generation.status,
        batches: parseDraftGenerationBatches(generated.generation.composerMetadata),
      },
      documents: generated.artifacts.map((artifact) => publicDraftArtifact(artifact, project.version)),
      generated: DRAFT_ARTIFACT_TYPES.map((type) => DRAFT_ARTIFACT_FILES[type]),
    });
  } catch (error) {
    const payload = artifactComposerErrorPayload(error);
    const { id } = await params;
    const failed = await currentDraftGeneration(id);
    return jsonError(payload.error, 422, {
      code: payload.code,
      retryable: payload.retryable,
      generation: failed
        ? {
            id: failed.id,
            generationNumber: failed.generationNumber,
            canonicalVersion: failed.canonicalVersion,
            status: failed.status,
            batches: parseDraftGenerationBatches(failed.composerMetadata),
          }
        : null,
    });
  }
}
