import { describe, expect, it } from "vitest";
import {
  createInitialProjectState,
  detectContradictions,
  detectDiscoveryDomain,
  evaluateDecisionDebt,
  QuestionEngine,
  recordDecision,
  scoreDiscoveryDomains,
} from "../index";

function seed(rawIdea: string, extras: Partial<ReturnType<typeof createInitialProjectState>> = {}) {
  const state = createInitialProjectState({
    id: "p1",
    name: extras.name || "Test Project",
    rawIdea,
  });
  Object.assign(state, extras);
  return state;
}

describe("STRONG DEMO P1 — domain scoring", () => {
  it("keeps CRM golden ideas on CRM", () => {
    const state = seed(
      "CRM for 5 marble brands with sales per brand, leads, quotations, and an owner who sees all.",
      {
        entities: ["Customer", "Lead", "Quotation", "Brand"],
        targetUsers: ["Sales", "Owner"],
      },
    );
    expect(detectDiscoveryDomain(state)).toBe("CRM");
    expect(scoreDiscoveryDomains(state).CRM).toBeGreaterThan(
      scoreDiscoveryDomains(state).INVENTORY,
    );
  });

  it("does not misroute slab inventory to CRM just because quotation appears", () => {
    const state = seed(
      "Multi-warehouse marble inventory tracking slabs, stock movements, and reserve for quotation before leaving the warehouse.",
      {
        name: "Slab Inventory",
        entities: ["Warehouse", "Slab", "Stock movement"],
        features: ["Reserve slab for quotation", "Transfer between warehouses"],
        workflows: ["Reserve inventory", "Transfer stock"],
      },
    );
    expect(detectDiscoveryDomain(state)).toBe("INVENTORY");
    const scores = scoreDiscoveryDomains(state);
    expect(scores.INVENTORY).toBeGreaterThan(scores.CRM);
  });

  it("keeps multi-branch rental on RENTAL even with customer history language", () => {
    const state = seed(
      "Rental car booking for 3 branches with vehicle transfers and customer history.",
      {
        entities: ["Vehicle", "Booking", "Branch", "Customer"],
      },
    );
    expect(detectDiscoveryDomain(state)).toBe("RENTAL");
  });

  it("falls to GENERAL for clinic ideas outside beachheads", () => {
    const state = seed(
      "Sistem operasional klinik gigi dengan beberapa cabang, janji temu pasien, rekam medis, dan staf dokter.",
      {
        name: "Sistem Operasional Klinik Gigi Dengan Beberapa",
        entities: ["Patient", "Appointment", "Clinic"],
        targetUsers: ["Doctor", "Receptionist"],
      },
    );
    expect(detectDiscoveryDomain(state)).toBe("GENERAL");
  });
});

describe("STRONG DEMO P1 — Decision Debt residual honesty", () => {
  it("does not claim 0/100 LOW after CRM queue while artifact sections remain open", () => {
    let state = seed(
      "Build a CRM for five brands with sales and quotations",
      {
        name: "Brand CRM",
        entities: ["Customer", "Lead", "Quotation", "Brand"],
        targetUsers: ["Sales", "Owner"],
        features: ["Track leads", "Manage quotations"],
        workflows: ["Capture lead"],
      },
    );
    const before = evaluateDecisionDebt(state);
    expect(before.score).toBeGreaterThanOrEqual(40);

    for (const [topic, decision] of [
      ["customer_identity", "company_wide"],
      ["sales_visibility", "owner_all_sales_brand_scoped"],
      ["lead_ownership", "owning_brand_sales"],
      ["quotation_branding", "brand_owned"],
      ["duplicate_handling", "flag_for_review"],
    ] as const) {
      ({ state } = recordDecision(state, {
        topic,
        decision,
        affects: [topic],
      }));
    }

    const after = evaluateDecisionDebt(state);
    expect(after.score).toBeLessThan(before.score);
    expect(after.unresolvedHighRiskCount).toBe(0);
    expect(after.unresolvedArtifactSectionCount).toBeGreaterThan(0);
    expect(after.score).toBeGreaterThan(0);
    expect(after.inventionRisk).not.toBe("LOW");
    expect(after.summary.toLowerCase()).toMatch(/artifact|invention|unresolved/);
  });
});

