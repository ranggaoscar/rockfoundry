import { createHash } from "node:crypto";
import { z } from "zod";
import { ExecutorError } from "./executor-error";
import type {
  ExecutionInput,
  ExecutionResult,
  ExecutorAdapter,
} from "./executor-adapter";

const Capabilities = z.object({
  platform: z.literal("hermes-agent"),
  auth: z.object({ type: z.literal("bearer"), required: z.literal(true) }),
  features: z.object({
    run_submission: z.literal(true),
    run_status: z.literal(true),
    runs_idempotency: z.object({
      supported: z.literal(true),
      durable: z.literal(true),
      retention_seconds: z.number().min(86400),
    }),
  }),
});
const Run = z.object({
  run_id: z.string().min(1).max(500),
  status: z.enum([
    "started",
    "queued",
    "running",
    "waiting_for_approval",
    "stopping",
    "completed",
    "failed",
    "cancelled",
    "interrupted",
  ]),
  output: z.string().max(200000).optional(),
  session_id: z.string().max(500).nullish(),
  runtime: z
    .object({
      provider: z.string().max(200).optional(),
      model: z.string().max(500).optional(),
    })
    .optional(),
});
export function resolveHermesEnvironment(
  env: Record<string, string | undefined> = process.env,
) {
  return {
    enabled: env.HERMES_EXECUTOR_ENABLED === "true",
    baseUrl: env.HERMES_RUNS_BASE_URL || env.HERMES_EXECUTOR_BASE_URL,
    key: env.HERMES_API_KEY || env.HERMES_EXECUTOR_API_KEY,
    model: env.HERMES_MODEL || undefined,
    privateHttpOrigin: env.HERMES_EXECUTOR_PRIVATE_HTTP_ORIGIN,
  };
}
type Options = {
  enabled?: boolean;
  baseUrl?: string;
  key?: string;
  model?: string;
  privateHttpOrigin?: string;
  fetch?: typeof fetch;
};

