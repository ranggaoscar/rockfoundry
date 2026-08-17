export const JOB_TYPES = [
  "initial_idea_extraction",
  "website_reference_analysis",
  "github_reference_analysis",
  "document_generation",
  "consistency_validation",
  "zip_generation",
  "expired_export_cleanup",
] as const;

export type JobType = (typeof JOB_TYPES)[number];
export type JobStatus = "queued" | "running" | "completed" | "failed";

export interface QueueJob<TPayload = unknown> {
  id: string;
  type: JobType;
  payload: TPayload;
  idempotencyKey: string;
}

export interface QueueProvider {
  enqueue<TPayload>(
    job: QueueJob<TPayload>,
    execute: () => Promise<void>,
  ): Promise<void>;
}

/** Runs jobs in-process for local development and test environments. */
export class InlineQueueProvider implements QueueProvider {
  async enqueue<TPayload>(
    _job: QueueJob<TPayload>,
    execute: () => Promise<void>,
  ) {
    await execute();
  }
}

/**
 * Boundary for hosted queues. Deployment code supplies the provider; local mode
 * intentionally uses InlineQueueProvider and needs no hosted queue credentials.
 */
export class HostedQueueProvider implements QueueProvider {
  async enqueue<TPayload>(
    _job: QueueJob<TPayload>,
    _execute: () => Promise<void>,
  ) {
    throw new Error("A hosted queue provider has not been configured");
  }
}

export function isStaleRunningJob(
  updatedAt: Date,
  now = new Date(),
  staleAfterMs = 10 * 60 * 1000,
) {
  return now.getTime() - updatedAt.getTime() >= staleAfterMs;
}
