import { withOwner } from "@/lib/owner-access";
export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";
import { getLocalProject, jsonError } from "@/lib/local-project";

async function GETHandler(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!(await getLocalProject(id)))
      return jsonError("Project not found", 404);
    const revisions = await prisma.projectStateRevision.findMany({
      where: { projectId: id },
      select: { id: true, version: true, reason: true, createdAt: true },
      orderBy: { version: "desc" },
      take: 50,
    });
    return Response.json({ revisions });
  } catch {
    return jsonError("RockFoundry couldn't load state history.");
  }
}
export const GET = withOwner(GETHandler);
