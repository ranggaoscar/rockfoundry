import { prisma, type PrismaClient } from "@rockfoundry/db";
import {
  buildDesignSpec,
  deriveScreenMap,
  generateExport,
  renderDraftArtifacts,
  renderArtifacts,
  validateConsistency,
} from "@rockfoundry/core";
import { getLocalProject, parseProjectState } from "./local-project";
import { startPackageJobHeartbeat } from "./package-job-claims";

export const PACKAGE_STAGES = [
  "PREPARING_PRODUCT",
  "GENERATING_DOCUMENTS",
  "BUILDING_SCREEN_MAP",
  "BASELINE_DESIGN_SPEC",
  "FINALIZING_HANDOFF",
  "COMPLETED",
] as const;

export type PackageStage = (typeof PACKAGE_STAGES)[number];
export const PACKAGE_TIMING_KEYS = [
  "documentMs",
  "screenMapMs",
  "baselineDesignSpecMs",
  "handoffMs",
  "totalMs",
] as const;
export type PackageTimings = Record<
  (typeof PACKAGE_TIMING_KEYS)[number],
  number | null
>;
type PackageDatabase = Pick<PrismaClient, "packageJob" | "artifact">;
export type PackageJobRuntime = {
  db?: PackageDatabase;
  getProject?: typeof getLocalProject;
};

function safeStageDescription(stage: string) {
  const labels: Record<string, string> = {
    PREPARING_PRODUCT: "Menyiapkan keputusan produk",
    GENERATING_DOCUMENTS: "Menyusun dokumen",
    BUILDING_SCREEN_MAP: "Merancang layar aplikasi",
    BASELINE_DESIGN_SPEC: "Menyiapkan DesignSpec dasar",
    FINALIZING_HANDOFF: "Menyiapkan handoff",
    COMPLETED: "Paket selesai",
  };
  return labels[stage] || "Menyiapkan paket produk";
}

export function publicPackageJob(job: {
  id: string;
  projectId: string;
  projectVersion: number;
  status: string;
  stage: string;
  completedStages: string;
  progress: string;
  errorSummary: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}) {
  let completedStages: string[] = [];
  let progress: Record<string, unknown> = {};
  try {
    completedStages = JSON.parse(job.completedStages);
  } catch {}
  try {
    progress = JSON.parse(job.progress);
  } catch {}
  return {
    id: job.id,
    projectId: job.projectId,
    projectVersion: job.projectVersion,
    status: job.status,
    stage: job.stage,
    stageLabel: safeStageDescription(job.stage),
    completedStages,
    progress,
    errorSummary: job.errorSummary,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  };
}

export function buildPackageFailureMetadata(
  error: unknown,
  stage: string,
  timings: Record<string, number | null>,
) {
  return {
    stage,
    task: "product_package",
    category:
      error instanceof Error && error.name === "TimeoutError"
        ? "TIMEOUT"
        : "UNKNOWN",
    timings,
  };
}

function emptyPackageTimings(): PackageTimings {
  return {
    documentMs: null,
    screenMapMs: null,
    baselineDesignSpecMs: null,
    handoffMs: null,
    totalMs: null,
  };
}

function packageFailureMessage(error: unknown) {
  if (error instanceof Error && error.message === "PROJECT_VERSION_CONFLICT")
    return "Project berubah saat paket disiapkan. Muat ulang lalu coba lagi.";
  if (error instanceof Error && error.message === "PROJECT_NOT_FOUND")
    return "Project tidak ditemukan.";
  return "Pembuatan paket gagal. Coba lagi.";
}

async function advance(
  db: PackageDatabase,
  jobId: string,
  stage: PackageStage,
  completedStages: string[],
  timings: Record<string, number | null> = {},
) {
  return db.packageJob.update({
    where: { id: jobId },
    data: {
      stage,
      completedStages: JSON.stringify(completedStages),
      progress: JSON.stringify({
        stageLabel: safeStageDescription(stage),
        timings,
      }),
      heartbeatAt: new Date(),
    },
  });
}

