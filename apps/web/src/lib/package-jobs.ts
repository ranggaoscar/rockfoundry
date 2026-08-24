import { prisma } from "@rockfoundry/db";
import { generateExport, validateConsistency } from "@rockfoundry/core";
import { toPackageFailureMetadata } from "@rockfoundry/ai";
import {
  designGenerationUserMessage,
  generateProjectDesign,
  logDesignGenerationFailure,
} from "./design";
import { getLocalProject, parseProjectState, saveProjectState } from "./local-project";
import { startPackageJobHeartbeat } from "./package-job-claims";

export const PACKAGE_STAGES = [
  "PREPARING_PRODUCT",
  "GENERATING_DOCUMENTS",
  "BUILDING_SCREEN_MAP",
  "DESIGN_ARCHITECTURE",
  "PROTOTYPE_GENERATION",
  "QUALITY_REVIEW",
  "FINALIZING_HANDOFF",
  "COMPLETED",
] as const;

export type PackageStage = (typeof PACKAGE_STAGES)[number];


function safeStageDescription(stage: string) {
  const labels: Record<string, string> = {
    PREPARING_PRODUCT: "Menyiapkan keputusan produk",
    GENERATING_DOCUMENTS: "Menyusun dokumen",
    BUILDING_SCREEN_MAP: "Merancang layar aplikasi",
    DESIGN_ARCHITECTURE: "Menyusun arah desain",
    PROTOTYPE_GENERATION: "Membuat prototype",
    QUALITY_REVIEW: "Memeriksa kualitas tampilan",
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
  try { completedStages = JSON.parse(job.completedStages); } catch {}
  try { progress = JSON.parse(job.progress); } catch {}
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
  const diagnostics = logDesignGenerationFailure(error);
  return {
    ...toPackageFailureMetadata(diagnostics, stage),
    timings,
  };
}

async function advance(jobId: string, stage: PackageStage, completedStages: string[], timings: Record<string, number | null> = {}) {
  return prisma.packageJob.update({
    where: { id: jobId },
    data: {
      stage,
      completedStages: JSON.stringify(completedStages),
      progress: JSON.stringify({ stageLabel: safeStageDescription(stage), timings }),
      heartbeatAt: new Date(),
    },
  });
}

export async function runPackageJob(jobId: string, alreadyClaimed = false) {
  if (!alreadyClaimed) {
    const claimed = await prisma.packageJob.updateMany({
      where: { id: jobId, status: "QUEUED" },
      data: { status: "RUNNING", startedAt: new Date(), heartbeatAt: new Date() },
    });
    if (claimed.count !== 1) return;
  }
  const job = await prisma.packageJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  const completed: string[] = [];
  const timings: Record<string, number | null> = {
    documentMs: null, screenArchitectureMs: null, designArchitectureMs: null,
    prototypeMs: null, qualityReviewMs: null, repairMs: null, totalMs: null,
  };
  const totalStarted = Date.now();
  const stopHeartbeat = startPackageJobHeartbeat(prisma, jobId);
  try {
    const project = await getLocalProject(job.projectId);
    if (!project || project.version !== job.projectVersion) throw new Error("Project changed after package was queued.");
    let state = parseProjectState(project);
    await advance(jobId, "GENERATING_DOCUMENTS", completed);
    const documentStarted = Date.now();
    const generated = await generateExport(state);
    timings.documentMs = Date.now() - documentStarted;
    const consistency = validateConsistency(state);
    for (const [type, content] of Object.entries(generated.documents)) {
      await prisma.artifact.upsert({
        where: { projectId_type_version: { projectId: job.projectId, type, version: job.projectVersion } },
        create: { projectId: job.projectId, type, status: consistency.status === "BLOCKING" ? "DRAFT" : "READY", content, version: job.projectVersion },
        update: { status: consistency.status === "BLOCKING" ? "DRAFT" : "READY", content, generatedAt: new Date() },
      });
    }
    completed.push("GENERATING_DOCUMENTS");
    const screenStarted = Date.now();
    await advance(jobId, "BUILDING_SCREEN_MAP", completed, timings);
    timings.screenArchitectureMs = Date.now() - screenStarted;
    completed.push("BUILDING_SCREEN_MAP");
    const designStarted = Date.now();
    await advance(jobId, "DESIGN_ARCHITECTURE", completed, timings);
    completed.push("DESIGN_ARCHITECTURE");
    timings.designArchitectureMs = Date.now() - designStarted;
    const prototypeStarted = Date.now();
    await advance(jobId, "PROTOTYPE_GENERATION", completed, timings);
    const design = await generateProjectDesign(job.projectId, state, job.projectVersion);
    state = design.state;
    timings.prototypeMs = Date.now() - prototypeStarted;
    completed.push("PROTOTYPE_GENERATION");
    const reviewStarted = Date.now();
    await advance(jobId, "QUALITY_REVIEW", completed, timings);
    timings.qualityReviewMs = Date.now() - reviewStarted;
    completed.push("QUALITY_REVIEW");
    await advance(jobId, "FINALIZING_HANDOFF", completed, timings);
    await saveProjectState(job.projectId, state, design.version);
    completed.push("FINALIZING_HANDOFF");
    timings.totalMs = Date.now() - totalStarted;
    await prisma.packageJob.update({ where: { id: jobId }, data: { status: "COMPLETED", stage: "COMPLETED", completedStages: JSON.stringify([...completed, "COMPLETED"]), progress: JSON.stringify({ stageLabel: safeStageDescription("COMPLETED"), timings }), completedAt: new Date(), heartbeatAt: new Date() } });
  } catch (error) {
    const failure = buildPackageFailureMetadata(error, job.stage, timings);
    await prisma.packageJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        errorSummary: designGenerationUserMessage(error),
        progress: JSON.stringify({ stageLabel: safeStageDescription(failure.stage), timings, failure }),
        completedStages: JSON.stringify(completed),
        heartbeatAt: new Date(),
      },
    });
  } finally {
    stopHeartbeat();
  }
}

export async function latestPackageJob(projectId: string) {
  const job = await prisma.packageJob.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } });
  return job ? publicPackageJob(job) : null;
}

export function isStaleRunningJob(job: { status: string; heartbeatAt: Date | null }) {
  return job.status === "RUNNING" && (!job.heartbeatAt || Date.now() - job.heartbeatAt.getTime() > 120_000);
}

export { safeStageDescription };
