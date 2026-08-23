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
      }),
    ).resolves.toMatchObject({
      prototype: { summary: "Generated compact prototype." },
      model: "design-model",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(payload.model).toBe("design-model");
    vi.unstubAllGlobals();
  });

  it("fails malformed design JSON without fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("not-json")));
    const gateway = new AiGateway(
      new OpenAICompatibleGateway(
        "https://provider.example/v1",
        "test-key",
        "design-model",
      ),
    );
    await expect(
      gateway.runDesignArchitecture({ product: {}, screenMap: [] }),
    ).rejects.toThrow("Failed to parse JSON response from AI provider");
    vi.unstubAllGlobals();
  });
});
