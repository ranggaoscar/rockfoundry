import { prisma } from "@rockfoundry/db";
import { claimNextPackageJob, recoverStalePackageJobs } from "./package-job-claims";

let started = false;

export { claimNextPackageJob, recoverStalePackageJobs } from "./package-job-claims";

export async function runPackageWorkerOnce() {
  await recoverStalePackageJobs(prisma);
  const jobId = await claimNextPackageJob(prisma);
  if (!jobId) return false;
  const { runPackageJob } = await import("./package-jobs");
  await runPackageJob(jobId, true);
  return true;
}

export function startPackageWorker() {
  if (started) return;
  started = true;
  const tick = () => { void runPackageWorkerOnce().catch(() => undefined); };
  tick();
  setInterval(tick, 1000).unref();
}

export function resetPackageWorkerForTests() {
  started = false;
}

export function isPackageWorkerStartedForTests() {
  return started;
}
