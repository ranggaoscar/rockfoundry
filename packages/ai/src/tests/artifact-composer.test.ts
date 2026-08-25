import { describe, expect, it, vi } from "vitest";
import {
  AiGateway,
  MockGatewayProvider,
  OpenAICompatibleGateway,
} from "../index";
import {
  ArtifactComposerOutputSchema,
  buildArtifactComposerInput,
  createInitialProjectState,
} from "@rockfoundry/core";

function input() {
  return buildArtifactComposerInput(
    createInitialProjectState({
      id: "laundry-ai",
      name: "Laundry",
      rawIdea: "A laundry app for a small shop",
    }),
  );
}

describe("Artifact Composer gateway", () => {
  it("mock provider creates a useful sparse laundry draft with labels", async () => {
    const result = await new AiGateway(new MockGatewayProvider()).runArtifactComposer(input());
    expect(result.BRD.summary).not.toContain("[UNRESOLVED]");
    expect(JSON.stringify(result)).toMatch(/owner|karyawan|order|customer/i);
    expect(JSON.stringify(result)).toMatch(/PROPOSAL|ASSUMPTION|OPEN_QUESTION/);
    expect(ArtifactComposerOutputSchema.parse(result)).toEqual(result);
  });

  it("includes route and purpose in the mock Screen Map proposal", async () => {
    const result = await new AiGateway(new MockGatewayProvider()).runArtifactComposer(input());
    const text = result.SCREEN_MAP.sections.flatMap((section) => section.items).map((item) => item.text).join("\n");
    expect(text).toMatch(/Route: `#\/orders`/);
    expect(text).toMatch(/Purpose: Review active laundry orders/);
  });

  it("sends artifact_composer and repairs an invalid strict response", async () => {
    const valid = {
      BRD: { title: "BRD", summary: "Useful", sections: [{ id: "s", title: "Overview", paragraphs: ["Useful"], items: [{ id: "i", text: "Thing", label: "PROPOSAL", evidenceIds: [] }] }] },
      PRD: { title: "PRD", summary: "Useful", sections: [{ id: "s", title: "Overview", paragraphs: ["Useful"], items: [{ id: "i", text: "Thing", label: "PROPOSAL", evidenceIds: [] }] }] },
      ERD: { title: "ERD", summary: "Useful", sections: [{ id: "s", title: "Overview", paragraphs: ["Useful"], items: [{ id: "i", text: "Thing", label: "PROPOSAL", evidenceIds: [] }] }] },
      USER_FLOWS: { title: "Flows", summary: "Useful", sections: [{ id: "s", title: "Overview", paragraphs: ["Useful"], items: [{ id: "i", text: "Thing", label: "PROPOSAL", evidenceIds: [] }] }] },
      SCREEN_MAP: { title: "Screens", summary: "Useful", sections: [{ id: "s", title: "Overview", paragraphs: ["Useful"], items: [{ id: "i", text: "Thing", label: "PROPOSAL", evidenceIds: [] }] }] },
      DESIGN_BRIEF: { title: "Design", summary: "Useful", sections: [{ id: "s", title: "Overview", paragraphs: ["Useful"], items: [{ id: "i", text: "Thing", label: "PROPOSAL", evidenceIds: [] }] }] },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ BRD: {} }) } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(valid) } }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new AiGateway(new OpenAICompatibleGateway("https://provider.example/v1", "key", "model"));
    const result = await gateway.runArtifactComposer(input());
    expect(result.BRD.title).toBe("BRD");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).taskType).toBeUndefined();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content).toMatch(/artifact composer/i);
    vi.unstubAllGlobals();
  });
});
