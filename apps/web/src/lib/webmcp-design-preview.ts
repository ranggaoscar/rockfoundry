export type WebMcpDesignPreviewResult = {
  status: "queued" | "already_running" | "draft_stale" | "failed";
  jobId?: string;
  jobStatus?: string;
  stage?: string;
  message: string;
};

type DesignJob = {
  id?: unknown;
  status?: unknown;
  stage?: unknown;
  errorSummary?: unknown;
};

type GenerateDesignPreviewInput = {
  projectId: string;
  signal: AbortSignal;
  showDesignWorkbench: () => void;
  fetchImpl?: typeof fetch;
};

function asJob(value: unknown): DesignJob {
  return value && typeof value === "object" ? (value as DesignJob) : {};
}

function jobResult(
  status: WebMcpDesignPreviewResult["status"],
  job: DesignJob,
  message: string,
): WebMcpDesignPreviewResult {
  return {
    status,
    ...(typeof job.id === "string" ? { jobId: job.id } : {}),
    ...(typeof job.status === "string" ? { jobStatus: job.status } : {}),
    ...(typeof job.stage === "string" ? { stage: job.stage } : {}),
    message,
  };
}

async function json(response: Response) {
  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

/** Queues the existing Design Preview job; DesignStudio remains the progress authority. */
export async function generateDesignPreviewThroughWebMcp({
  projectId,
  signal,
  showDesignWorkbench,
  fetchImpl = fetch,
}: GenerateDesignPreviewInput): Promise<WebMcpDesignPreviewResult> {
  try {
    const documentsResponse = await fetchImpl(
      `/api/projects/${projectId}/documents`,
      { signal },
    );
    const documents = await json(documentsResponse);
    if (!documentsResponse.ok)
      return {
        status: "failed",
        message: "Could not load the current Product Draft.",
      };
    if (documents.hasCurrentDraft !== true)
      return {
        status: "draft_stale",
        message: "The Product Draft is stale. Regenerate Product Draft first before creating a Design Preview.",
      };

    const response = await fetchImpl(
      `/api/projects/${projectId}/design/generate`,
      { method: "POST", signal },
    );
    const payload = await json(response);
    const job = asJob(payload.job);
    if (response.ok) {
      showDesignWorkbench();
      return jobResult(
        payload.reused === true ? "already_running" : "queued",
        job,
        payload.reused === true
          ? "A Design Preview job is already active. The Design workbench is showing its progress."
          : "Design Preview was queued. The Design workbench is showing its progress.",
      );
    }
    if (response.status === 409) {
      const designResponse = await fetchImpl(`/api/projects/${projectId}/design`, {
        signal,
      });
      const design = await json(designResponse);
      const activeJob = asJob(design.designJob);
      if (
        designResponse.ok &&
        ["QUEUED", "RUNNING"].includes(String(activeJob.status || ""))
      ) {
        showDesignWorkbench();
        return jobResult(
          "already_running",
          activeJob,
          "A Design Preview job is already active. The Design workbench is showing its progress.",
        );
      }
    }
    return {
      status: "failed",
      message:
        typeof payload.error === "string"
          ? payload.error
          : "RockFoundry could not start the Design Preview.",
    };
  } catch (error) {
    return {
      status: "failed",
      message:
        signal.aborted
          ? "Design Preview start was cancelled."
          : error instanceof Error
            ? error.message
            : "RockFoundry could not start the Design Preview.",
    };
  }
}