/** Official Hermes Runs API. Server-only config, fail closed, no gateway/core changes. */
export class HermesExecutor implements ExecutorAdapter {
  id = "hermes";
  label = "Hermes Agent";
  idempotentSubmit = true;
  retryWindowMs = 23 * 60 * 60 * 1000; // conservative margin within documented 24h retention
  bindingId?: string;
  private url?: string;
  private key?: string;
  private model?: string;
  private fetcher: typeof fetch;
  constructor(options: Options = resolveHermesEnvironment()) {
    this.fetcher = options.fetch || fetch;
    if (!options.enabled || !options.baseUrl || !options.key) return;
    try {
      const url = new URL(options.baseUrl);
      const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(
        url.hostname,
      );
      const octets = url.hostname.split(".").map(Number);
      const privateV4 =
        octets.length === 4 &&
        octets.every(
          (part) => Number.isInteger(part) && part >= 0 && part <= 255,
        ) &&
        (octets[0] === 10 ||
          (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
          (octets[0] === 192 && octets[1] === 168));
      const pinnedPrivateHttp =
        privateV4 && options.privateHttpOrigin === url.origin;
      if (
        options.model &&
        (options.model.length > 200 || /[\r\n]/.test(options.model))
      )
        return;
      if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        (url.protocol !== "https:" &&
          !(url.protocol === "http:" && (loopback || pinnedPrivateHttp)))
      )
        return;
      this.url = url.toString().replace(/\/$/, "");
      this.key = options.key;
      this.model = options.model;
      // Idempotency scope changes with endpoint/profile/key. Bind before submission.
      this.bindingId = createHash("sha256")
        .update(
          this.url + "\0" + this.key + (this.model ? "\0" + this.model : ""),
        )
        .digest("hex");
    } catch {
      /* configuration is unavailable; never expose its values */
    }
  }
  availability() {
    return this.url && this.key
      ? {
          available: true,
          reason:
            "Configured; authenticated Runs API capabilities are checked before submission.",
        }
      : {
          available: false,
          reason:
            "Hermes execution endpoint/authentication is not provisioned or enabled. See docs/RF-001-WORK-OS.md; Mock remains explicit, never an automatic fallback.",
        };
  }
  private async request(endpoint: string, init: RequestInit = {}) {
    if (!this.url || !this.key) throw new Error("HERMES_UNAVAILABLE");
    const response = await this.fetcher(this.url + endpoint, {
      ...init,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    if (
      !response.ok ||
      Number(response.headers.get("content-length") || 0) > 1000000
    )
      throw new ExecutorError(
        "HERMES_HTTP_FAILED",
        response.status === 401 || response.status === 403
          ? "Hermes authentication denied. Verify the server-side credential binding."
          : response.status === 404
            ? "Hermes run or endpoint is unavailable/expired. Reconcile the existing run; do not submit another."
            : response.status === 409
              ? "Hermes submission identity conflicts. Reconcile the immutable request; do not create a new run."
              : response.status === 429
                ? "Hermes capacity limit reached. Retry the same persisted run safely."
                : "Hermes request failed. Retry/reconcile the same persisted run safely.",
      );
    const reader = response.body?.getReader();
    if (!reader) throw new Error("HERMES_RESPONSE_MISSING");
    let text = "";
    let size = 0;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 1000000) {
          await reader.cancel();
          throw new Error("HERMES_RESPONSE_TOO_LARGE");
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    return JSON.parse(text) as unknown;
  }
  async discover() {
    const health = z
      .object({ status: z.literal("ok") })
      .parse(await this.request("/health"));
    const capabilities = Capabilities.parse(
      await this.request("/v1/capabilities"),
    );
    return { health, capabilities };
  }
  async submit(input: ExecutionInput, identity: string) {
    if (input.executorBinding !== this.bindingId)
      throw new Error("HERMES_BINDING_CHANGED");
    // Never replay an ambiguous POST past the server retention horizon.
    if (Date.now() - Date.parse(input.createdAt) >= this.retryWindowMs)
      throw new Error("HERMES_RETRY_WINDOW_EXPIRED");
    await this.discover();
    const result = z.object({ run_id: z.string().min(1).max(500) }).parse(
      await this.request("/v1/runs", {
        method: "POST",
        headers: { "Idempotency-Key": identity },
        body: JSON.stringify({
          ...(this.model ? { model: this.model } : {}),
          input: JSON.stringify({
            taskId: input.taskId,
            title: input.title,
            description: input.description,
            acceptanceCriteria: input.acceptanceCriteria,
          }),
          instructions:
            "Execute only the requested task within the configured profile's allowed tools. Do not send external messages, make purchases, deploy, delete data, or perform consequential actions without explicit human authorization. Return a reviewable deliverable with evidence. RockFoundry owns task acceptance; do not claim the task is accepted.",
        }),
      }),
    );
    return { externalId: result.run_id };
  }
  async read(
    externalId: string,
    input: ExecutionInput,
  ): Promise<ExecutionResult> {
    if (input.executorBinding !== this.bindingId)
      throw new Error("HERMES_BINDING_CHANGED");
    const result = Run.parse(
      await this.request(`/v1/runs/${encodeURIComponent(externalId)}`),
    );
    if (result.run_id !== externalId) throw new Error("HERMES_RUN_ID_MISMATCH");
    if (["failed", "cancelled", "interrupted"].includes(result.status))
      return {
        status: "FAILED",
        error: `Hermes execution ended ${result.status}. The existing external run is retained; no replacement was submitted.`,
      };
    if (result.status !== "completed")
      return {
        status: "RUNNING",
        ...(result.status === "waiting_for_approval"
          ? {
              error:
                "Hermes is waiting for tool approval. Resolve it in Hermes; RockFoundry does not auto-approve consequential actions.",
            }
          : {}),
      };
    if (!result.output?.trim()) throw new Error("HERMES_OUTPUT_MISSING");
    // Final response is evidence of the execution receipt, not independent artifact validation.
    return {
      status: "COMPLETED",
      output: result.output,
      evidence: [
        {
          key: "hermes-receipt",
          kind: "EXECUTION_RECEIPT",
          title: "Hermes run receipt",
          content: JSON.stringify({
            run_id: result.run_id,
            status: result.status,
            session_id: result.session_id || null,
            ...(result.runtime ? { runtime: result.runtime } : {}),
          }),
          uri: this.url + `/v1/runs/${encodeURIComponent(externalId)}`,
        },
      ],
    };
  }
}
