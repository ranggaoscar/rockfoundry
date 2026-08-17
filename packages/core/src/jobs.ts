export const JOB_TYPES = [
  "initial_idea_extraction",
  "website_reference_analysis",
  "github_reference_analysis",
  "document_generation",
  "consistency_validation",
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

/** Agentic V1 executes local work inline; no hosted queue is required. */
export class InlineQueueProvider implements QueueProvider {
  async enqueue<TPayload>(
    _job: QueueJob<TPayload>,
    execute: () => Promise<void>,
  ) {
    await execute();
  }
}

export function isStaleRunningJob(
  updatedAt: Date,
  now = new Date(),
  staleAfterMs = 10 * 60 * 1000,
) {
  return now.getTime() - updatedAt.getTime() >= staleAfterMs;
}
