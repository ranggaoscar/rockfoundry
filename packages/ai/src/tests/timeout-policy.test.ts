import { describe, expect, it, vi } from "vitest";
import { OpenAICompatibleGateway } from "../gateway";
import { TASK_MAX_RETRIES, TASK_TIMEOUT } from "../prompts";

function completion(content = "ok") {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
  };
}

function initialExtractionRequest() {
  return {
    taskType: "initial_idea_extraction",
    messages: [
      { role: "user" as const, content: "Build an inventory product" },
    ],
    responseFormat: "json" as const,
    maxRetries: 0,
  };
}

describe("initial discovery timeout policy", () => {
  it("sets the initial extraction timeout to 120 seconds without changing representative policies", () => {
    expect(TASK_TIMEOUT.initial_idea_extraction).toBe(120_000);
    expect(TASK_TIMEOUT.contextual_question_enrichment).toBe(60_000);
    expect(TASK_TIMEOUT.ambiguity_analysis).toBe(90_000);
    expect(TASK_MAX_RETRIES.initial_idea_extraction).toBe(2);
  });

  it("gives design architecture and prototype generation explicit bounded policies", () => {
    expect(TASK_TIMEOUT.design_architecture).toBe(120_000);
    expect(TASK_MAX_RETRIES.design_architecture).toBe(1);
    expect(TASK_TIMEOUT.prototype_generation).toBe(180_000);
    expect(TASK_MAX_RETRIES.prototype_generation).toBe(0);
    expect(TASK_TIMEOUT.design_quality_review).toBe(45_000);
    expect(TASK_MAX_RETRIES.design_quality_review).toBe(0);
  });

  it("allows a 65-second initial extraction to complete", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(completion("{}")), 65_000);
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new OpenAICompatibleGateway(
      "https://provider.example/v1",
      "test-key",
      "selected-model",
    );

    const result = gateway.complete<unknown>(initialExtractionRequest());
    await vi.advanceTimersByTimeAsync(65_000);
    await expect(result).resolves.toMatchObject({ data: {} });
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("routes cheap, default, and strong requests to configured model tiers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new OpenAICompatibleGateway(
      "https://provider.example/v1",
      "test-key",
      {
        default: "default-model",
        cheap: "cheap-model",
        strong: "strong-model",
      },
    );

    for (const modelTier of ["cheap", "default", "strong"] as const) {
      await gateway.complete({
        ...initialExtractionRequest(),
        modelTier,
      });
    }

    expect(
      fetchMock.mock.calls.map((call) => JSON.parse(call[1].body).model),
    ).toEqual(["cheap-model", "default-model", "strong-model"]);
    vi.unstubAllGlobals();
  });

  it("still aborts an initial extraction beyond 120 seconds without a fallback", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new OpenAICompatibleGateway(
      "https://provider.example/v1",
      "test-key",
      "selected-model",
    );

    const rejection = expect(
      gateway.complete<unknown>(initialExtractionRequest()),
    ).rejects.toThrow("AI request timed out after 120000ms");
    await vi.advanceTimersByTimeAsync(120_000);
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
