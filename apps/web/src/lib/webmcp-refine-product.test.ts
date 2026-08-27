import { describe, expect, it, vi } from "vitest";
import { createInitialProjectState } from "@rockfoundry/core";
import {
  refineProductThroughConversation,
  WEBMCP_REFINE_PRODUCT_MAX_INSTRUCTION_LENGTH,
} from "./webmcp-refine-product";

const projectId = "project-1";
const instruction =
  "Only the owner can confirm orders. Customers cannot edit an order after payment.";

const previousState = createInitialProjectState({
  id: projectId,
  name: "Orders",
  rawIdea: "Manage local orders.",
});

function successResponse(state: unknown) {
  return new Response(
    JSON.stringify({
      version: 5,
      message: "Owner-only order confirmation is now recorded.",
      state,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("WebMCP refine_product", () => {
  it("uses the existing conversation endpoint with the instruction and AbortSignal", async () => {
    const controller = new AbortController();
    const refinedState = structuredClone(previousState);
    refinedState.businessRules = [
      "Only the owner can confirm orders.",
      "Customers cannot edit an order after payment.",
    ];
    const refreshProject = vi.fn().mockResolvedValue({
      canonicalState: refinedState,
    });
    const fetchImpl = vi.fn().mockResolvedValue(successResponse(refinedState));

    const result = await refineProductThroughConversation({
      projectId,
      instruction,
      previousState,
      signal: controller.signal,
      refreshProject,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      `/api/projects/${projectId}/conversation`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: instruction }),
        signal: controller.signal,
      }),
    );
    expect(refreshProject).toHaveBeenCalledWith(projectId);
    expect(result).toEqual({
      status: "success",
      projectVersion: 5,
      assistantSummary: "Owner-only order confirmation is now recorded.",
      draftMayNeedRefresh: true,
    });
  });

  it("returns no_change when conversation only acknowledges the instruction", async () => {
    const refreshProject = vi.fn().mockResolvedValue({
      canonicalState: previousState,
    });

    await expect(
      refineProductThroughConversation({
        projectId,
        instruction,
        previousState,
        signal: new AbortController().signal,
        refreshProject,
        fetchImpl: vi.fn().mockResolvedValue(successResponse(previousState)),
      }),
    ).resolves.toEqual({
      status: "no_change",
      projectVersion: 5,
      assistantSummary:
        "The conversation was saved, but canonical product truth did not change.",
      draftMayNeedRefresh: false,
    });
    expect(refreshProject).toHaveBeenCalledWith(projectId);
  });

  it("rejects empty and oversized instructions before calling conversation", async () => {
    const fetchImpl = vi.fn();
    const refreshProject = vi.fn();
    const signal = new AbortController().signal;

    await expect(
      refineProductThroughConversation({
        projectId,
        instruction: "   ",
        previousState,
        signal,
        refreshProject,
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      status: "failed",
      draftMayNeedRefresh: false,
    });
    await expect(
      refineProductThroughConversation({
        projectId,
        instruction: "x".repeat(
          WEBMCP_REFINE_PRODUCT_MAX_INSTRUCTION_LENGTH + 1,
        ),
        previousState,
        signal,
        refreshProject,
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      status: "failed",
      draftMayNeedRefresh: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(refreshProject).not.toHaveBeenCalled();
  });

  it("returns a retryable result while the conversation is still running", async () => {
    const refreshProject = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      refineProductThroughConversation({
        projectId,
        instruction,
        previousState,
        signal: new AbortController().signal,
        refreshProject,
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      status: "retryable",
      draftMayNeedRefresh: false,
    });
    expect(refreshProject).not.toHaveBeenCalled();
  });

  it("returns a safe retryable result for a version conflict without refreshing", async () => {
    const refreshProject = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error:
            "The project changed while this conversation turn was running. Retry the turn.",
          retryable: true,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      refineProductThroughConversation({
        projectId,
        instruction,
        previousState,
        signal: new AbortController().signal,
        refreshProject,
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      status: "retryable",
      draftMayNeedRefresh: false,
    });
    expect(refreshProject).not.toHaveBeenCalled();
  });

  it("returns a safe failure when conversation cannot process the refinement", async () => {
    const refreshProject = vi.fn();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "RockFoundry couldn't process that message.",
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
      );

    await expect(
      refineProductThroughConversation({
        projectId,
        instruction,
        previousState,
        signal: new AbortController().signal,
        refreshProject,
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      status: "failed",
      assistantSummary: "RockFoundry couldn't process that message.",
      draftMayNeedRefresh: false,
    });
    expect(refreshProject).not.toHaveBeenCalled();
  });

  it("returns a cancellation result when its AbortSignal cancels fetch", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new DOMException("Aborted", "AbortError"));

    await expect(
      refineProductThroughConversation({
        projectId,
        instruction,
        previousState,
        signal: controller.signal,
        refreshProject: vi.fn(),
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      status: "cancelled",
      draftMayNeedRefresh: false,
    });
  });
});
