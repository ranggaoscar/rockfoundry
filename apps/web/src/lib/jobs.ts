import { prisma } from "@rockfoundry/db";
import { InlineQueueProvider, type JobType, type QueueProvider } from "@rockfoundry/core";

type JobHandler<TResult> = () => Promise<TResult>;

const queue: QueueProvider = new InlineQueueProvider();

/**
 * Persists lifecycle state before dispatching. The unique idempotency key makes
 * duplicate requests return the original completed result rather than reapply it.
 */
export async function runJob<TResult>(
  type: JobType,
  idempotencyKey: string,
  payload: unknown,
  handler: JobHandler<TResult>,
): Promise<{ result: TResult; duplicate: boolean }> {
  const existing = await prisma.backgroundJob.findUnique({ where: { idempotencyKey } });
  if (existing?.status === "completed") {
    return { result: existing.result as TResult, duplicate: true };
  }

  const job = existing ?? await prisma.backgroundJob.create({
    data: { type, idempotencyKey, payload: payload as never },
  });

  let result!: TResult;
  await queue.enqueue({ id: job.id, type, payload, idempotencyKey }, async () => {
    const claimed = await prisma.backgroundJob.updateMany({
      where: { id: job.id, status: { in: ["queued", "failed"] } },
      data: {
        status: "running",
        startedAt: new Date(),
        progress: 10,
        failureReason: null,
        retryCount: { increment: existing?.status === "failed" ? 1 : 0 },
      },
    });

    if (!claimed.count) {
      const completed = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } });
      if (completed.status === "completed") {
        result = completed.result as TResult;
        return;
      }
      throw new Error("Job is already running");
    }

    try {
      // The handler must finish all validation before writing canonical state.
      result = await handler();
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: { status: "completed", result: result as never, progress: 100, completedAt: new Date() },
      });
    } catch (error) {
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          failureReason: error instanceof Error ? error.message : "Unknown job failure",
        },
      });
      throw error;
    }
  });

  return { result, duplicate: false };
}

export async function recoverStaleRunningJobs(staleAfterMs = 10 * 60 * 1000) {
  const staleBefore = new Date(Date.now() - staleAfterMs);
  return prisma.backgroundJob.updateMany({
    where: { status: "running", updatedAt: { lt: staleBefore } },
    data: { status: "queued", failureReason: "Recovered stale running job" },
  });
}
