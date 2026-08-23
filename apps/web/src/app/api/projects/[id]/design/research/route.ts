export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getLocalProject,
  jsonError,
  parseProjectState,
} from "@/lib/local-project";
import { researchDesignReferences } from "@/lib/design";

const Input = z.object({ query: z.string().trim().min(3).max(300) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await getLocalProject(id);
    if (!project) return jsonError("Project not found", 404);
    const { query } = Input.parse(await req.json());
    const result = await researchDesignReferences(
      id,
      parseProjectState(project),
      query,
    );
    return Response.json({
      query,
      activities: result.result.activities.map((activity) => ({
        action: activity.action.type,
        toolName:
          activity.action.type === "CALL_TOOL"
            ? activity.action.toolName
            : undefined,
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return jsonError("Enter a short design research query.", 400);
    return jsonError("RockFoundry couldn't research that design reference.", 502);
  }
}
