export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";
import { requireAuth, AuthError, jsonError } from "@/lib/auth-helpers";

// GET /api/projects/[id]/revisions — list state revisions
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    const { id } = await params;

    const member = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: session.user.id, projectId: id } },
    });
    if (!member) return jsonError("Project not found", 404);

    const revisions = await prisma.projectStateRevision.findMany({
      where: { projectId: id },
      select: { id: true, version: true, createdAt: true },
      orderBy: { version: "desc" },
      take: 50,
    });

    return Response.json({ revisions });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    return jsonError("Internal error", 500);
  }
}
