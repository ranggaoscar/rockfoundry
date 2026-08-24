import type { PrismaClient } from "@rockfoundry/db";

const STALE_MS = 120_000;
export const HEARTBEAT_INTERVAL_MS = 15_000;

type PackageJobDb = Pick<PrismaClient, "packageJob">;

export type PackageJobHeartbeatTimers = {
  setInterval: (callback: () => void | Promise<void>, delay: number) => unknown;
  clearInterval: (handle: unknown) => void;
};

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

export async function refreshPackageJobHeartbeat(db: PackageJobDb, jobId: string) {
  return db.packageJob.updateMany({
    where: { id: jobId, status: "RUNNING" },
    data: { heartbeatAt: new Date() },
  });
}

export function startPackageJobHeartbeat(
  db: PackageJobDb,
  jobId: string,
  intervalMs = HEARTBEAT_INTERVAL_MS,
  timers: PackageJobHeartbeatTimers = {
    setInterval: (callback, delay) => globalThis.setInterval(callback, delay),
    clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
  },
) {
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const refreshed = await refreshPackageJobHeartbeat(db, jobId);
      if (refreshed.count !== 1) stop();
    } catch {
      // A transient heartbeat failure must not abort the active generation.
    }
  };

  const handle = timers.setInterval(tick, intervalMs);
  const stop = () => {
    if (stopped) return;
    stopped = true;
    timers.clearInterval(handle);
  };
  return stop;
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
