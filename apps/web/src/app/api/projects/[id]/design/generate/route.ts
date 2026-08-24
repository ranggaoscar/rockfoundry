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

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await getLocalProject(id);
    if (!project) return jsonError("Project not found", 404);
    const state = parseProjectState(project);
    const packageJob = await prisma.packageJob.findFirst({
      where: {
        projectId: id,
        projectVersion: project.version,
        status: "COMPLETED",
      },
    });
    if (!packageJob && state.studio.currentVersion === 0)
      return jsonError("Selesaikan Product Package sebelum membuat prototype.", 422);
    const enqueued = await enqueueDesignGenerationJob(prisma, id, project.version);
    return Response.json(
      {
        job: await latestDesignGenerationJob(prisma, id, project.version),
        reused: enqueued.reused,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("active prototype job"))
      return jsonError("A prototype is already being prepared for this project.", 409);
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
