import { describe, expect, it } from "vitest";
import {
  ArtifactComposerOutputSchema,
  buildArtifactComposerInput,
  createInitialProjectState,
  normalizeArtifactComposerOutput,
  type ArtifactComposerOutput,
} from "../index";

function sparseState() {
  const state = createInitialProjectState({
    id: "composer-test",
    name: "Laundry desk",
    rawIdea: "A laundry app for a small shop",
  });
  state.targetUsers = ["owner"];
  state.features = ["track laundry orders"];
  state.provenance = {
    "targetUsers.owner": {
      source: "USER",
      confidence: "EXPLICIT",
      evidence: "for the owner",
    },
    "features.track laundry orders": {
      source: "USER",
      confidence: "EXPLICIT",
      evidence: "track laundry orders",
    },
    "features.inferred payment": {
      source: "AGENT_INFERENCE",
      confidence: "STRONGLY_INFERRED",
      evidence: "likely payment support",
    },
  };
  state.assumptions = [
    {
      id: "a1",
      statement: "Customers may receive pickup reminders",
      confidence: "STRONGLY_INFERRED",
      impact: "MEDIUM",
      source: "AGENT_INFERENCE",
      resolved: false,
    },
  ];
  state.openQuestions = ["Should the shop support delivery?"];
  return state;
}

function outputWith(item: Record<string, unknown>): ArtifactComposerOutput {
  const document = {
    title: "Draft",
    summary: "A useful draft summary.",
    sections: [
      {
        id: "overview",
        title: "Overview",
        paragraphs: ["A coherent paragraph."],
        items: [{ id: "claim-1", text: "A claim", ...item }],
      },
    ],
  };
  return ArtifactComposerOutputSchema.parse({
    BRD: document,
    PRD: document,
    ERD: document,
    USER_FLOWS: document,
    SCREEN_MAP: document,
    DESIGN_BRIEF: document,
  });
}

describe("Artifact Composer context", () => {
  it("grounds confirmed fields only when explicit user provenance exists", () => {
    const input = buildArtifactComposerInput(sparseState(), {
      recent: [{ role: "user", text: "Owner tracks laundry orders" }],
      fullUseful: [{ role: "user", text: "A laundry app for a small shop" }],
    });

    expect(input.rawIdea).toContain("laundry");
    expect(input.canonicalTruth.facts.map((fact) => fact.path)).toEqual(
      expect.arrayContaining(["targetUsers", "features"]),
    );
    expect(input.canonicalTruth.facts.map((fact) => fact.value)).not.toContain(
      "inferred payment",
    );
    expect(input.groundedUserFacts.every((fact) => fact.source === "USER")).toBe(true);
    expect(input.canonicalTruth.facts.every((fact) => fact.confidence === "EXPLICIT")).toBe(true);
  });
});

describe("Artifact Composer normalization", () => {
  it("downgrades a confirmed claim with unsupported evidence and explains why", () => {
    const input = buildArtifactComposerInput(sparseState());
    const output = normalizeArtifactComposerOutput(
      outputWith({ label: "CONFIRMED", evidenceIds: ["unknown:evidence"] }),
      input,
    );
    const item = output.BRD.sections[0].items[0];
    expect(item.label).toBe("PROPOSAL");
    expect(item.rationale).toMatch(/unsupported|evidence/i);
  });

  it("does not permit non-user provenance to remain CONFIRMED", () => {
    const input = buildArtifactComposerInput(sparseState());
    input.canonicalTruth.facts.push({
      id: "agent:payment",
      path: "features",
      value: "payment automation",
      source: "AGENT_INFERENCE",
      confidence: "STRONGLY_INFERRED",
      evidence: "inferred",
    });
    const output = normalizeArtifactComposerOutput(
      outputWith({ label: "CONFIRMED", evidenceIds: ["agent:payment"] }),
      input,
    );
    expect(output.BRD.sections[0].items[0].label).toBe("PROPOSAL");
  });

  it("validates all six documents and preserves valid labels", () => {
    const input = buildArtifactComposerInput(sparseState());
    const output = normalizeArtifactComposerOutput(
      outputWith({ label: "ASSUMPTION", evidenceIds: [] }),
      input,
    );
    expect(Object.keys(output)).toEqual([
      "BRD",
      "PRD",
      "ERD",
      "USER_FLOWS",
      "SCREEN_MAP",
      "DESIGN_BRIEF",
    ]);
    expect(output.DESIGN_BRIEF.sections[0].items[0].label).toBe("ASSUMPTION");
  });
});
