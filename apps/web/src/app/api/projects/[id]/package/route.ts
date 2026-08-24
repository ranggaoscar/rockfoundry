export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { evaluateReadinessDirectly } from "@rockfoundry/core";
import { getLocalProject, jsonError, parseProjectState } from "@/lib/local-project";
import { latestPackageJob } from "@/lib/package-jobs";
import { enqueuePackageJob } from "@/lib/package-job-claims";
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
    const readiness = evaluateReadinessDirectly(state);
    if (readiness.level !== "BUILD_READY")
      return jsonError("Selesaikan keputusan penting sebelum membuat paket produk.", 422);

    const previous = await prisma.packageJob.findFirst({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
    });
    const enqueued = previous?.status === "DESIGN_FAILED" && previous.projectVersion === project.version
      ? {
          job: await prisma.packageJob.create({
            data: {
              projectId: id,
              projectVersion: project.version,
              status: "QUEUED",
              stage: "PROTOTYPE_GENERATION",
              completedStages: previous.completedStages,
              progress: JSON.stringify({ resumeFrom: "PROTOTYPE_GENERATION" }),
            },
          }),
          reused: false,
        }
      : await enqueuePackageJob(prisma, id, project.version);
    return Response.json({ job: await latestPackageJob(id), reused: enqueued.reused }, { status: 202 });
  } catch {
    return jsonError("RockFoundry couldn't start the product package.", 422);
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getLocalProject(id);
  if (!project) return jsonError("Project not found", 404);
  const job = await latestPackageJob(id);
  return Response.json({ job });
}