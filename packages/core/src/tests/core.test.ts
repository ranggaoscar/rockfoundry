import { describe, expect, it } from "vitest";
import {
  createInitialProjectState,
  detectContradictions,
  generateExport,
  QuestionEngine,
  RequirementsEngine,
  type ProjectState,
  type RequirementNode,
} from "../index";

function state(overrides: Partial<ProjectState> = {}): ProjectState {
  return Object.assign(
    createInitialProjectState({
      id: "test",
      name: "Test project",
      rawIdea: "Build a tool",
    }),
    overrides,
  );
}

const nodes: RequirementNode[] = [
  {
    id: "roles",
    category: "USERS",
    title: "Roles",
    description: "Who can do which work",
    priority: 10,
    riskWeight: 8,
    status: "UNRESOLVED",
    source: "SYSTEM",
    dependencies: [],
    confidence: 0,
  },
  {
    id: "data",
    category: "DATA",
    title: "Data relationships",
    description: "How business records connect",
    priority: 9,
    riskWeight: 9,
    status: "UNRESOLVED",
    source: "SYSTEM",
    dependencies: [],
    confidence: 0,
  },
];

describe("Agentic core state", () => {
  it("evaluates unresolved requirements without inventing answers", () => {
    const graph = new RequirementsEngine(nodes).evaluate(
      state({ targetUsers: ["Sales team"], entities: ["Customer"] }),
    );
    expect(graph.applicableNodes).toHaveLength(2);
    expect(graph.overallReadinessScore).toBe(0);
  });

  it("detects internal access contradictions", () => {
    const conflicts = detectContradictions(
      state({
        targetUsers: ["Internal employees"],
        features: ["Public registration"],
      }),
    );
    expect(conflicts[0]?.id).toBe("internal-vs-public");
    expect(conflicts[0]?.status).toBe("OPEN");
  });

  it("asks a contextual question with project nouns", () => {
    const questions = new QuestionEngine().generateQuestions(
      state({
        name: "Marble CRM",
        targetUsers: ["Sales staff"],
        entities: ["Customer", "Quotation"],
      }),
      nodes,
      2,
    );
    expect(questions.length).toBeGreaterThan(0);
    expect(
      questions.some((question) =>
        /Marble CRM|Customer|Quotation|Sales staff/.test(question.text),
      ),
    ).toBe(true);
  });

  it("exports the anti-invention handoff package with primary docs", async () => {
    const result = await generateExport(
      state({
        features: ["Track quotations"],
        entities: ["Customer", "Quotation"],
      }),
    );
    expect(result.metadata.fileCount).toBe(10);
    expect(result.documents.BRD).toContain("# Business Requirements Document");
    expect(result.documents.PRD).toContain("## 22. Open Decisions");
    expect(result.documents.ERD).toContain("```mermaid");
    expect(result.documents.DO_NOT_INVENT).toContain("# DO NOT INVENT");
    expect(result.documents.AGENT_HANDOFF).toContain("Agent Handoff");
  });
});
