import { describe, expect, it, vi } from "vitest";
import { AiGateway } from "../index";
import { OpenAICompatibleGateway } from "../gateway";

function response(content: string) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 11, completion_tokens: 17, total_tokens: 28 },
    }),
  };
}

const architecture = {
  designSpec: {
    productName: "Job Platform",
    direction: {
      mood: "editorial",
      density: "compact",
      navigation: "sidebar",
      visualKeywords: ["warm"],
      references: [],
    },
    informationArchitecture: ["Job Discovery (#/jobs)"],
    navigation: "Sidebar navigation.",
    visualHierarchy: "Title then work.",
    density: "compact",
    typography: "System sans.",
    spacing: "8px rhythm.",
    surfaces: "Hairline surfaces.",
    controls: "Quiet controls.",
    components: ["job-card"],
    screenContent: [{ screenId: "job-discover", hierarchy: ["Jobs"] }],
    responsive: "Stack at mobile.",
    interactions: ["hash route"],
    states: ["empty"],
  },
  summary: "Editorial job discovery direction.",
  assumptions: [],
};

const prototype = {
  files: [
    {
      path: "index.html",
      content:
        '<main><nav><a href="#/jobs">Jobs</a></nav></main><script src="app.js"></script>',
    },
    {
      path: "styles.css",
      content: "@media (max-width: 768px){main{padding:8px}}",
    },
    {
      path: "app.js",
      content: "window.addEventListener('hashchange',()=>{});",
    },
  ],
  summary: "Generated compact prototype.",
  assumptions: [],
};

