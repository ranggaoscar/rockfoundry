import { describe, expect, it, vi } from "vitest";
import {
  discoverOpenAiCompatibleModels,
  normalizeOpenAiCompatibleBaseUrl,
  OpenAICompatibleGateway,
} from "../gateway";

describe("OpenAI-compatible gateway URLs", () => {
  it.each([
    ["https://api.openai.com", "https://api.openai.com/v1"],
    ["https://api.openai.com/", "https://api.openai.com/v1"],
    ["https://api.openai.com/v1", "https://api.openai.com/v1"],
    ["https://api.openai.com/v1/", "https://api.openai.com/v1"],
  ])("normalizes %s to one canonical /v1 root", (input, expected) => {
    expect(normalizeOpenAiCompatibleBaseUrl(input)).toBe(expected);
  });

  it("uses the canonical request URL for completions and model discovery", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: "model-b" }, { id: "model-a" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "ok" } }] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      discoverOpenAiCompatibleModels("https://example.test/v1/", "key"),
    ).resolves.toEqual(["model-a", "model-b"]);
    await new OpenAICompatibleGateway(
      "https://example.test/v1",
      "key",
      "model-a",
    ).complete({
      messages: [{ role: "user", content: "hello" }],
      maxRetries: 0,
    });

    expect(fetchMock.mock.calls[0][0]).toBe("https://example.test/v1/models");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://example.test/v1/chat/completions",
    );
    vi.unstubAllGlobals();
  });
});
