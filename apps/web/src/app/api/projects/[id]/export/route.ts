export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import {
  evaluateDecisionDebt,
  evaluateDraftSpecMaturity,
  generateExport,
  validateConsistency,
} from "@rockfoundry/core";
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
  const { id } = await params;
  const project = await getLocalProject(id);
  if (!project) return jsonError("Project not found", 404);
  const state = parseProjectState(project);
  const maturity = evaluateDraftSpecMaturity(state);
  if (!maturity.ready)
    return jsonError(
      "A canonical product truth is required before generating a handoff.",
      422,
      { code: "HANDOFF_BLOCKED", missing: maturity.missing },
    );
  const consistency = validateConsistency(state);
  try {
    const generated = await generateExport(state);
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
      generated: [
        "PRODUCT_SPEC.md",
        "AGENT_HANDOFF.md",
        "DECISIONS.md",
        "DO_NOT_INVENT.md",
      ],
      version: project.version,
      consistency,
      decisionDebt: evaluateDecisionDebt(state),
      downloadUrl: `/api/projects/${id}/export`,
    });
  } catch {
    return jsonError("RockFoundry couldn't generate the documents.", 422);
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
  const maturity = evaluateDraftSpecMaturity(state);
  if (!maturity.ready)
    return jsonError(
      "A canonical product truth is required before downloading a handoff.",
      422,
      { code: "HANDOFF_BLOCKED", missing: maturity.missing },
    );
  try {
    const generated = await generateExport(parseProjectState(project));
    return new Response(new Uint8Array(generated.buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${(project.name || "rockfoundry-project").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.zip"`,
      },
    });
  } catch {
    return jsonError("RockFoundry couldn't prepare the download.", 422);
  }
}
