import { prisma } from "@rockfoundry/db";
import { claimNextPackageJob, recoverStalePackageJobs } from "./package-job-claims";
import type { PackageJobRuntime } from "./package-jobs";

let started = false;
let interval: ReturnType<typeof setInterval> | undefined;

export { claimNextPackageJob, recoverStalePackageJobs } from "./package-job-claims";

export async function runPackageWorkerOnce(runtime: PackageJobRuntime = {}) {
  const db = runtime.db || prisma;
  await recoverStalePackageJobs(db);
  const jobId = await claimNextPackageJob(db);
  if (jobId) {
    const { runPackageJob } = await import("./package-jobs");
    await runPackageJob(jobId, true, runtime);
    return true;
  }
  return false;
}

export function startPackageWorker() {
  if (started) return;
  started = true;
  const tick = () => { void runPackageWorkerOnce().catch(() => undefined); };
  interval = setInterval(tick, 1000);
  interval.unref();
}

export function resetPackageWorkerForTests() {
  if (interval) clearInterval(interval);
  interval = undefined;
  started = false;
}

export function isPackageWorkerStartedForTests() {
  return started;
}
