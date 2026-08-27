import { describe, expect, it, vi } from "vitest";
import { generateDesignPreviewThroughWebMcp } from "./webmcp-design-preview";

const projectId = "project-1";
const job = {
  id: "design-job-1",
  status: "QUEUED",
  stage: "DESIGN_ARCHITECTURE",
};

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("generateDesignPreviewThroughWebMcp", () => {
  it("blocks a stale Product Draft before starting design generation", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ hasCurrentDraft: false }));
    const showDesignWorkbench = vi.fn();

    await expect(
      generateDesignPreviewThroughWebMcp({
        projectId,
        signal: new AbortController().signal,
        showDesignWorkbench,
        fetchImpl,
      }),
    ).resolves.toMatchObject({ status: "draft_stale" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(showDesignWorkbench).not.toHaveBeenCalled();
  });

  it("queues the existing design job and passes its AbortSignal to requests", async () => {
    const controller = new AbortController();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({ hasCurrentDraft: true }))
      .mockResolvedValueOnce(response({ job }, 202));
    const showDesignWorkbench = vi.fn();

    await expect(
      generateDesignPreviewThroughWebMcp({
        projectId,
        signal: controller.signal,
        showDesignWorkbench,
        fetchImpl,
      }),
    ).resolves.toEqual({
      status: "queued",
      jobId: "design-job-1",
      jobStatus: "QUEUED",
      stage: "DESIGN_ARCHITECTURE",
      message: "Design Preview was queued. The Design workbench is showing its progress.",
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      `/api/projects/${projectId}/documents`,
      { signal: controller.signal },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      `/api/projects/${projectId}/design/generate`,
      { method: "POST", signal: controller.signal },
    );
    expect(showDesignWorkbench).toHaveBeenCalledTimes(1);
  });

  it("returns immediately when an existing job is reused", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({ hasCurrentDraft: true }))
      .mockResolvedValueOnce(response({ job: { ...job, status: "RUNNING" }, reused: true }, 202));

    await expect(
      generateDesignPreviewThroughWebMcp({
        projectId,
        signal: new AbortController().signal,
        showDesignWorkbench: vi.fn(),
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      status: "already_running",
      jobStatus: "RUNNING",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("uses the current design snapshot to describe an active conflicting job", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({ hasCurrentDraft: true }))
      .mockResolvedValueOnce(response({ error: "active job" }, 409))
      .mockResolvedValueOnce(response({ designJob: { ...job, status: "RUNNING" } }));

    await expect(
      generateDesignPreviewThroughWebMcp({
        projectId,
        signal: new AbortController().signal,
        showDesignWorkbench: vi.fn(),
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      status: "already_running",
      jobId: "design-job-1",
      jobStatus: "RUNNING",
    });
  });
});
