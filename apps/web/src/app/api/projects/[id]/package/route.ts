import { withOwner } from "@/lib/owner-access";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import {
  getLocalProject,
  jsonError,
  parseProjectState,
} from "@/lib/local-project";
import { latestPackageJob } from "@/lib/package-jobs";
import { enqueuePackageJob } from "@/lib/package-job-claims";
import { prisma } from "@rockfoundry/db";

async function POSTHandler(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await getLocalProject(id);
    if (!project) return jsonError("Project not found", 404);
    const state = parseProjectState(project);
    if (!state.rawIdea.trim() && !state.normalizedSummary?.trim())
      return jsonError(
        "Add a product idea before creating a final handoff.",
        422,
        { code: "HANDOFF_INPUT_REQUIRED" },
      );

    const enqueued = await enqueuePackageJob(prisma, id, project.version);
    return Response.json(
      {
        job: await latestPackageJob(id, prisma, project.version),
        reused: enqueued.reused,
      },
      { status: 202 },
    );
  } catch {
    return jsonError("RockFoundry couldn't start the product package.", 422);
  }
}

async function GETHandler(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getLocalProject(id);
  if (!project) return jsonError("Project not found", 404);
  const job = await latestPackageJob(id, prisma, project.version);
  return Response.json({ job });
}
export const POST = withOwner(POSTHandler);
export const GET = withOwner(GETHandler);
