export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";
import { requireAuth, AuthError, jsonError } from "@/lib/auth-helpers";
import { generateExport, validateConsistency } from "@rockfoundry/core";
import JSZip from "jszip";

// POST /api/projects/[id]/export — generate build package
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    const { id } = await params;

    const member = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: session.user.id, projectId: id } },
    });
    if (!member) return jsonError("Project not found", 404);

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.deletedAt) return jsonError("Project not found", 404);

    const state = project.canonicalState as any;

    // Check consistency before export
    const consistency = validateConsistency(state);
    if (consistency.status === "blocked") {
      return Response.json({
        error: "Build package has blocking consistency issues",
        consistency: consistency.issues,
      }, { status: 422 });
    }

    // Generate the ZIP
    const pkg = await generateExport(state);

    // Record the export
    await prisma.generatedDocument.create({
      data: {
        projectId: id,
        type: "ZIP_EXPORT",
        status: "complete",
        snapshot: state,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        storageKey: `exports/${id}/${Date.now()}.zip`,
      },
    });

    // For the UI: load the zip and extract document contents as JSON
    const zip = await JSZip.loadAsync(pkg.buffer);
    const documents: Record<string, string> = {};

    const entries = Object.entries(zip.files);
    for (const [path, file] of entries) {
      if (!file.dir) {
        documents[path] = await file.async("string");
      }
    }

    return Response.json({
      documents,
      metadata: pkg.metadata,
      consistency: consistency.summary,
    });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    console.error(e);
    return jsonError("Internal error", 500);
  }
}

// GET /api/projects/[id]/export/download — download the ZIP
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    const { id } = await params;

    const member = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: session.user.id, projectId: id } },
    });
    if (!member) return jsonError("Project not found", 404);

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.deletedAt) return jsonError("Project not found", 404);

    const state = project.canonicalState as any;
    const pkg = await generateExport(state);

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
