import { describe, it, expect } from "vitest";
import { 
  ProjectState, 
  RequirementsEngine, 
  RequirementNode, 
  detectContradictions,
  QuestionEngine,
  generateExport,
  evaluateReadiness
} from "../index";

const mockNodes: RequirementNode[] = [
  {
    id: "req-auth-type",
    category: "USERS",
    title: "Authentication Type",
    description: "Determine primary auth mechanism",
    appliesWhen: (state: ProjectState) => state.targetUsers.length > 0,
    priority: 10,
    riskWeight: 8,
    status: "UNRESOLVED",
    source: "SYSTEM",
    dependencies: [],
    confidence: 0
  },
  {
    id: "req-db-type",
    category: "DATA",
    title: "Database Architecture",
    description: "Determine relational vs document schema",
    appliesWhen: (state: ProjectState) => state.entities.length > 0,
    priority: 9,
    riskWeight: 9,
    status: "UNRESOLVED",
    source: "SYSTEM",
    dependencies: [],
    confidence: 0
  }
];

describe("Requirements Engine", () => {
  it("determines applicable nodes and readiness score", () => {
    const engine = new RequirementsEngine(mockNodes);
    
    const state: ProjectState = {
      id: "test-1",
      name: "SaaS App",
      rawIdea: "A SaaS app for dentists",
      targetUsers: ["Dentists", "Receptionists"],
      entities: ["Appointments", "Patients"],
      features: [],
      objectives: [],
      constraints: [],
      integrations: [],
      references: [],
      assumptions: [],
      decisions: [],
      openQuestions: [],
      risks: [],
      readiness: "IDEA_READY",
      contradictions: [],
      generationMetadata: {}
    };

    const graph = engine.evaluate(state);
    expect(graph.applicableNodes.length).toBe(2);
    expect(graph.overallReadinessScore).toBe(0);
    expect(graph.completionByCategory["USERS"]).toBe(0);
  });
});

describe("Contradiction Detection", () => {
  it("detects internal vs public registration conflicts", () => {
    const state: ProjectState = {
      id: "test-2",
      name: "Bad App",
      rawIdea: "An internal app with public signup",
      targetUsers: ["Internal Employees"],
      features: ["Public registration"],
      entities: [],
      objectives: [],
      constraints: [],
      integrations: [],
      references: [],
      assumptions: [],
      decisions: [],
      openQuestions: [],
      risks: [],
      readiness: "IDEA_READY",
      contradictions: [],
      generationMetadata: {}
    };

    const conflicts = detectContradictions(state);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].id).toBe("internal-vs-public");
  });
});

describe("Question Engine", () => {
  it("rejects generic or overly technical questions", () => {
    const qEngine = new QuestionEngine();
    const state: ProjectState = {
      id: "test", name: "test", rawIdea: "test", targetUsers: ["Users"], entities: ["Records"], features: [], objectives: [], constraints: [], integrations: [], references: [], assumptions: [], decisions: [], openQuestions: [], risks: [], readiness: "IDEA_READY", contradictions: [], generationMetadata: {}
    };

    const questions = qEngine.generateQuestions(state, mockNodes, 2);
    expect(questions.length).toBe(2);
    
    // Check that we don't have technical jargon like PostgreSQL, MySQL, MongoDB, Relational, Document
    const dbQuestion = questions.find(q => q.id === "q-req-db-type")!;
    expect(dbQuestion.text.toLowerCase()).not.toContain("relational database");
    expect(dbQuestion.text.toLowerCase()).not.toContain("document database");
    expect(dbQuestion.text.toLowerCase()).not.toContain("postgresql");

    // Check auth question
    const authQuestion = questions.find(q => q.id === "q-req-auth-type")!;
    expect(authQuestion.text.toLowerCase()).not.toContain("oauth"); // internal ID might be oauth but text shouldn't say "OAuth" as jargon unless explained
    expect(authQuestion.options?.find(o => o.id === "oauth")?.label).not.toContain("OAuth");
  });
});

describe("Deterministic Export", () => {
  it("generates markdown strings", async () => {
    const state: ProjectState = {
      id: "test-4",
      name: "App",
      rawIdea: "Idea text",
      targetUsers: [],
      entities: [],
      features: ["Cool feature"],
      objectives: [],
      constraints: [],
      integrations: [],
      references: [],
      assumptions: [],
      decisions: [{
        id: "d1",
        title: "Use Postgres",
        description: "DB choice",
        rationale: "Relational data",
        status: "ACCEPTED"
      }],
      openQuestions: [],
      risks: [],
      readiness: "MVP_READY",
      contradictions: [],
      generationMetadata: {}
    };

    const exports = await generateExport(state);
    expect(exports.buffer).toBeDefined();
    expect(exports.metadata.fileCount).toBeGreaterThan(0);
  });
});