describe("Design generation JSON transport", () => {
  it("parses architecture and prototype JSON from an OpenAI-compatible provider", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(JSON.stringify(architecture)))
      .mockResolvedValueOnce(response(JSON.stringify(prototype)));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new AiGateway(
      new OpenAICompatibleGateway(
        "https://provider.example/v1",
        "test-key",
        "design-model",
        "max",
      ),
    );
    await expect(
      gateway.runDesignArchitecture({
        product: { name: "Job Platform" },
        screenMap: [],
      }),
    ).resolves.toMatchObject({
      architecture: { summary: "Editorial job discovery direction." },
      model: "design-model",
    });
    await expect(
      gateway.runPrototypeGeneration({
        product: { name: "Job Platform" },
        architecture,
        screenMap: [],
        revisionRequest: "compact",
        reasoningEffort: "low",
      }),
    ).resolves.toMatchObject({
      prototype: { summary: "Generated compact prototype." },
      model: "design-model",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const architecturePayload = JSON.parse(fetchMock.mock.calls[0][1].body);
    const prototypePayload = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(architecturePayload.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { strict: true },
    });
    expect(
      architecturePayload.response_format.json_schema.schema.properties,
    ).toHaveProperty("designSpec");
    expect(prototypePayload.response_format).toEqual({ type: "json_object" });
    expect(prototypePayload.reasoning_effort).toBe("low");
    expect(prototypePayload.model).toBe("design-model");
    vi.unstubAllGlobals();
  });

  it("accepts an architecture missing only summary without a repair request", async () => {
    const { summary: _summary, ...architectureWithoutSummary } = architecture;
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response(JSON.stringify(architectureWithoutSummary)));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new AiGateway(
      new OpenAICompatibleGateway(
        "https://provider.example/v1",
        "test-key",
        "design-model",
        "max",
      ),
    );

    await expect(
      gateway.runDesignArchitecture({ product: {}, screenMap: [] }),
    ).resolves.toMatchObject({
      architecture: {
        summary:
          "Generated design architecture from confirmed product decisions.",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("accepts a prototype missing only summary without a repair request", async () => {
    const { summary: _summary, ...prototypeWithoutSummary } = prototype;
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response(JSON.stringify(prototypeWithoutSummary)));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new AiGateway(
      new OpenAICompatibleGateway(
        "https://provider.example/v1",
        "test-key",
        "design-model",
        "max",
      ),
    );

    await expect(
      gateway.runPrototypeGeneration({
        product: {},
        architecture,
        screenMap: [],
      }),
    ).resolves.toMatchObject({
      prototype: {
        summary:
          "Generated interactive prototype from the approved design architecture.",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("does not coerce a wrong-type architecture summary", async () => {
    const wrongSummary = { ...architecture, summary: null };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(JSON.stringify(wrongSummary)))
      .mockResolvedValueOnce(response(JSON.stringify(architecture)));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new AiGateway(
      new OpenAICompatibleGateway(
        "https://provider.example/v1",
        "test-key",
        "design-model",
        "max",
      ),
    );

    await expect(
      gateway.runDesignArchitecture({ product: {}, screenMap: [] }),
    ).resolves.toMatchObject({
      architecture: { summary: architecture.summary },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("repairs one malformed architecture response with the same strict schema and model", async () => {
    const malformed = { designSpec: { productName: "Job Platform" } };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(JSON.stringify(malformed)))
      .mockResolvedValueOnce(response(JSON.stringify(architecture)));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new AiGateway(
      new OpenAICompatibleGateway(
        "https://provider.example/v1",
        "test-key",
        "design-model",
        "max",
      ),
    );

    await expect(
      gateway.runDesignArchitecture({
        product: { name: "Job Platform" },
        screenMap: [],
      }),
    ).resolves.toMatchObject({
      architecture: { summary: architecture.summary },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      expect(JSON.parse(call[1].body)).toMatchObject({
        model: "design-model",
        reasoning_effort: "high",
        response_format: { type: "json_schema", json_schema: { strict: true } },
      });
    }
    const repairPayload = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(repairPayload.messages.at(-1).content).toContain(
      "Correct the previous JSON",
    );
    vi.unstubAllGlobals();
  });

  it("fails after exactly one invalid architecture repair", async () => {
    const malformed = { designSpec: { productName: "Job Platform" } };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response(JSON.stringify(malformed)));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new AiGateway(
      new OpenAICompatibleGateway(
        "https://provider.example/v1",
        "test-key",
        "design-model",
        "max",
      ),
    );

    await expect(
      gateway.runDesignArchitecture({ product: {}, screenMap: [] }),
    ).rejects.toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("repairs one malformed prototype response with bounded JSON-object requests", async () => {
    const malformed = { files: [{ path: "index.html", content: "<main />" }] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(JSON.stringify(malformed)))
      .mockResolvedValueOnce(response(JSON.stringify(prototype)));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new AiGateway(
      new OpenAICompatibleGateway(
        "https://provider.example/v1",
        "test-key",
        "design-model",
        "max",
      ),
    );

    await expect(
      gateway.runPrototypeGeneration({
        product: { name: "Job Platform" },
        architecture,
        screenMap: [],
      }),
    ).resolves.toMatchObject({ prototype: { summary: prototype.summary } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      expect(JSON.parse(call[1].body)).toMatchObject({
        model: "design-model",
        reasoning_effort: "medium",
        response_format: { type: "json_object" },
      });
    }
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).messages[0].content).toContain(
      "Repair the supplied prototype response shape only",
    );
    vi.unstubAllGlobals();
  });

  it("normalizes Luna wrapper and file-map shapes without a repair", async () => {
    const wrapped = {
      output: {
        files: {
          "index.html": prototype.files[0].content,
          "styles.css": { content: prototype.files[1].content },
          "app.js": { code: prototype.files[2].content },
        },
      },
      summary: "Wrapped Luna prototype.",
      assumptions: "Uses hash routes.",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response(`\`\`\`json\n${JSON.stringify(wrapped)}\n\`\`\``));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new AiGateway(
      new OpenAICompatibleGateway(
        "https://provider.example/v1",
        "test-key",
        "design-model",
        "max",
      ),
    );

    await expect(
      gateway.runPrototypeGeneration({ product: {}, architecture: {}, screenMap: [] }),
    ).resolves.toMatchObject({
      prototype: {
        files: prototype.files,
        summary: "Wrapped Luna prototype.",
        assumptions: ["Uses hash routes."],
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("preserves valid generated files when the bounded repair returns only missing files", async () => {
    const malformed = {
      files: [prototype.files[0]],
      summary: prototype.summary,
      assumptions: [],
    };
    const repair = {
      files: [prototype.files[1], prototype.files[2]],
      summary: prototype.summary,
      assumptions: [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(JSON.stringify(malformed)))
      .mockResolvedValueOnce(response(JSON.stringify(repair)));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new AiGateway(
      new OpenAICompatibleGateway(
        "https://provider.example/v1",
        "test-key",
        "design-model",
      ),
    );

    await expect(
      gateway.runPrototypeGeneration({ product: {}, architecture: {}, screenMap: [] }),
    ).resolves.toMatchObject({ prototype: { files: prototype.files } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("does not repair a provider timeout", async () => {
    const fetchMock = vi.fn().mockRejectedValue(
      Object.assign(new Error("timed out"), { name: "TimeoutError" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new AiGateway(
      new OpenAICompatibleGateway(
        "https://provider.example/v1",
        "test-key",
        "design-model",
      ),
    );

    await expect(
      gateway.runPrototypeGeneration({ product: {}, architecture: {}, screenMap: [] }),
    ).rejects.toThrow("timed out");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("does not repair provider 4xx responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      statusText: "Unprocessable Entity",
      text: async () => '{"error":"schema rejected"}',
    });
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new AiGateway(
      new OpenAICompatibleGateway(
        "https://provider.example/v1",
        "test-key",
        "design-model",
        "max",
      ),
    );

    await expect(
      gateway.runPrototypeGeneration({
        product: {},
        architecture: {},
        screenMap: [],
      }),
    ).rejects.toThrow("422");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("surfaces strict-schema provider 4xx without a json_object downgrade", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      statusText: "Unprocessable Entity",
      text: async () => '{"error":"schema rejected"}',
    });
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new AiGateway(
      new OpenAICompatibleGateway(
        "https://provider.example/v1",
        "test-key",
        "design-model",
        "max",
      ),
    );

    await expect(
      gateway.runDesignArchitecture({ product: {}, screenMap: [] }),
    ).rejects.toThrow("422");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      response_format: { type: "json_schema", json_schema: { strict: true } },
    });
    vi.unstubAllGlobals();
  });

  it("fails malformed design JSON without fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("not-json")));
    const gateway = new AiGateway(
      new OpenAICompatibleGateway(
        "https://provider.example/v1",
        "test-key",
        "design-model",
        "max",
      ),
    );
    await expect(
      gateway.runDesignArchitecture({ product: {}, screenMap: [] }),
    ).rejects.toThrow("Failed to parse JSON response from AI provider");
    vi.unstubAllGlobals();
  });
});
