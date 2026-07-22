export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";
import { requireAuth, AuthError, jsonError } from "@/lib/auth-helpers";
import { generateExport } from "@rockfoundry/core";

// POST /api/projects/[id]/export — generate build package
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    const { id } = await params;

    const member = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: session.user.id, projectId: id } },
    });
    if (!member) return jsonError("Project not found", 404);

    // Entitlement Check for build package generation
    const sub = await prisma.subscription.findFirst({
      where: { userId: session.user.id, status: "active", expiresAt: { gt: new Date() } }
    });
    
    if (!sub) {
      return jsonError("Active Cloud Starter subscription required to generate packages", 403);
    }
    
    // Simplistic usage check for the demo
    const exportsThisMonth = await prisma.generatedDocument.count({
      where: {
        projectId: id,
        type: "ZIP_EXPORT",
        createdAt: { gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      }
    });

    if (exportsThisMonth >= 3) {
      return jsonError("Monthly export limit reached", 429);
    }

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.deletedAt) return jsonError("Project not found", 404);

    const state = project.canonicalState as any;
    const pkg = await generateExport(state);

    const doc = await prisma.generatedDocument.create({
      data: {
        projectId: id,
        type: "ZIP_EXPORT",
        status: "complete",
        snapshot: state,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        storageKey: `exports/${id}/${Date.now()}.zip`,
      },
    });

    // In a real app we'd upload buffer to S3/MinIO using doc.storageKey
    // Here we'll just return it directly or save to local disk for dev

    return new Response(pkg.buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="rockfoundry-${(project.name || "untitled").replace(/[^a-z0-9]/gi, "-").toLowerCase()}.zip"`,
      },
    });

  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    console.error(e);
    return jsonError("Internal error", 500);
  }
}
