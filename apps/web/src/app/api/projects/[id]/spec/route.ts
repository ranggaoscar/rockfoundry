export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { evaluateDraftSpecMaturity, generateExport, validateConsistency } from "@rockfoundry/core";
import { prisma } from "@rockfoundry/db";
import {
  getLocalProject,
  jsonError,
  parseProjectState,
} from "@/lib/local-project";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await getLocalProject(id);
    if (!project) return jsonError("Project not found", 404);
    const state = parseProjectState(project);
    const maturity = evaluateDraftSpecMaturity(state);
    if (!maturity.ready) {
      return jsonError(
        "A canonical product truth is required before generating a handoff.",
        422,
        { code: "HANDOFF_BLOCKED", missing: maturity.missing },
      );
    }
    const generated = await generateExport(state);
    const consistency = validateConsistency(state);
    await prisma.$transaction(
      Object.entries(generated.documents).map(([type, content]) =>
        prisma.artifact.upsert({
          where: {
            projectId_type_version: {
              projectId: id,
              type,
              version: project.version,
            },
          },
          create: {
            projectId: id,
            type,
            status: consistency.status === "BLOCKING" ? "DRAFT" : "READY",
            content,
            version: project.version,
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
      spec: {
        status: consistency.status,
        unresolvedQuestions: state.openQuestions,
        assumptions: state.assumptions,
        documents: ["PRODUCT_SPEC.md", "AGENT_HANDOFF.md", "DO_NOT_INVENT.md"],
      },
      version: project.version,
      consistency,
    });
  } catch {
    return jsonError("RockFoundry couldn't create the draft spec.", 422);
  }
}
