export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import {
  getLocalProject,
  jsonError,
  parseProjectState,
} from "@/lib/local-project";
import { approveProjectDesign } from "@/lib/design";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await getLocalProject(id);
    if (!project) return jsonError("Project not found", 404);
    const result = await approveProjectDesign(
      id,
      parseProjectState(project),
      project.version,
    );
    return Response.json({
      state: result.state,
      version: result.version,
      studio: result.state.studio,
    });
  } catch {
    return jsonError("RockFoundry couldn't approve that design.", 422);
  }
}
