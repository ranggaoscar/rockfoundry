import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { createInitialProjectState } from "../schema";
import { generateExport, renderArtifacts } from "../export/generator";
import { recordDecision } from "../decision-graph";
import { evaluateDecisionDebt } from "../graph/decision-debt";

describe("Agentic artifact export", () => {
  it("creates the anti-invention handoff package at the export root", async () => {
    const state = createInitialProjectState({
      id: "1",
      name: "Test Project",
      rawIdea: "A multi-brand CRM for five marble brands",
    });
    const result = await generateExport(state);
    const zip = await JSZip.loadAsync(result.buffer);
    expect(zip.file("BRD.md")).toBeTruthy();
    expect(zip.file("PRD.md")).toBeTruthy();
    expect(zip.file("ERD.md")).toBeTruthy();
    expect(zip.file("DO_NOT_INVENT.md")).toBeTruthy();
    expect(zip.file("DECISIONS.md")).toBeTruthy();
    expect(zip.file("INVARIANTS.md")).toBeTruthy();
    expect(zip.file("READINESS.md")).toBeTruthy();
    expect(zip.file("AGENT_HANDOFF.md")).toBeTruthy();
    expect(zip.file("decisions.json")).toBeTruthy();
    expect(result.metadata.fileCount).toBe(9);
  });

  it("puts unresolved high-risk decisions into DO_NOT_INVENT", () => {
    const state = createInitialProjectState({
      id: "crm-1",
      name: "Marble CRM",
      rawIdea: "CRM for five marble brands with separate sales teams",
    });
    const docs = renderArtifacts(state);
    expect(docs.DO_NOT_INVENT).toContain("Do not invent");
    expect(docs.DO_NOT_INVENT.toLowerCase()).toContain("customer");
    expect(docs.AGENT_HANDOFF).toContain("DO_NOT_INVENT.md");
  });
});

describe("Decision Debt", () => {
  it("starts high for unresolved multi-brand CRM ideas and drops after decisions", () => {
    let state = createInitialProjectState({
      id: "crm-debt",
      name: "Brand CRM",
      rawIdea: "Build a CRM for five brands with sales and quotations",
    });
    const before = evaluateDecisionDebt(state);
    expect(before.score).toBeGreaterThanOrEqual(40);
    expect(["HIGH", "CRITICAL"]).toContain(before.inventionRisk);
    expect(before.topRisks.length).toBeGreaterThan(0);

    ({ state } = recordDecision(state, {
      topic: "customer_identity",
      decision: "company_wide",
      affects: ["customer model", "permissions"],
    }));
    ({ state } = recordDecision(state, {
      topic: "sales_visibility",
      decision: "owner_all_sales_brand_scoped",
      affects: ["sales permissions"],
    }));
    ({ state } = recordDecision(state, {
      topic: "lead_ownership",
      decision: "owning_brand_sales",
      affects: ["lead ownership"],
    }));
    ({ state } = recordDecision(state, {
      topic: "quotation_branding",
      decision: "brand_owned",
      affects: ["quotation ownership"],
    }));
    ({ state } = recordDecision(state, {
      topic: "duplicate_handling",
      decision: "flag_for_review",
      affects: ["duplicate detection"],
    }));

    const after = evaluateDecisionDebt(state);
    expect(after.score).toBeLessThan(before.score);
    expect(after.unresolvedHighRiskCount).toBe(0);
  });
});
