export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";
import { requireAuth, AuthError, jsonError } from "@/lib/auth-helpers";
import { runJob } from "@/lib/jobs";
import { getSubscriptionInfo } from "@/lib/entitlements";
import { generateExport, validateConsistency } from "@rockfoundry/core";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    const { id } = await params;
    const member = await prisma.projectMember.findUnique({ where: { userId_projectId: { userId: session.user.id, projectId: id } } });
    if (!member) return jsonError("Project not found", 404);
    const { info, service } = await getSubscriptionInfo(session.user.id);
    const entitlement = service.checkExportLimit(info);
    if (!entitlement.allowed) return jsonError(entitlement.reason || "Export limit reached", 429);

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.deletedAt) return jsonError("Project not found", 404);
    const state = project.canonicalState as any;
    const consistency = validateConsistency(state);
    if (consistency.status === "blocked") {
      return Response.json({ error: "Build package has blocking consistency issues", consistency: consistency.issues }, { status: 422 });
    }

    const job = await runJob("zip_generation", `export:${id}:${project.version}`, { projectId: id, version: project.version }, async () => {
      const document = await prisma.generatedDocument.create({
        data: {
          projectId: id,
          type: "ZIP_EXPORT",
          status: "pending",
          snapshot: state,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          storageKey: `exports/${id}/v${project.version}.zip`,
        },
      });
      // Validate package generation before exposing an export record as complete.
      const pkg = await generateExport(state);
      await prisma.generatedDocument.update({ where: { id: document.id }, data: { status: "complete" } });
      return { documentId: document.id, bytes: pkg.buffer.length, consistency: consistency.summary };
    });

    return Response.json({ ...job.result, duplicate: job.duplicate, downloadUrl: `/api/projects/${id}/export` });
  } catch (error) {
    if (error instanceof AuthError) return jsonError(error.message, error.status);
    return jsonError(error instanceof Error ? error.message : "Export failed", 500);
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    const { id } = await params;
    const member = await prisma.projectMember.findUnique({ where: { userId_projectId: { userId: session.user.id, projectId: id } } });
    if (!member) return jsonError("Project not found", 404);
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.deletedAt) return jsonError("Project not found", 404);

    const pkg = await generateExport(project.canonicalState as any);
    return new Response(pkg.buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="rockfoundry-${(project.name || "untitled").replace(/[^a-z0-9]/gi, "-").toLowerCase()}.zip"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return jsonError(error.message, error.status);
    return jsonError("Export download failed", 500);
  }
}
