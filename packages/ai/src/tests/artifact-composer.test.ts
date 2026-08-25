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
function validDocument(title: string) {
  return { title, summary: "Useful", sections: [{ id: "s", title: "Overview", paragraphs: ["Useful"], items: [{ id: "i", text: "Thing", label: "PROPOSAL", evidenceIds: [] }] }] };
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

  it("normalizes malformed Luna output in one provider call without whole-output repair", async () => {
    const valid = {
      BRD: { title: "BRD", summary: "Useful", sections: [{ id: "s", title: "Overview", paragraphs: ["Useful"], items: [{ id: "i", text: "Thing", label: "PROPOSAL", evidenceIds: [] }] }] },
      PRD: { content: "# Product Requirements\n\nUseful draft.\n\n## Scope\n\n- Keep scope small." },
      ERD: { artifact: { title: "ERD", sections: [{ title: "Data", items: [{ text: "Entity", label: "PROPOSAL" }] }] } },
      USER_FLOWS: { document: validDocument("Flows") },
      SCREEN_MAP: validDocument("Screens"),
      DESIGN_BRIEF: { title: "", sections: null },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ documents: valid }) } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new AiGateway(new OpenAICompatibleGateway("https://provider.example/v1", "key", "model"));
    const result = await gateway.runArtifactComposer(input());
    expect(result.BRD.title).toBe("BRD");
    expect(result.PRD.title).toBe("Product Requirements");
    expect(result.PRD.sections.flatMap((section) => section.paragraphs).join(" ")).toContain("Useful draft");
    expect(result.DESIGN_BRIEF.sections[0].items[0].label).toBe("OPEN_QUESTION");
    expect(ArtifactComposerOutputSchema.parse(result)).toEqual(result);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).response_format).toEqual({ type: "json_object" });
    vi.unstubAllGlobals();
  });
});
