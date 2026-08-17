import { describe, expect, it } from "vitest";
import { createInitialProjectState } from "../schema";
import { mergeExtraction } from "../ai/merger";
import type { InitialIdeaExtraction } from "../ai/schema";

function explicit(value: string): {
  value: string;
  confidence: "EXPLICIT";
  extractionReason: string;
} {
  return {
    value,
    confidence: "EXPLICIT",
    extractionReason: "Fixture source text",
  };
}

describe("Contextual extraction fixtures", () => {
  it("preserves source-backed entities without hallucinating extras", () => {
    const fixture = {
      rawIdea: "Build inventory for three warehouses",
      users: ["Warehouse staff"],
      entities: ["Warehouse", "Slab"],
    };
    const draft: InitialIdeaExtraction = {
      primaryUsers: fixture.users.map(explicit),
      coreEntities: fixture.entities.map(explicit),
      normalizedSummary: explicit(fixture.rawIdea),
      productType: explicit("Inventory tool"),
      userProblems: [],
      objectives: [],
      proposedCapabilities: [],
      expectedWorkflows: [],
      integrationsMentioned: [],
      platforms: [],
      privacySignals: [],
      scaleSignals: [],
      designSignals: [],
      constraints: [],
      assumptions: [],
      ambiguities: [],
      possibleContradictions: [],
      unsupportedClaims: [],
    };
    const result = mergeExtraction(
      createInitialProjectState({
        id: "fixture",
        name: "Warehouse inventory",
        rawIdea: fixture.rawIdea,
      }),
      draft,
    );
    expect(result.state.targetUsers).toEqual(fixture.users);
    expect(result.state.entities).toEqual(fixture.entities);
    expect(result.state.entities).not.toContain("Cryptocurrency");
  });
});
