export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";
import { requireAuth, AuthError, jsonError } from "@/lib/auth-helpers";

// Helper: verify project ownership
async function getOwnedProject(userId: string, projectId: string) {
  const member = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
    include: { project: true },
  });
  if (!member || member.project.deletedAt) return null;
  return member.project;
}

// GET /api/projects/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    const { id } = await params;
    const project = await getOwnedProject(session.user.id, id);
    if (!project) return jsonError("Project not found", 404);
    return Response.json({ project });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    return jsonError("Internal error", 500);
  }
}

// PATCH /api/projects/[id] — update canonical state or metadata
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    const { id } = await params;
    const project = await getOwnedProject(session.user.id, id);
    if (!project) return jsonError("Project not found", 404);

    const body = await req.json();

    // Optimistic concurrency check
    if (body.expectedVersion && body.expectedVersion !== project.version) {
      return jsonError("Project was modified by another operation. Please refresh.", 409);
    }

    const updateData: Record<string, any> = {};

    if (body.name) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;

    if (body.canonicalState) {
      updateData.canonicalState = body.canonicalState;
      updateData.version = { increment: 1 };
    }

    const updated = await prisma.project.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, version: true, canonicalState: true, updatedAt: true },
    });

    // Create revision if state changed
    if (body.canonicalState) {
      await prisma.projectStateRevision.create({
        data: {
          projectId: id,
          version: updated.version,
          state: body.canonicalState,
        },
      });
    }

    return Response.json({ project: updated });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    console.error("Update project error:", e);
    return jsonError("Internal error", 500);
  }
}

// DELETE /api/projects/[id] — soft delete
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    const { id } = await params;
    const project = await getOwnedProject(session.user.id, id);
    if (!project) return jsonError("Project not found", 404);

    await prisma.project.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    return jsonError("Internal error", 500);
  }
}
