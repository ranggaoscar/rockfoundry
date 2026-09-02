import { describe, expect, it, vi } from "vitest";
import { prepareHandoffThroughWebMcp } from "./webmcp-prepare-handoff";

function response(payload: unknown, status = 202) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("prepareHandoffThroughWebMcp", () => {
  it("queues the existing Product Package API job with the caller signal", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn().mockResolvedValue(
      response({
        job: { id: "package-1", status: "QUEUED", stage: "PREPARING_PRODUCT" },
        reused: false,
      }),
    );

    await expect(
      prepareHandoffThroughWebMcp({
        projectId: "project-1",
        signal: controller.signal,
        fetchImpl,
      }),
    ).resolves.toEqual({
      status: "queued",
      jobId: "package-1",
      jobStatus: "QUEUED",
      stage: "PREPARING_PRODUCT",
      message: "Final handoff preparation was queued.",
    });
    expect(fetchImpl).toHaveBeenCalledWith("/api/projects/project-1/package", {
      method: "POST",
      signal: controller.signal,
    });
  });

  it("reports a reused active package job without creating another flow", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({
        job: {
          id: "package-1",
          status: "RUNNING",
          stage: "FINALIZING_HANDOFF",
        },
        reused: true,
      }),
    );

    await expect(
      prepareHandoffThroughWebMcp({
        projectId: "project-1",
        signal: new AbortController().signal,
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      status: "already_running",
      jobId: "package-1",
      jobStatus: "RUNNING",
      stage: "FINALIZING_HANDOFF",
    });
  });

  it("reports an existing completed handoff as ready", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({
        job: { id: "package-1", status: "COMPLETED", stage: "COMPLETED" },
        reused: true,
      }),
    );

    await expect(
      prepareHandoffThroughWebMcp({
        projectId: "project-1",
        signal: new AbortController().signal,
        fetchImpl,
      }),
    ).resolves.toMatchObject({ status: "ready", jobStatus: "COMPLETED" });
  });
});
