import { describe, it, expect } from "vitest";
import { ProjectState } from "../schema";
import { InitialIdeaExtraction } from "../ai/schema";
import { mergeExtraction } from "../ai/merger";

describe("AI Deterministic Merger", () => {
  const getEmptyState = (): ProjectState => ({
    id: "test", name: "test", rawIdea: "test", targetUsers: [], entities: [], features: [], objectives: [], constraints: [], integrations: [], references: [], assumptions: [], decisions: [], openQuestions: [], risks: [], readiness: "IDEA_READY", contradictions: [], generationMetadata: {}
  });

  it("merges explicit facts into arrays", () => {
    const state = getEmptyState();
    const draft: InitialIdeaExtraction = {
      primaryUsers: [{ value: "Doctor", confidence: "EXPLICIT", extractionReason: "Stated directly" }],
      userProblems: [], objectives: [], proposedCapabilities: [], coreEntities: [], expectedWorkflows: [], integrationsMentioned: [], platforms: [], privacySignals: [], scaleSignals: [], designSignals: [], constraints: [], assumptions: [], ambiguities: [], possibleContradictions: [], unsupportedClaims: []
    };

    const result = mergeExtraction(state, draft);
    expect(result.state.targetUsers).toContain("Doctor");
    expect(result.appliedChanges.length).toBe(1);
    expect(result.assumptionsCreated).toBe(0);
  });

  it("converts strong inferences to assumptions", () => {
    const state = getEmptyState();
    const draft: InitialIdeaExtraction = {
      coreEntities: [{ value: "Prescription", confidence: "STRONGLY_INFERRED", extractionReason: "Doctors issue prescriptions" }],
      primaryUsers: [], userProblems: [], objectives: [], proposedCapabilities: [], expectedWorkflows: [], integrationsMentioned: [], platforms: [], privacySignals: [], scaleSignals: [], designSignals: [], constraints: [], assumptions: [], ambiguities: [], possibleContradictions: [], unsupportedClaims: []
    };

    const result = mergeExtraction(state, draft);
    expect(result.state.entities.length).toBe(0); // Should NOT add to entities directly
    expect(result.state.assumptions.length).toBe(1);
    expect(result.state.assumptions[0].statement).toContain("Prescription");
    expect(result.assumptionsCreated).toBe(1);
  });

  it("converts weak inferences to open questions", () => {
    const state = getEmptyState();
    const draft: InitialIdeaExtraction = {
      coreEntities: [{ value: "Insurance", confidence: "WEAKLY_INFERRED", extractionReason: "Might need it" }],
      primaryUsers: [], userProblems: [], objectives: [], proposedCapabilities: [], expectedWorkflows: [], integrationsMentioned: [], platforms: [], privacySignals: [], scaleSignals: [], designSignals: [], constraints: [], assumptions: [], ambiguities: [], possibleContradictions: [], unsupportedClaims: []
    };

    const result = mergeExtraction(state, draft);
    expect(result.state.entities.length).toBe(0);
    expect(result.state.openQuestions.length).toBe(1);
    expect(result.state.openQuestions[0]).toContain("Insurance");
    expect(result.questionsCreated).toBe(1);
  });
});
