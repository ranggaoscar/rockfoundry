import { describe, expect, it, vi } from "vitest";
import { createProjectThroughWebMcp } from "./webmcp-create-project";

function response(payload: unknown, status = 201) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createProjectThroughWebMcp", () => {
  it("uses the existing project API, forwards AbortSignal, and navigates", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn().mockResolvedValue(
      response({ project: { id: "project-1", name: "Booking" } }),
    );
    const navigateToProject = vi.fn();

    await expect(
      createProjectThroughWebMcp({
        description: "A booking product",
        name: "Booking",
        signal: controller.signal,
        navigateToProject,
        fetchImpl,
      }),
    ).resolves.toEqual({
      status: "success",
      projectId: "project-1",
      name: "Booking",
      projectUrl: "/project/project-1",
      message: "Project created and opened.",
    });
    expect(fetchImpl).toHaveBeenCalledWith("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "A booking product", name: "Booking" }),
      signal: controller.signal,
    });
    expect(navigateToProject).toHaveBeenCalledWith("/project/project-1");
  });

  it("requires a non-empty description before making a request", async () => {
    const fetchImpl = vi.fn();
    await expect(
      createProjectThroughWebMcp({
        description: "  ",
        name: undefined,
        signal: new AbortController().signal,
        navigateToProject: vi.fn(),
        fetchImpl,
      }),
    ).resolves.toMatchObject({ status: "failed" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns a safe API failure without navigating", async () => {
    const navigateToProject = vi.fn();
    await expect(
      createProjectThroughWebMcp({
        description: "A product",
        name: undefined,
        signal: new AbortController().signal,
        navigateToProject,
        fetchImpl: vi.fn().mockResolvedValue(
          response({ error: "A project idea is required." }, 400),
        ),
      }),
    ).resolves.toEqual({
      status: "failed",
      message: "A project idea is required.",
    });
    expect(navigateToProject).not.toHaveBeenCalled();
  });

  it("reports cancellation when the request is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      createProjectThroughWebMcp({
        description: "A product",
        name: undefined,
        signal: controller.signal,
        navigateToProject: vi.fn(),
        fetchImpl: vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")),
      }),
    ).resolves.toEqual({
      status: "cancelled",
      message: "Project creation was cancelled.",
    });
  });
});
