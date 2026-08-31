import { prisma } from "@rockfoundry/db";
import { getLocalProject, parseProjectState } from "./local-project";
import {
  claimNextDesignGenerationJob,
  recoverStaleDesignGenerationJobs,
  stageLabel,
  startDesignGenerationJobHeartbeat,
  type DesignJobStage,
} from "./design-job-claims";
import { latestDraftArtifacts } from "./artifact-composer";

let started = false;
let interval: ReturnType<typeof setInterval> | undefined;
type DesignModule = typeof import("./design");

function advanceDesignJob(jobId: string, stage: DesignJobStage, timings: Record<string, number | null> = {}) {
  return prisma.designGenerationJob.update({
    where: { id: jobId },
    data: {
      stage,
      progress: JSON.stringify({ stageLabel: stageLabel(stage), timings }),
      heartbeatAt: new Date(),
    },
  });
}

export async function runDesignGenerationJob(jobId: string, alreadyClaimed = false) {
  if (!alreadyClaimed) {
    const claimed = await prisma.designGenerationJob.updateMany({
      where: { id: jobId, status: "QUEUED" },
      data: { status: "RUNNING", startedAt: new Date(), heartbeatAt: new Date() },
    });
    if (claimed.count !== 1) return;
  }
  const job = await prisma.designGenerationJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  const stopHeartbeat = startDesignGenerationJobHeartbeat(prisma, jobId);
  let designModule: DesignModule | undefined;
  try {
    designModule = await import("./design");
    const project = await getLocalProject(job.projectId);
    if (!project || project.version !== job.projectVersion)
      throw new Error("PROJECT_VERSION_CONFLICT");
    const state = parseProjectState(project);
    const draft = await latestDraftArtifacts(job.projectId, job.projectVersion);
    const persistedDraft = draft
      ? Object.fromEntries(
          draft.artifacts.map((artifact) => [artifact.type, artifact.content]),
        )
      : undefined;
    const result = await designModule.generateProjectDesign(
      job.projectId,
      state,
      job.projectVersion,
      undefined,
      {
        onStage: async (stage) => {
          await advanceDesignJob(jobId, stage, {
            designArchitectureAiMs: null,
            prototypeMs: null,
            qualityReviewMs: null,
            repairMs: null,
            totalMs: null,
          });
        },
        persistedDraft,
      },
    );
    await prisma.designGenerationJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        stage: "COMPLETED",
        progress: JSON.stringify({
          stageLabel: stageLabel("COMPLETED"),
          timings: result.timings,
        }),
        completedAt: new Date(),
        heartbeatAt: new Date(),
      },
    });
  } catch (error) {
    const diagnostics = designModule?.logDesignGenerationFailure(error);
    await prisma.designGenerationJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        stage: "FAILED",
        errorSummary:
          error instanceof Error && error.message === "PACKAGE_NOT_READY"
            ? "Selesaikan Product Package sebelum membuat prototype."
            : error instanceof Error && error.message === "PROJECT_VERSION_CONFLICT"
              ? "Project berubah sebelum prototype selesai disiapkan. Muat ulang lalu coba lagi."
              : designModule?.designGenerationUserMessage(error) || "Prototype belum berhasil dibuat. Coba lagi.",
        progress: JSON.stringify({
          stageLabel: stageLabel("FAILED"),
          failure: diagnostics,
        }),
        completedAt: new Date(),
        heartbeatAt: new Date(),
      },
    });
  } finally {
    stopHeartbeat();
  }
}

export async function runDesignGenerationWorkerOnce() {
  await recoverStaleDesignGenerationJobs(prisma);
  const jobId = await claimNextDesignGenerationJob(prisma);
  if (!jobId) return false;
  await runDesignGenerationJob(jobId, true);
  return true;
}

export function startDesignWorker() {
  if (started) return;
  started = true;
  const tick = () => { void runDesignGenerationWorkerOnce().catch(() => undefined); };
  interval = setInterval(tick, 1000);
  interval.unref();
}

export function resetDesignWorkerForTests() {
  if (interval) clearInterval(interval);
  interval = undefined;
  started = false;
}

export function isDesignWorkerStartedForTests() {
  return started;
}
