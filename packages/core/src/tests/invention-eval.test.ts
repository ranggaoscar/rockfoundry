import { describe, expect, it } from "vitest";
import {
  CRM_GOLDEN_IDEAS,
  answerCrmQueue,
  createInitialProjectState,
  deriveProjectTitle,
  evaluateInventionRisk,
  formatInventionBenchmarkReport,
  renderArtifacts,
  runCrmInventionBenchmark,
} from "../index";

describe("coding-agent invention harness", () => {
  it("scores raw multi-brand CRM ideas as high invention pressure", () => {
    const state = createInitialProjectState({
      id: "raw",
      name: "5-Brand Marble CRM",
      rawIdea: CRM_GOLDEN_IDEAS[0].rawIdea,
    });
    state.entities = ["Customer", "Brand"];
    const result = evaluateInventionRisk(state);

    expect(result.withoutHandoff.mustInventCount).toBeGreaterThanOrEqual(4);
    expect(result.withHandoff.constrainedCount).toBe(0);
    expect(result.withHandoff.explicitOpenCount).toBeGreaterThan(0);
  });

  it("reduces invention pressure after the CRM queue is answered", () => {
    const seeded = createInitialProjectState({
      id: "answered",
      name: deriveProjectTitle(CRM_GOLDEN_IDEAS[0].rawIdea),
      rawIdea: CRM_GOLDEN_IDEAS[0].rawIdea,
    });
    seeded.targetUsers = ["Sales", "Owner"];
    seeded.entities = ["Customer", "Lead", "Quotation", "Brand"];
    seeded.features = ["Leads", "Quotations"];
    seeded.workflows = ["Capture lead"];

    const answered = answerCrmQueue(seeded);
    const result = evaluateInventionRisk(answered.state);

    expect(answered.answeredTopics.length).toBe(5);
    expect(result.withHandoff.constrainedCount).toBe(5);
    expect(result.withHandoff.mustInventCount).toBe(0);
    expect(result.reduction.wins).toBe(true);
    expect(result.reduction.weightedScoreDelta).toBeGreaterThan(0);
  });

  it("passes the week-3 exit check on golden CRM fixtures (≥3/5 wins)", () => {
    const benchmark = runCrmInventionBenchmark();
    expect(benchmark.total).toBe(5);
    expect(benchmark.winCount).toBeGreaterThanOrEqual(3);
    expect(benchmark.passesExitCheck).toBe(true);
    expect(formatInventionBenchmarkReport(benchmark)).toContain("PASS");
  });

  it("fills known PRD/ERD sections from decisions instead of leaving everything unresolved", () => {
    const seeded = createInitialProjectState({
      id: "docs",
      name: "CRM",
      rawIdea: CRM_GOLDEN_IDEAS[0].rawIdea,
    });
    seeded.entities = ["Customer", "Lead", "Quotation", "Brand"];
    seeded.features = ["Leads"];
    seeded.workflows = ["Capture lead"];
    const answered = answerCrmQueue(seeded);
    const docs = renderArtifacts(answered.state);

    expect(docs.PRD).toMatch(/Salespeople can access only their brand/i);
    expect(docs.PRD).toMatch(/Non-Goals/i);
    expect(docs.ERD).toMatch(/Customer 1—\* Lead|Customer 1-\* Lead|Customer/);
    expect(docs.ERD).not.toMatch(
      /## 6\. Data Ownership\n\n\[UNRESOLVED\]/,
    );
    expect(docs.AGENT_HANDOFF).toMatch(/Claude Code|Codex|Cursor/);
    expect(docs.DO_NOT_INVENT).toMatch(/Do not invent/i);
  });
});
