import { describe, expect, it, vi } from "vitest";
import { AiGateway, MockGatewayProvider } from "../index";
import { OpenAICompatibleGateway } from "../gateway";

const validExtraction = {
  normalizedSummary: {
    value: "A local inventory workspace",
    confidence: "EXPLICIT",
    extractionReason: "Taken from the idea",
  },
  coreEntities: [],
};

function compatibleResponse(content: string) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
    }),
  };
}

describe("initial discovery JSON transport", () => {
  it("parses valid JSON text from an OpenAI-compatible provider before extraction validation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(compatibleResponse(JSON.stringify(validExtraction)));
    vi.stubGlobal("fetch", fetchMock);

    const gateway = new AiGateway(
      new OpenAICompatibleGateway(
        "https://provider.example/v1",
        "test-key",
        "selected-model",
      ),
    );

    await expect(
      gateway.runInitialExtraction("Build an inventory workspace"),
    ).resolves.toMatchObject({
      extraction: {
        normalizedSummary: { value: "A local inventory workspace" },
      },
      model: "selected-model",
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://provider.example/v1/chat/completions",
    );
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.model).toBe("selected-model");
    expect(request.response_format).toEqual({ type: "json_object" });
    vi.unstubAllGlobals();
  });

  it("fails malformed JSON without falling back to Mock", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(compatibleResponse("{not-json"));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new AiGateway(
      new OpenAICompatibleGateway(
        "https://provider.example/v1",
        "test-key",
        "selected-model",
      ),
    );

    await expect(
      gateway.runInitialExtraction("Build inventory"),
    ).rejects.toThrow("Failed to parse JSON response from AI provider");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.unstubAllGlobals();
  });

  it("rejects JSON that is valid syntax but invalid extraction data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(compatibleResponse(JSON.stringify([])));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new AiGateway(
      new OpenAICompatibleGateway(
        "https://provider.example/v1",
        "test-key",
        "selected-model",
      ),
    );

    await expect(
      gateway.runInitialExtraction("Build inventory"),
    ).rejects.toMatchObject({
      name: "ZodError",
    });
    vi.unstubAllGlobals();
  });

  it("keeps Mock initial extraction working with JSON intent", async () => {
    const result = await new AiGateway(
      new MockGatewayProvider(),
    ).runInitialExtraction("Build inventory for a warehouse");
    expect(result.extraction.coreEntities.map((item) => item.value)).toContain(
      "Inventory item",
    );
  });

  it("leaves an ordinary completion as text", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(compatibleResponse("plain response"));
    vi.stubGlobal("fetch", fetchMock);
    const response = await new OpenAICompatibleGateway(
      "https://provider.example/v1",
      "test-key",
      "selected-model",
    ).complete<string>({
      messages: [{ role: "user", content: "hello" }],
      maxRetries: 0,
    });

    expect(response.data).toBe("plain response");
    vi.unstubAllGlobals();
  });
});
