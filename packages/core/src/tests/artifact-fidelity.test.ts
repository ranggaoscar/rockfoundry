import { describe, expect, it } from "vitest";
import { createInitialProjectState } from "../schema";
import { recordDecision } from "../decision-graph";
import { renderArtifacts } from "../export/generator";

function baseState() {
  return createInitialProjectState({
    id: "artifact-fidelity",
    name: "Artifact fidelity",
    rawIdea: "A product with explicit canonical entities",
  });
}

describe("artifact fidelity", () => {
  it("renders known entities and accepted relationships as real Mermaid edges", () => {
    let state = baseState();
    state.entities = ["Customer", "Lead", "Quotation", "Brand"];
    ({ state } = recordDecision(state, {
      topic: "customer_identity",
      decision: "company_wide",
    }));
    ({ state } = recordDecision(state, {
      topic: "quotation_branding",
      decision: "brand_owned",
    }));

    const erd = renderArtifacts(state).ERD;

    expect(erd).toContain('Customer ||--o{ Lead : "relationship"');
    expect(erd).toContain('Lead }o--|| Brand : "relationship"');
    expect(erd).toContain('Quotation }o--|| Brand : "relationship"');
    expect(erd).toContain("### Lead");
    expect(erd).not.toContain("string id");
    expect(erd).toContain("[UNRESOLVED]");
  });

  it("does not synthesize missing relationship endpoints", () => {
    let state = baseState();
    state.entities = ["Customer", "Lead"];
    ({ state } = recordDecision(state, {
      topic: "customer_identity",
      decision: "company_wide",
    }));

    const erd = renderArtifacts(state).ERD;

    expect(erd).toContain("Customer ||--o{ Lead");
    expect(erd).not.toContain("Brand ||--o{ Customer");
    expect(erd).not.toContain("### Quotation");
    expect(erd).not.toMatch(/Quotation\s+[|}]/);
    expect(erd).not.toContain("UnresolvedEntity");
  });

  it("renders an explicit canonical relationship without inventing fields", () => {
    const state = baseState();
    state.entities = ["Patient", "Appointment"];
    state.relationships = [
      {
        from: "Patient",
        to: "Appointment",
        cardinality: "ONE_TO_MANY",
        label: "books",
      },
    ];

    const erd = renderArtifacts(state).ERD;

    expect(erd).toContain('Patient ||--o{ Appointment : "books"');
    expect(erd).toContain("Patient 1—* Appointment (books)");
    expect(erd).toContain("No canonical field is explicit yet.");
    expect(erd).not.toMatch(/\| id \| string \| Yes \|/);
  });

  it("keeps an empty canonical data model unresolved instead of inventing an entity", () => {
    const state = baseState();
    const erd = renderArtifacts(state).ERD;

    expect(erd).toContain("No canonical entities are known yet.");
    expect(erd).toContain("No canonical relationships are known yet.");
    expect(erd).not.toContain("UnresolvedEntity");
    expect(erd).not.toContain("string id");
  });
});
