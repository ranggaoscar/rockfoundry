export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import {
  artifactComposerErrorPayload,
  composeDraftArtifacts,
  latestDraftArtifacts,
  publicDraftArtifact,
  DRAFT_ARTIFACT_FILES,
  DRAFT_ARTIFACT_TYPES,
} from "@/lib/artifact-composer";
import {
  getLocalProject,
  jsonError,
  parseProjectState,
} from "@/lib/local-project";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getLocalProject(id);
  if (!project) return jsonError("Project not found", 404);
  const latest = await latestDraftArtifacts(id, project.version);
  const artifacts = latest?.artifacts || [];
  return Response.json({
    currentVersion: project.version,
    generation: latest?.generation
      ? {
          id: latest.generation.id,
          generationNumber: latest.generation.generationNumber,
          canonicalVersion: latest.generation.canonicalVersion,
          status: latest.generation.status,
        }
      : null,
    documents: artifacts.map((artifact) => publicDraftArtifact(artifact, project.version)),
    hasCurrentDraft: artifacts.length === DRAFT_ARTIFACT_TYPES.length,
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
      },
      documents: generated.artifacts.map((artifact) => publicDraftArtifact(artifact, project.version)),
      generated: DRAFT_ARTIFACT_TYPES.map((type) => DRAFT_ARTIFACT_FILES[type]),
    });
  } catch (error) {
    const payload = artifactComposerErrorPayload(error);
    return jsonError(payload.error, 422, {
      code: payload.code,
      retryable: payload.retryable,
    });
  }
}
