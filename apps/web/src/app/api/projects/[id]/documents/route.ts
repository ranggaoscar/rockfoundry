export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";
import {
  DRAFT_ARTIFACT_TYPES,
  persistDraftArtifacts,
  publicDraftArtifact,
} from "@/lib/artifacts";
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

  const artifacts = await prisma.artifact.findMany({
    where: { projectId: id, type: { in: [...DRAFT_ARTIFACT_TYPES] } },
    orderBy: [{ version: "desc" }, { generatedAt: "desc" }],
  });
  const latestByType = new Map<string, (typeof artifacts)[number]>();
  for (const artifact of artifacts) {
    if (!latestByType.has(artifact.type))
      latestByType.set(artifact.type, artifact);
  }

  return Response.json({
    currentVersion: project.version,
    documents: [...latestByType.values()].map((artifact) => ({
      ...publicDraftArtifact(artifact),
      current: artifact.version === project.version,
    })),
    hasCurrentDraft: artifacts.some(
      (artifact) => artifact.version === project.version,
    ),
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

    const generated = await persistDraftArtifacts(id, project.version, state);
    return Response.json({
      currentVersion: project.version,
      documents: generated.artifacts.map(publicDraftArtifact),
      consistency: generated.consistency,
      generated: DRAFT_ARTIFACT_TYPES.map((type) => `${type}.md`),
    });
  } catch {
    return jsonError("RockFoundry couldn't generate the Product Draft.", 422);
  }
}