export async function runPackageJob(
  jobId: string,
  alreadyClaimed = false,
  runtime: PackageJobRuntime = {},
) {
  const db = runtime.db || prisma;
  const getProject = runtime.getProject || getLocalProject;
  if (!alreadyClaimed) {
    const claimed = await db.packageJob.updateMany({
      where: { id: jobId, status: "QUEUED" },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
        heartbeatAt: new Date(),
      },
    });
    if (claimed.count !== 1) return;
  }
  const job = await db.packageJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  let completed: string[] = [];
  try {
    completed = JSON.parse(job.completedStages);
  } catch {}
  const timings = emptyPackageTimings();
  const totalStarted = Date.now();
  const stopHeartbeat = startPackageJobHeartbeat(db, jobId);
  try {
    const project = await getProject(job.projectId);
    if (!project || project.version !== job.projectVersion)
      throw new Error("PROJECT_VERSION_CONFLICT");
    const state = parseProjectState(project);
    let screenMap = state.studio.screenMap.length
      ? state.studio.screenMap
      : deriveScreenMap(state);
    let baselineDesignSpec = buildDesignSpec(state, screenMap);

    if (!completed.includes("GENERATING_DOCUMENTS")) {
      await advance(db, jobId, "GENERATING_DOCUMENTS", completed, timings);
      const documentStarted = Date.now();
      const documents = renderDraftArtifacts(state);
      timings.documentMs = Date.now() - documentStarted;
      const consistency = validateConsistency(state);
      for (const [type, content] of Object.entries(documents)) {
        await db.artifact.upsert({
          where: {
            projectId_type_version: {
              projectId: job.projectId,
              type,
              version: job.projectVersion,
            },
          },
          create: {
            projectId: job.projectId,
            type,
            status: consistency.status === "BLOCKING" ? "DRAFT" : "READY",
            content,
            version: job.projectVersion,
          },
          update: {
            status: consistency.status === "BLOCKING" ? "DRAFT" : "READY",
            content,
            generatedAt: new Date(),
          },
        });
      }
      completed.push("GENERATING_DOCUMENTS");
    }

    if (!completed.includes("BUILDING_SCREEN_MAP")) {
      await advance(db, jobId, "BUILDING_SCREEN_MAP", completed, timings);
      const screenStarted = Date.now();
      screenMap = state.studio.screenMap.length
        ? state.studio.screenMap
        : deriveScreenMap(state);
      timings.screenMapMs = Date.now() - screenStarted;
      await db.artifact.upsert({
        where: {
          projectId_type_version: {
            projectId: job.projectId,
            type: "PACKAGE_SCREEN_MAP",
            version: job.projectVersion,
          },
        },
        create: {
          projectId: job.projectId,
          type: "PACKAGE_SCREEN_MAP",
          status: "READY",
          content: JSON.stringify(screenMap, null, 2),
          version: job.projectVersion,
        },
        update: {
          status: "READY",
          content: JSON.stringify(screenMap, null, 2),
          generatedAt: new Date(),
        },
      });
      completed.push("BUILDING_SCREEN_MAP");
    }

    if (!completed.includes("BASELINE_DESIGN_SPEC")) {
      await advance(db, jobId, "BASELINE_DESIGN_SPEC", completed, timings);
      const baselineStarted = Date.now();
      baselineDesignSpec = buildDesignSpec(state, screenMap);
      timings.baselineDesignSpecMs = Date.now() - baselineStarted;
      await db.artifact.upsert({
        where: {
          projectId_type_version: {
            projectId: job.projectId,
            type: "PACKAGE_DESIGN_SPEC",
            version: job.projectVersion,
          },
        },
        create: {
          projectId: job.projectId,
          type: "PACKAGE_DESIGN_SPEC",
          status: "READY",
          content: JSON.stringify(baselineDesignSpec, null, 2),
          version: job.projectVersion,
        },
        update: {
          status: "READY",
          content: JSON.stringify(baselineDesignSpec, null, 2),
          generatedAt: new Date(),
        },
      });
      await db.artifact.upsert({
        where: {
          projectId_type_version: {
            projectId: job.projectId,
            type: "PACKAGE_DESIGN_DECISIONS",
            version: job.projectVersion,
          },
        },
        create: {
          projectId: job.projectId,
          type: "PACKAGE_DESIGN_DECISIONS",
          status: "READY",
          content:
            "Baseline DesignSpec derived from Product Truth and Screen Map. Prototype generation is optional.",
          version: job.projectVersion,
        },
        update: {
          status: "READY",
          content:
            "Baseline DesignSpec derived from Product Truth and Screen Map. Prototype generation is optional.",
          generatedAt: new Date(),
        },
      });
      completed.push("BASELINE_DESIGN_SPEC");
    }

    if (!completed.includes("FINALIZING_HANDOFF")) {
      const handoffStarted = Date.now();
      await advance(db, jobId, "FINALIZING_HANDOFF", completed, timings);
      const handoffDocuments = renderArtifacts(state);
      const consistency = validateConsistency(state);
      for (const [type, content] of Object.entries(handoffDocuments)) {
        await db.artifact.upsert({
          where: {
            projectId_type_version: {
              projectId: job.projectId,
              type,
              version: job.projectVersion,
            },
          },
          create: {
            projectId: job.projectId,
            type,
            status: consistency.status === "BLOCKING" ? "DRAFT" : "READY",
            content,
            version: job.projectVersion,
          },
          update: {
            status: consistency.status === "BLOCKING" ? "DRAFT" : "READY",
            content,
            generatedAt: new Date(),
          },
        });
      }
      await generateExport(state);
      timings.handoffMs = Date.now() - handoffStarted;
      completed.push("FINALIZING_HANDOFF");
    }

    timings.totalMs = Date.now() - totalStarted;
    await db.packageJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        stage: "COMPLETED",
        completedStages: JSON.stringify([...completed, "COMPLETED"]),
        progress: JSON.stringify({
          stageLabel: safeStageDescription("COMPLETED"),
          timings,
        }),
        completedAt: new Date(),
        heartbeatAt: new Date(),
      },
    });
  } catch (error) {
    const failure = buildPackageFailureMetadata(error, job.stage, timings);
    await db.packageJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        errorSummary: packageFailureMessage(error),
        progress: JSON.stringify({
          stageLabel: safeStageDescription(failure.stage),
          timings,
          failure,
        }),
        completedStages: JSON.stringify(completed),
        heartbeatAt: new Date(),
      },
    });
  } finally {
    stopHeartbeat();
  }
}

export async function latestPackageJob(
  projectId: string,
  db: PackageDatabase = prisma,
  projectVersion?: number,
) {
  const job = await db.packageJob.findFirst({
    where: {
      projectId,
      ...(projectVersion === undefined ? {} : { projectVersion }),
    },
    orderBy: { createdAt: "desc" },
  });
  return job ? publicPackageJob(job) : null;
}

export function isStaleRunningJob(job: {
  status: string;
  heartbeatAt: Date | null;
}) {
  return (
    job.status === "RUNNING" &&
    (!job.heartbeatAt || Date.now() - job.heartbeatAt.getTime() > 120_000)
  );
}

export { safeStageDescription };
