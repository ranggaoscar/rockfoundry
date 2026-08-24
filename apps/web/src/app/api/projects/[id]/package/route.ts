export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { evaluateReadinessDirectly } from "@rockfoundry/core";
import {
  getLocalProject,
  jsonError,
  parseProjectState,
} from "@/lib/local-project";
import { getPackageEligibility } from "@/lib/package-readiness";
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
    const packageEligibility = getPackageEligibility(readiness);
    if (!packageEligibility.canBuildPackage)
      return jsonError(
        "Selesaikan keputusan penting sebelum membuat paket produk.",
        422,
        packageEligibility,
      );

    const enqueued = await enqueuePackageJob(prisma, id, project.version);
    return Response.json(
      {
        job: await latestPackageJob(id, prisma, project.version),
        reused: enqueued.reused,
        ...packageEligibility,
      },
      { status: 202 },
    );
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
  const readiness = evaluateReadinessDirectly(parseProjectState(project));
  const job = await latestPackageJob(id, prisma, project.version);
  return Response.json({ job, ...getPackageEligibility(readiness) });
}
