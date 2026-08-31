export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";
import {
  getLocalProject,
  jsonError,
  parseProjectState,
} from "@/lib/local-project";
import { designSnapshot } from "@/lib/design";
import { latestDesignGenerationJob } from "@/lib/design-job-claims";
import { latestDraftArtifacts } from "@/lib/artifact-composer";
import { parsePersistedScreenMap } from "@/lib/design-draft-bridge";

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getLocalProject(id);
  if (!project) return jsonError("Project not found", 404);
  const state = parseProjectState(project);
  const [
    packageJob,
    packageSpec,
    packageScreenMap,
    packageDecisions,
    designJob,
    draft,
  ] = await Promise.all([
    prisma.packageJob.findFirst({
      where: { projectId: id, projectVersion: project.version },
      orderBy: { createdAt: "desc" },
    }),
    prisma.artifact.findFirst({
      where: {
        projectId: id,
        type: "PACKAGE_DESIGN_SPEC",
        version: project.version,
      },
      orderBy: { generatedAt: "desc" },
    }),
    prisma.artifact.findFirst({
      where: {
        projectId: id,
        type: "PACKAGE_SCREEN_MAP",
        version: project.version,
      },
      orderBy: { generatedAt: "desc" },
    }),
    prisma.artifact.findFirst({
      where: {
        projectId: id,
        type: "PACKAGE_DESIGN_DECISIONS",
        version: project.version,
      },
      orderBy: { generatedAt: "desc" },
    }),
    latestDesignGenerationJob(prisma, id),
    latestDraftArtifacts(id, project.version),
  ]);
  const packageDesign = packageSpec
    ? {
        screenMap: parseJson(packageScreenMap?.content, state.studio.screenMap),
        designSpec: parseJson(packageSpec.content, null),
        summary:
          packageDecisions?.content ||
          "Baseline DesignSpec derived from Product Truth and Screen Map.",
      }
    : null;
  const draftScreenMap = parsePersistedScreenMap(
    draft?.artifacts.find((artifact) => artifact.type === "SCREEN_MAP")
      ?.content || "",
  );
  return Response.json({
    ...designSnapshot(state),
    state,
    version: project.version,
    packageReady:
      packageJob?.status === "COMPLETED" ||
      Boolean(packageDesign) ||
      state.studio.currentVersion > 0,
    packageDesign,
    draftScreenMap,
    designJob,
  });
}
