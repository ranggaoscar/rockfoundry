import {
  InlineQueueProvider,
  type JobType,
  type QueueProvider,
} from "@rockfoundry/core";

type JobHandler<TResult> = () => Promise<TResult>;
const queue: QueueProvider = new InlineQueueProvider();
const completed = new Map<string, unknown>();

export async function runJob<TResult>(
  _type: JobType,
  idempotencyKey: string,
  _payload: unknown,
  handler: JobHandler<TResult>,
): Promise<{ result: TResult; duplicate: boolean }> {
  if (completed.has(idempotencyKey))
    return {
      result: completed.get(idempotencyKey) as TResult,
      duplicate: true,
    };
  let result!: TResult;
  await queue.enqueue(
    { id: idempotencyKey, type: _type, payload: _payload, idempotencyKey },
    async () => {
      result = await handler();
    },
  );
  completed.set(idempotencyKey, result);
  return { result, duplicate: false };
}

export async function recoverStaleRunningJobs() {
  return { count: 0 };
}
