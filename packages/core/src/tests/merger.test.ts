import { describe, expect, it } from "vitest";
import { createInitialProjectState } from "../schema";
import { mergeExtraction } from "../ai/merger";
import type { InitialIdeaExtraction } from "../ai/schema";

describe("Deterministic extraction merge", () => {
  it("promotes explicit facts and records provenance", () => {
    const state = createInitialProjectState({
      id: "test",
      name: "CRM",
      rawIdea: "CRM",
    });
    const draft: InitialIdeaExtraction = {
      primaryUsers: [
        {
          value: "Sales team",
          confidence: "EXPLICIT",
          extractionReason: "Stated directly",
        },
      ],
      coreEntities: [],
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
    const result = mergeExtraction(state, draft);
    expect(result.state.targetUsers).toContain("Sales team");
    expect(result.state.provenance["user.Sales team"].source).toBe("USER");
  });

  it("keeps strong inference as an assumption", () => {
    const state = createInitialProjectState({
      id: "test",
      name: "CRM",
      rawIdea: "CRM",
    });
    const draft: InitialIdeaExtraction = {
      coreEntities: [
        {
          value: "Lead owner",
          confidence: "STRONGLY_INFERRED",
          extractionReason: "Follow-up history usually has an owner",
        },
      ],
      primaryUsers: [],
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
    const result = mergeExtraction(state, draft);
    expect(result.state.entities).toHaveLength(0);
    expect(result.state.assumptions[0]?.confidence).toBe("STRONGLY_INFERRED");
  });
});
