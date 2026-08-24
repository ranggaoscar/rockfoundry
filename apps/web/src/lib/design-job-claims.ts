import type { PrismaClient } from "@rockfoundry/db";

export const DESIGN_JOB_STALE_MS = 120_000;
export const DESIGN_JOB_HEARTBEAT_INTERVAL_MS = 15_000;

export const DESIGN_JOB_STAGES = [
  "DESIGN_ARCHITECTURE",
  "PROTOTYPE_GENERATION",
  "QUALITY_REVIEW",
  "PROTOTYPE_REPAIR",
  "COMPLETED",
] as const;

export type DesignJobStage = (typeof DESIGN_JOB_STAGES)[number];
type DesignJobDb = Pick<PrismaClient, "designGenerationJob">;

type DesignGenerationJobRecord = {
  id: string;
  projectId: string;
  projectVersion: number;
  status: string;
  stage: string;
  progress: string;
  errorSummary: string | null;
  retryCount: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
};

function stageLabel(stage: string) {
  const labels: Record<string, string> = {
    DESIGN_ARCHITECTURE: "Menyusun arah desain dengan AI",
    PROTOTYPE_GENERATION: "Membuat prototype dengan AI",
    QUALITY_REVIEW: "Memeriksa kualitas prototype",
    PROTOTYPE_REPAIR: "Memperbaiki prototype",
    COMPLETED: "Prototype selesai",
    FAILED: "Prototype belum berhasil dibuat",
  };
  return labels[stage] || "Menyiapkan prototype";
}

export function publicDesignGenerationJob(job: DesignGenerationJobRecord) {
  let progress: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(job.progress);
    if (parsed && typeof parsed === "object") progress = parsed;
  } catch {
    progress = {};
  }
  return {
    id: job.id,
    projectId: job.projectId,
    projectVersion: job.projectVersion,
    status: job.status,
    stage: job.stage,
    stageLabel: stageLabel(job.stage),
    progress,
    errorSummary: job.errorSummary,
    retryCount: job.retryCount,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  };
}

export async function enqueueDesignGenerationJob(
  db: DesignJobDb,
  projectId: string,
  projectVersion: number,
) {
  const active = await db.designGenerationJob.findFirst({
    where: { projectId, status: { in: ["QUEUED", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
  });
  if (active) {
    if (active.projectVersion !== projectVersion)
      throw new Error("An active prototype job exists for a different project version.");
    return { job: active, reused: true };
  }
  const previous = await db.designGenerationJob.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  const job = await db.designGenerationJob.create({
    data: {
      projectId,
      projectVersion,
      status: "QUEUED",
      stage: "DESIGN_ARCHITECTURE",
      retryCount: (previous?.retryCount || 0) + (previous ? 1 : 0),
    },
  });
  return { job, reused: false };
}

export async function latestDesignGenerationJob(
  db: DesignJobDb,
  projectId: string,
  projectVersion?: number,
) {
  const job = await db.designGenerationJob.findFirst({
    where: {
      projectId,
      ...(projectVersion === undefined ? {} : { projectVersion }),
    },
    orderBy: { createdAt: "desc" },
  });
  return job ? publicDesignGenerationJob(job) : null;
}

export async function claimNextDesignGenerationJob(db: DesignJobDb) {
  const candidate = await db.designGenerationJob.findFirst({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
  });
  if (!candidate) return null;
  const claimed = await db.designGenerationJob.updateMany({
    where: { id: candidate.id, status: "QUEUED" },
    data: { status: "RUNNING", startedAt: new Date(), heartbeatAt: new Date() },
  });
  return claimed.count === 1 ? candidate.id : null;
}

export async function recoverStaleDesignGenerationJobs(db: DesignJobDb) {
  const cutoff = new Date(Date.now() - DESIGN_JOB_STALE_MS);
  return db.designGenerationJob.updateMany({
    where: {
      status: "RUNNING",
      OR: [{ heartbeatAt: null }, { heartbeatAt: { lt: cutoff } }],
    },
    data: {
      status: "FAILED",
      stage: "FAILED",
      errorSummary: "Prototype generation was interrupted and can be retried.",
    },
  });
}

export async function refreshDesignGenerationJobHeartbeat(
  db: DesignJobDb,
  jobId: string,
) {
  return db.designGenerationJob.updateMany({
    where: { id: jobId, status: "RUNNING" },
    data: { heartbeatAt: new Date() },
  });
}

export type DesignJobHeartbeatTimers = {
  setInterval: (callback: () => void | Promise<void>, delay: number) => unknown;
  clearInterval: (handle: unknown) => void;
};

export function startDesignGenerationJobHeartbeat(
  db: DesignJobDb,
  jobId: string,
  intervalMs = DESIGN_JOB_HEARTBEAT_INTERVAL_MS,
  timers: DesignJobHeartbeatTimers = {
    setInterval: (callback, delay) => globalThis.setInterval(callback, delay),
    clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
  },
) {
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    timers.clearInterval(handle);
  };
  const tick = async () => {
    if (stopped) return;
    try {
      const refreshed = await refreshDesignGenerationJobHeartbeat(db, jobId);
      if (refreshed.count !== 1) stop();
    } catch {
      // Heartbeat loss must not abort an active provider request.
    }
  };
  const handle = timers.setInterval(tick, intervalMs);
  return stop;
}

export { stageLabel };
