export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getLocalProject,
  jsonError,
  parseProjectState,
} from "@/lib/local-project";
import { reviseProjectDesign } from "@/lib/design";

const Input = z.object({ text: z.string().trim().min(2).max(2000) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await getLocalProject(id);
    if (!project) return jsonError("Project not found", 404);
    const { text } = Input.parse(await req.json());
    const result = await reviseProjectDesign(
      id,
      parseProjectState(project),
      project.version,
      text,
    );
    return Response.json({
      impact: result.impact,
      message: "message" in result ? result.message : undefined,
      state: result.state,
      version: result.version,
      studio: result.state.studio,
      files: "generated" in result ? result.generated.files : [],
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return jsonError("Describe the design change.", 400);
    return jsonError("RockFoundry couldn't revise that design.", 422);
  }
}
