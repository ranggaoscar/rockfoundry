export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import {
  getLocalProject,
  jsonError,
  parseProjectState,
} from "@/lib/local-project";
import {
  enqueueDesignGenerationJob,
  latestDesignGenerationJob,
} from "@/lib/design-job-claims";
import { prisma } from "@rockfoundry/db";
import {
  assertCurrentProductDraft,
  CURRENT_PRODUCT_DRAFT_ERROR,
} from "@/lib/current-product-draft";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await getLocalProject(id);
    if (!project) return jsonError("Project not found", 404);
    const state = parseProjectState(project);
    if (!state.rawIdea.trim() && !state.normalizedSummary?.trim()) {
      return jsonError(
        "Add a product idea before creating a design preview.",
        422,
        { code: "DESIGN_BLOCKED" },
      );
    }
    await assertCurrentProductDraft({
      projectId: id,
      currentVersion: project.version,
      currentState: state,
    });
    const enqueued = await enqueueDesignGenerationJob(
      prisma,
      id,
      project.version,
    );
    return Response.json(
      {
        job: await latestDesignGenerationJob(prisma, id, project.version),
        reused: enqueued.reused,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === CURRENT_PRODUCT_DRAFT_ERROR)
      return jsonError(
        "Generate the current Product Draft before creating a Design Preview.",
        422,
        { code: "CURRENT_PRODUCT_DRAFT_REQUIRED" },
      );
    if (
      error instanceof Error &&
      error.message.includes("active prototype job")
    )
      return jsonError(
        "A prototype is already being prepared for this project.",
        409,
      );
    return jsonError("RockFoundry couldn't start the prototype.", 422);
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getLocalProject(id);
  if (!project) return jsonError("Project not found", 404);
  return Response.json({ job: await latestDesignGenerationJob(prisma, id) });
}