describe("STRONG DEMO P1 — decision revision", () => {
  it("supersedes the previous accepted decision when the same topic is re-answered", () => {
    let state = seed("CRM for five marble brands with sales teams.", {
      entities: ["Customer", "Brand"],
    });
    ({ state } = recordDecision(state, {
      topic: "customer_identity",
      decision: "unit_specific",
      affects: ["customer model"],
    }));
    const firstId = state.decisions.find(
      (item) => item.topic === "customer_identity" && item.status === "ACCEPTED",
    )?.id;
    expect(firstId).toBeTruthy();

    const engine = new QuestionEngine();
    const revision = engine.generateRevisionQuestion(state, "customer_identity");
    expect(revision).toBeTruthy();
    expect(revision?.id).toBe("crm-customer-identity");

    const processed = engine.processAnswer(
      state,
      revision!.id,
      "company_wide",
      revision!,
    );
    const accepted = processed.updatedState.decisions.filter(
      (item) =>
        item.topic === "customer_identity" && item.status === "ACCEPTED",
    );
    const superseded = processed.updatedState.decisions.filter(
      (item) =>
        item.topic === "customer_identity" && item.status === "SUPERSEDED",
    );
    expect(accepted).toHaveLength(1);
    expect(accepted[0].decision).toMatch(/company_wide|one customer|shared/i);
    expect(superseded.length).toBeGreaterThanOrEqual(1);
    expect(accepted[0].supersedes).toBe(firstId);
  });

  it("resolveQuestion still finds a decided topic for revision answers", () => {
    let state = seed("CRM for five brands with quotations.", {
      entities: ["Customer", "Quotation", "Brand"],
    });
    ({ state } = recordDecision(state, {
      topic: "customer_identity",
      decision: "company_wide",
    }));
    const engine = new QuestionEngine();
    const resolved = engine.resolveQuestion(state, "crm-customer-identity");
    expect(resolved?.topic).toBe("customer_identity");
  });
});

describe("STRONG DEMO P1 — GENERAL question quality", () => {
  it("does not paste raw Indonesian project names into broken English", () => {
    const state = seed(
      "Sistem operasional klinik gigi dengan beberapa cabang dan rekam medis pasien.",
      {
        name: "Sistem Operasional Klinik Gigi Dengan Beberapa",
        entities: ["Patient", "Appointment"],
        targetUsers: ["Doctor", "Staff"],
      },
    );
    expect(detectDiscoveryDomain(state)).toBe("GENERAL");
    const engine = new QuestionEngine();
    const questions = engine.generateQuestions(state, [], 3);
    expect(questions.length).toBeGreaterThan(0);
    for (const question of questions) {
      expect(question.text).not.toMatch(
        /uses Sistem Operasional Klinik Gigi Dengan Beberapa with a/i,
      );
      expect(question.text).not.toMatch(/When someone uses .+ with a record/i);
      expect(question.text.length).toBeGreaterThan(20);
    }
    const primary = questions.find((item) => item.topic === "primary_workflow");
    expect(primary?.text.toLowerCase()).toContain("first");
    expect(primary?.text.toLowerCase()).toContain("outcome");
  });
});

describe("STRONG DEMO P1 — contradiction coverage", () => {
  it("flags shared sales pool against brand-scoped visibility", () => {
    let state = seed("CRM for five brands.");
    ({ state } = recordDecision(state, {
      topic: "lead_ownership",
      decision: "shared_sales_pool",
    }));
    ({ state } = recordDecision(state, {
      topic: "sales_visibility",
      decision: "owner_all_sales_brand_scoped",
    }));
    const found = detectContradictions(state);
    expect(
      found.some(
        (item) => item.id === "crm-shared-pool-vs-brand-scoped-visibility",
      ),
    ).toBe(true);
  });
});
