import type { PrismaClient } from "@rockfoundry/db";

const STALE_MS = 120_000;

type PackageJobDb = Pick<PrismaClient, "packageJob">;

export async function enqueuePackageJob(db: PackageJobDb, projectId: string, projectVersion: number) {
  const active = await db.packageJob.findFirst({ where: { projectId, status: { in: ["QUEUED", "RUNNING"] } }, orderBy: { createdAt: "desc" } });
  if (active) {
    if (active.projectVersion !== projectVersion) {
      throw new Error("An active package job exists for a different project version.");
    }
    return { job: active, reused: true };
  }
  const job = await db.packageJob.create({ data: { projectId, projectVersion, status: "QUEUED", stage: "PREPARING_PRODUCT" } });
  return { job, reused: false };
}

export function isPackageJobVersionCurrent(projectVersion: number, jobVersion: number) {
  return projectVersion === jobVersion;
}

export async function recoverStalePackageJobs(db: PackageJobDb) {
  const cutoff = new Date(Date.now() - STALE_MS);
  return db.packageJob.updateMany({
    where: { status: "RUNNING", OR: [{ heartbeatAt: null }, { heartbeatAt: { lt: cutoff } }] },
    data: { status: "FAILED", stage: "FAILED", errorSummary: "Build was interrupted and can be retried." },
  });
}

export async function claimNextPackageJob(db: PackageJobDb) {
  const candidate = await db.packageJob.findFirst({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" } });
  if (!candidate) return null;
  const claimed = await db.packageJob.updateMany({
    where: { id: candidate.id, status: "QUEUED" },
    data: { status: "RUNNING", startedAt: new Date(), heartbeatAt: new Date() },
  });
  return claimed.count === 1 ? candidate.id : null;
}

export { STALE_MS };
