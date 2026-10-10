import { z } from "zod";
import { HermesExecutor } from "./hermes-executor";

export type ExecutionInput = {
  taskId: string;
  title: string;
  description: string | null;
  acceptanceCriteria: string;
  createdAt: string;
  executorBinding?: string;
};
export type ExecutionResult = {
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  output?: string;
  error?: string;
  evidence?: Array<{
    key: string;
    kind: string;
    title: string;
    content: string;
    uri?: string;
  }>;
};
export interface ExecutorAdapter {
  id: string;
  label: string;
  /** Safe repeat submission must reuse the same key, never create a second job. */
  idempotentSubmit: boolean;
  retryWindowMs?: number;
  bindingId?: string;
  availability(): { available: boolean; reason?: string };
  submit(
    input: ExecutionInput,
    idempotencyKey: string,
  ): Promise<{ externalId: string }>;
  read(externalId: string, input: ExecutionInput): Promise<ExecutionResult>;
}

export const ExecutionInputSchema = z.object({
  taskId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  acceptanceCriteria: z.string(),
  createdAt: z.iso.datetime(),
  executorBinding: z.string().optional(),
});

export class MockExecutor implements ExecutorAdapter {
  id = "mock";
  label = "Offline Mock · development only";
  idempotentSubmit = true;
  availability() {
    return { available: true };
  }
  async submit(_input: ExecutionInput, key: string) {
    return { externalId: `mock:${key}` };
  }
  async read(
    _externalId: string,
    input: ExecutionInput,
  ): Promise<ExecutionResult> {
    if (Date.now() - Date.parse(input.createdAt) < 800)
      return { status: "RUNNING" };
    return {
      status: "COMPLETED",
      output: `MOCK EXECUTION — no real work or external action was performed.\n\nTask: ${input.title}\n\nRequested acceptance criteria:\n${input.acceptanceCriteria}\n\nThis deterministic result verifies submission, persistence, evidence, and human review. Review the actual deliverable before accepting a real executor result.`,
      evidence: [
        {
          key: "mock-receipt",
          kind: "MOCK_RECEIPT",
          title: "Development execution receipt",
          content: `Task ${input.taskId}. Deterministic, network-free mock; not evidence of actual task delivery.`,
        },
      ],
    };
  }
}

export { HermesExecutor } from "./hermes-executor";

export function executorAdapters(): ExecutorAdapter[] {
  return [new MockExecutor(), new HermesExecutor()];
}
