import { describe, expect, it } from "vitest";
import {
  createInitialProjectState,
  evaluateDraftSpecMaturity,
  evaluateReadinessDirectly,
} from "../index";

describe("Draft specification maturity", () => {
  it("does not treat inferred arrays or a high score as draft-ready", () => {
    const state = createInitialProjectState({
      id: "maturity-inferred",
      name: "Cashflow",
      rawIdea: "Build a cashflow application",
    });
    state.targetUsers = ["owner"];
    state.objectives = ["track cashflow"];
    state.workflows = ["record transactions"];
    state.features = ["transaction history"];
    state.entities = ["transaction"];
    state.roles = ["owner"];
    state.permissions = ["owner access"];
    state.integrations = ["none"];
    state.businessRules = ["balance cannot be negative"];

    const maturity = evaluateDraftSpecMaturity(state);
    const readiness = evaluateReadinessDirectly(state);

    expect(maturity.ready).toBe(false);
    expect(maturity.missing).toEqual(
      expect.arrayContaining([
        "primary actor",
        "core job",
        "core experience",
        "MVP boundary",
      ]),
    );
    expect(readiness.score).toBeGreaterThanOrEqual(38);
    expect(readiness.level).toBe("NOT_READY");
  });

  it("accepts explicit provenance without requiring build readiness", () => {
    const state = createInitialProjectState({
      id: "maturity-explicit",
      name: "Cashflow",
      rawIdea: "Build a cashflow application",
    });
    state.targetUsers = ["owner"];
    state.objectives = ["track cashflow"];
    state.workflows = ["record transactions"];
    state.constraints = ["MVP excludes approvals"];
    state.openQuestions = ["Should exports be included?"];
    state.provenance = {
      "targetUsers.owner": {
        source: "USER",
        confidence: "EXPLICIT",
        evidence: "owner",
      },
      "objectives.track cashflow": {
        source: "USER",
        confidence: "EXPLICIT",
        evidence: "track cashflow",
      },
      "workflows.record transactions": {
        source: "USER",
        confidence: "EXPLICIT",
        evidence: "record transactions",
      },
      "constraints.MVP excludes approvals": {
        source: "USER",
        confidence: "EXPLICIT",
        evidence: "MVP excludes approvals",
      },
    };

    const maturity = evaluateDraftSpecMaturity(state);
    const readiness = evaluateReadinessDirectly(state);

    expect(maturity).toEqual({ ready: true, missing: [] });
    expect(readiness.draftSpecReady).toBe(true);
    expect(readiness.level).not.toBe("BUILD_READY");
  });

  it("allows clearly labeled assumptions to cover draft gaps", () => {
    const state = createInitialProjectState({
      id: "maturity-assumptions",
      name: "Cashflow",
      rawIdea: "Build a cashflow application",
    });
    state.assumptions = [
      {
        id: "actor",
        statement: "Primary actor: owner",
        confidence: "STRONGLY_INFERRED",
        impact: "MEDIUM",
        source: "AGENT_INFERENCE",
        resolved: true,
      },
      {
        id: "job",
        statement: "Core job: record cashflow",
        confidence: "STRONGLY_INFERRED",
        impact: "MEDIUM",
        source: "AGENT_INFERENCE",
        resolved: true,
      },
      {
        id: "experience",
        statement: "Core experience: record and review transactions",
        confidence: "STRONGLY_INFERRED",
        impact: "MEDIUM",
        source: "AGENT_INFERENCE",
        resolved: true,
      },
      {
        id: "boundary",
        statement: "MVP boundary: exclude approvals",
        confidence: "STRONGLY_INFERRED",
        impact: "MEDIUM",
        source: "AGENT_INFERENCE",
        resolved: true,
      },
    ];

    expect(evaluateDraftSpecMaturity(state)).toEqual({ ready: true, missing: [] });
  });
  it("allows a becak product shape by turn four without unrelated requirements", () => {
    const state = createInitialProjectState({
      id: "becak-fourth-turn",
      name: "Becak Online",
      rawIdea: "Saya mau buat aplikasi becak online",
    });
    state.roles = ["driver becak"];
    state.entities = ["booking", "pangkalan becak"];
    state.objectives = ["booking perjalanan"];
    state.features = ["booking becak online"];
    state.workflows = ["penumpang booking becak"];
    state.constraints = ["satu kota dulu"];
    state.provenance = {
      "roles.driver becak": { source: "USER", confidence: "EXPLICIT", evidence: "driver becak" },
      "objectives.booking perjalanan": { source: "USER", confidence: "EXPLICIT", evidence: "booking perjalanan" },
      "features.booking becak online": { source: "USER", confidence: "EXPLICIT", evidence: "booking becak online" },
      "workflows.penumpang booking becak": { source: "USER", confidence: "EXPLICIT", evidence: "penumpang booking becak" },
      "constraints.satu kota dulu": { source: "USER", confidence: "EXPLICIT", evidence: "satu kota dulu" },
    };

    const readiness = evaluateReadinessDirectly(state);

    expect(readiness.draftSpecReady).toBe(true);
    expect(readiness.level).toBe("DRAFT_READY");
    expect(readiness.discovery.unresolvedTopics).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/timeout|cancellation|payment|rating|promo/i),
      ]),
    );
  });
});
