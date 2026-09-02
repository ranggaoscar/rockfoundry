export type WebMcpPrepareHandoffResult = {
  status: "queued" | "already_running" | "ready" | "failed";
  jobId: string | null;
  jobStatus: string | null;
  stage: string | null;
  message: string;
};

type PackageJob = {
  id?: unknown;
  status?: unknown;
  stage?: unknown;
  errorSummary?: unknown;
};

function asPackageJob(value: unknown): PackageJob {
  return value && typeof value === "object" ? (value as PackageJob) : {};
}

function result(
  status: WebMcpPrepareHandoffResult["status"],
  job: PackageJob,
  message: string,
): WebMcpPrepareHandoffResult {
  return {
    status,
    jobId: typeof job.id === "string" ? job.id : null,
    jobStatus: typeof job.status === "string" ? job.status : null,
    stage: typeof job.stage === "string" ? job.stage : null,
    message,
  };
}

export async function prepareHandoffThroughWebMcp({
  projectId,
  signal,
  fetchImpl = fetch,
}: {
  projectId: string;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<WebMcpPrepareHandoffResult> {
  try {
    const response = await fetchImpl(`/api/projects/${projectId}/package`, {
      method: "POST",
      signal,
    });
    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const job = asPackageJob(payload.job);
    if (!response.ok)
      return result(
        "failed",
        job,
        typeof payload.error === "string"
          ? payload.error
          : "RockFoundry could not start the final handoff.",
      );
    if (job.status === "COMPLETED")
      return result("ready", job, "The final handoff is ready.");
    if (payload.reused === true)
      return result(
        "already_running",
        job,
        "The existing final handoff job is still in progress.",
      );
    return result("queued", job, "Final handoff preparation was queued.");
  } catch (error) {
    return result(
      "failed",
      {},
      signal.aborted
        ? "Final handoff preparation was cancelled."
        : error instanceof Error
          ? error.message
          : "RockFoundry could not start the final handoff.",
    );
  }
}
