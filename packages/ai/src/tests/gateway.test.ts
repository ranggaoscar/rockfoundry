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

  it("lets request-level reasoning override the gateway default", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await new OpenAICompatibleGateway(
      "https://example.test/v1",
      "test-key",
      "test-model",
      "high",
    ).complete({
      messages: [{ role: "user", content: "override" }],
      reasoningEffort: "medium",
      maxRetries: 0,
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      model: "test-model",
      reasoning_effort: "medium",
    });
    vi.unstubAllGlobals();
  });

  it("sends configured reasoning effort and omits it when absent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await new OpenAICompatibleGateway(
      "https://example.test/v1",
      "test-key",
      "test-model",
      "max",
    ).complete({
      messages: [{ role: "user", content: "reason" }],
      maxRetries: 0,
    });
    await new OpenAICompatibleGateway(
      "https://example.test/v1",
      "test-key",
      "test-model",
    ).complete({
      messages: [{ role: "user", content: "no reason" }],
      maxRetries: 0,
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      model: "test-model",
      reasoning_effort: "max",
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty(
      "reasoning_effort",
    );
    vi.unstubAllGlobals();
  });

  it("requests json_object mode for JSON transport without a schema", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"ok":true}' } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await new OpenAICompatibleGateway(
      "https://example.test/v1",
      "test-key",
      "test-model",
    ).complete({
      messages: [{ role: "user", content: "Return JSON" }],
      responseFormat: "json",
      maxRetries: 0,
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      response_format: { type: "json_object" },
    });
    vi.unstubAllGlobals();
  });

  it("keeps strict json_schema mode when a response schema exists", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"ok":true}' } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await new OpenAICompatibleGateway(
      "https://example.test/v1",
      "test-key",
      "test-model",
    ).complete({
      messages: [{ role: "user", content: "Return JSON" }],
      responseFormat: "json",
      responseSchema: {
        type: "object",
        properties: { ok: { type: "boolean" } },
        required: ["ok"],
      },
      maxRetries: 0,
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      response_format: {
        type: "json_schema",
        json_schema: { strict: true },
      },
    });
    vi.unstubAllGlobals();
  });
});
