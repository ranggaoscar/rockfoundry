export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import {
  getLocalProject,
  jsonError,
  parseProjectState,
} from "@/lib/local-project";
import {
  designGenerationUserMessage,
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
    const result = await generateProjectDesign(
      id,
      parseProjectState(project),
      project.version,
    );
    return Response.json({
      state: result.state,
      version: result.version,
      studio: result.state.studio,
      files: result.generated.files,
      spec: result.generated.designSpec,
      assumptions: result.generated.assumptions,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DESIGN_BLOCKED")
      return jsonError("Not enough product structure to design yet.", 422);
    logDesignGenerationFailure(error);
    return jsonError(designGenerationUserMessage(error), 422);
  }
}
