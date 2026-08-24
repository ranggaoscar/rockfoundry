import { z } from "zod";

export const DESIGN_FAILURE_CATEGORIES = [
  "TIMEOUT",
  "PROVIDER_4XX",
  "PROVIDER_5XX",
  "JSON_PARSE",
  "SCHEMA_VALIDATION",
  "EMPTY_RESPONSE",
  "UNKNOWN",
] as const;

export type DesignFailureCategory = (typeof DESIGN_FAILURE_CATEGORIES)[number];

export type DesignFailureTask =
  | "design_architecture"
  | "prototype_generation"
  | "quality_review"
  | "prototype_repair"
  | "prototype_validation"
  | (string & {});

export type SafeSchemaIssue = {
  path: string;
  code: string;
};

export type SafeDesignFailure = {
  task: DesignFailureTask;
  category: DesignFailureCategory;
  statusCode?: number;
  timeoutMs?: number;
  schemaIssues?: SafeSchemaIssue[];
  attempt?: number;
  maxAttempts?: number;
  retryInMs?: number;
};

export type DesignFailureContext = {
  task: DesignFailureTask;
  attempt?: number;
  maxAttempts?: number;
  retryInMs?: number;
};

type FailureLike = {
  name?: unknown;
  message?: unknown;
  statusCode?: unknown;
  timeoutMs?: unknown;
};

function failureLike(error: unknown): FailureLike {
  return error && typeof error === "object"
    ? (error as FailureLike)
    : {};
}

function positiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function timeoutFromMessage(message: string) {
  const match = message.match(/timed out(?: after)?\s+(\d+)\s*ms/i);
  return match ? Number(match[1]) : undefined;
}

function statusFromError(error: unknown) {
  const statusCode = failureLike(error).statusCode;
  return typeof statusCode === "number" && Number.isInteger(statusCode)
    ? statusCode
    : undefined;
}

function isSchemaError(error: unknown): error is z.ZodError {
  return error instanceof z.ZodError;
}

function isTimeout(error: unknown) {
  const candidate = failureLike(error);
  const message = typeof candidate.message === "string" ? candidate.message : "";
  return (
    candidate.name === "AbortError" ||
    candidate.name === "TimeoutError" ||
    /timed out|timeout|aborted/i.test(message)
  );
}

function schemaIssues(error: z.ZodError): SafeSchemaIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
  }));
}

function canonicalTask(task: DesignFailureTask): DesignFailureTask {
  return task === "design_quality_review" ? "quality_review" : task;
}

export function classifyDesignFailure(
  error: unknown,
  context: DesignFailureContext,
): SafeDesignFailure {
  const candidate = failureLike(error);
  const message = typeof candidate.message === "string" ? candidate.message : "";
  const statusCode = statusFromError(error);
  const timeoutMs =
    positiveNumber(candidate.timeoutMs) || timeoutFromMessage(message);
  const base: SafeDesignFailure = {
    task: canonicalTask(context.task),
    category: "UNKNOWN",
    ...(statusCode === undefined ? {} : { statusCode }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(context.attempt === undefined ? {} : { attempt: context.attempt }),
    ...(context.maxAttempts === undefined
      ? {}
      : { maxAttempts: context.maxAttempts }),
    ...(context.retryInMs === undefined ? {} : { retryInMs: context.retryInMs }),
  };

  if (statusCode !== undefined && statusCode >= 400 && statusCode < 500)
    return { ...base, category: "PROVIDER_4XX" };
  if (statusCode !== undefined && statusCode >= 500)
    return { ...base, category: "PROVIDER_5XX" };
  if (isTimeout(error)) return { ...base, category: "TIMEOUT" };
  if (isSchemaError(error))
    return { ...base, category: "SCHEMA_VALIDATION", schemaIssues: schemaIssues(error) };
  if (/parse\s+JSON|JSON\s+parse|invalid\s+JSON|unexpected token/i.test(message))
    return { ...base, category: "JSON_PARSE" };
  if (/no content|empty response|empty provider/i.test(message))
    return { ...base, category: "EMPTY_RESPONSE" };
  return base;
}

export function formatDesignFailureDiagnostics(failure: SafeDesignFailure) {
  const parts = [`task=${failure.task}`];
  if (failure.attempt !== undefined && failure.maxAttempts !== undefined)
    parts.push(`attempt=${failure.attempt}/${failure.maxAttempts}`);
  parts.push(`category=${failure.category}`);
  if (failure.statusCode !== undefined) parts.push(`status=${failure.statusCode}`);
  if (failure.timeoutMs !== undefined) parts.push(`timeoutMs=${failure.timeoutMs}`);
  if (failure.schemaIssues?.length)
    parts.push(
      `schemaIssues=${failure.schemaIssues.map((issue) => `${issue.path || "<root>"}:${issue.code}`).join("|")}`,
    );
  if (failure.retryInMs !== undefined) parts.push(`retryInMs=${failure.retryInMs}`);
  return parts.join(" ");
}

export function toPackageFailureMetadata(
  failure: SafeDesignFailure,
  fallbackStage: string,
) {
  const stage =
    failure.task === "design_architecture"
      ? "DESIGN_ARCHITECTURE"
      : failure.task === "prototype_generation" ||
          failure.task === "prototype_validation" ||
          failure.task === "prototype_repair"
        ? "PROTOTYPE_GENERATION"
        : failure.task === "quality_review"
          ? "QUALITY_REVIEW"
          : fallbackStage;
  return {
    stage,
    task: failure.task,
    category: failure.category,
    ...(failure.statusCode === undefined ? {} : { statusCode: failure.statusCode }),
    ...(failure.timeoutMs === undefined ? {} : { timeoutMs: failure.timeoutMs }),
    ...(failure.schemaIssues?.length ? { schemaIssues: failure.schemaIssues } : {}),
  };
}

export function safeDesignFailureMessage(failure: SafeDesignFailure) {
  if (failure.task === "design_architecture")
    return "Agent tidak berhasil menyusun arah desain. Coba lagi nanti.";
  if (failure.task === "prototype_generation")
    return "Agent tidak berhasil membuat prototype. Coba lagi nanti.";
  if (failure.task === "quality_review")
    return "Agent tidak berhasil memeriksa kualitas tampilan. Coba lagi nanti.";
  if (failure.task === "prototype_repair")
    return "Agent tidak berhasil memperbaiki prototype. Coba lagi nanti.";
  if (failure.task === "prototype_validation")
    return "Prototype belum memenuhi pemeriksaan keamanan. Coba lagi.";
  return "Pembuatan paket produk gagal. Coba lagi nanti.";
}
