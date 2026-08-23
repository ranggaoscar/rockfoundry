export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";
import {
  evaluateDecisionDebt,
  generateExport,
  validateConsistency,
} from "@rockfoundry/core";
import {
  getLocalProject,
  jsonError,
  parseProjectState,
} from "@/lib/local-project";
import {
  generateProjectDesign,
  logDesignGenerationFailure,
} from "@/lib/design";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await getLocalProject(id);
    if (!project) return jsonError("Project not found", 404);
    const design = await generateProjectDesign(
      id,
      parseProjectState(project),
      project.version,
    );
    const state = design.state;
    const consistency = validateConsistency(state);
    const generated = await generateExport(state);
    await prisma.$transaction(
      Object.entries(generated.documents).map(([type, content]) =>
        prisma.artifact.upsert({
          where: {
            projectId_type_version: {
              projectId: id,
              type,
              version: design.version,
            },
          },
          create: {
            projectId: id,
            type,
            status: consistency.status === "BLOCKING" ? "DRAFT" : "READY",
            content,
            version: design.version,
          },
          update: {
            status: consistency.status === "BLOCKING" ? "DRAFT" : "READY",
            content,
            generatedAt: new Date(),
          },
        }),
      ),
    );
    return Response.json({
      state,
      version: design.version,
      documents: ["BRD", "PRD", "ERD", "DECISIONS", "READINESS"],
      design: {
        version: state.studio.currentVersion,
        screenCount: state.studio.screenMap.length,
      },
      decisionDebt: evaluateDecisionDebt(state),
      downloadUrl: `/api/projects/${id}/export`,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DESIGN_BLOCKED")
      return jsonError(
        "Add a little more product context before building the package.",
        422,
      );
    logDesignGenerationFailure(error);
    return jsonError("RockFoundry couldn't build the product package.", 422);
  }
}
