/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createInitialProjectState, deriveScreenMap } from "@rockfoundry/core";
import type { AiGateway } from "@rockfoundry/ai";
import { generateProjectDesign } from "./design";

function readyState() {
  const state = createInitialProjectState({ id: "design-test", name: "Kasir", rawIdea: "Kasir sederhana" });
  state.normalizedSummary = "A cashier app";
  state.targetUsers = ["cashiers"];
  state.objectives = ["process customer orders"];
  state.entities = ["orders"];
  state.workflows = ["create order"];
  state.features = ["order entry"];
  state.constraints = ["single location"];
  state.provenance = {
    "targetUsers.cashiers": { source: "USER", confidence: "EXPLICIT", evidence: "cashiers" },
    "objectives.process customer orders": { source: "USER", confidence: "EXPLICIT", evidence: "process customer orders" },
    "workflows.create order": { source: "USER", confidence: "EXPLICIT", evidence: "create order" },
    "constraints.single location": { source: "USER", confidence: "EXPLICIT", evidence: "single location" },
  };
  return state;
}

const saved = (state: ReturnType<typeof readyState>, version = 1) => ({ state, version });

function draftReadyState() {
  const state = createInitialProjectState({
    id: "draft-design-test",
    name: "Mobile Tailor",
    rawIdea: "Gua mau aplikasi tukang jahit keliling yang datang ke rumah",
  });
  state.objectives = ["book an at-home tailoring appointment"];
  state.normalizedSummary = "At-home mobile tailoring service";
  state.targetUsers = ["customer"];
  state.roles = ["verified tailor partner"];
  state.entities = ["appointment"];
  state.workflows = ["customer chooses a schedule and uploads clothing photos"];
  state.features = ["schedule selection", "clothing photo upload"];
  state.constraints = ["initial service area is South Jakarta"];
  state.openQuestions = ["Pricing and payment timing remain open."];
  state.assumptions = [
    {
      id: "assumption-service-area",
      statement: "The service starts in South Jakarta.",
      confidence: "STRONGLY_INFERRED",
      impact: "MEDIUM",
      source: "AGENT_INFERENCE",
      validationStrategy: "Confirm service area before implementation.",
      resolved: false,
    },
  ];
  state.provenance = {
    "targetUsers.customer": {
      source: "USER",
      confidence: "EXPLICIT",
      evidence: "customer",
    },
    "entities.appointment": {
      source: "USER",
      confidence: "EXPLICIT",
      evidence: "appointment",
    },
    "roles.verified tailor partner": {
      source: "USER",
      confidence: "EXPLICIT",
      evidence: "verified tailor partner",
    },
    "objectives.book an at-home tailoring appointment": {
      source: "USER",
      confidence: "EXPLICIT",
      evidence: "book an at-home tailoring appointment",
    },
    "workflows.customer chooses a schedule and uploads clothing photos": {
      source: "USER",
      confidence: "EXPLICIT",
      evidence: "customer chooses a schedule and uploads clothing photos",
    },
    "features.schedule selection": {
      source: "USER",
      confidence: "EXPLICIT",
      evidence: "schedule selection",
    },
    "features.clothing photo upload": {
      source: "USER",
      confidence: "EXPLICIT",
      evidence: "clothing photo upload",
    },
    "constraints.initial service area is South Jakarta": {
      source: "USER",
      confidence: "EXPLICIT",
      evidence: "initial service area is South Jakarta",
    },
  };
  state.draftSpecReady = true;
  state.readiness = "DRAFT_READY";
  return state;
}

const generatedFiles = [
  { path: "index.html", content: "<nav>Kasir</nav><main data-route=\"#/\"><h1>Kasir</h1><a href=\"#/records\">Records</a><button id=save>Simpan</button></main><main data-route=\"#/records\">Records</main>" },
  { path: "styles.css", content: "main { color: #111; } @media (max-width: 600px) { main { display: block; } }" },
  { path: "app.js", content: "document.querySelector('#save')?.addEventListener('click', () => {});" },
];

type DesignInputSnapshot = {
  confirmedTruth: {
    actors: string[];
    workflows: string[];
    scope: string[];
    constraints: string[];
    acceptedDecisions: unknown[];
  };
  designSignals: string[];
  [key: string]: unknown;
};

type DesignProductInput = Record<string, unknown> & {
  targetUsers: string[];
  roles: string[];
  entities: string[];
  workflows: string[];
  features: string[];
  decisions: unknown[];
  designInputSnapshot: DesignInputSnapshot;
};

type DesignArchitectureInput = {
  product: DesignProductInput;
  screenMap: unknown[];
};
type PrototypeInput = { product: DesignProductInput };
type QualityReviewInput = { productSummary: string };
type RepairInput = { product: DesignProductInput };

type ProductSummary = {
  targetUsers: string[];
  entities: string[];
  workflows: string[];
};

function realGateway(review: "PASS" | "REPAIR", repairFiles = generatedFiles) {
  return {
    runDesignArchitecture: vi.fn(async (_input: DesignArchitectureInput) => ({
      architecture: { designSpec: {
        productName: "Kasir", direction: { mood: "restrained" }, navigation: "sidebar", visualHierarchy: "clear", density: "comfortable",
        typography: "system", spacing: "4px", surfaces: "neutral", controls: "clear", responsive: "stack",
      }, summary: "Kasir workspace", assumptions: [] },
    })),
    runPrototypeGeneration: vi.fn(async (_input: PrototypeInput) => ({
      prototype: { summary: "Kasir prototype", assumptions: [], files: generatedFiles },
    })),
    runDesignQualityReview: vi.fn(async (_input: QualityReviewInput) => ({
      verdict: review, score: 92, assessments: [], improvements: [], blockingProblems: ["Improve hierarchy"],
    })),
    runPrototypeRepair: vi.fn(async (_input: RepairInput) => ({
      prototype: { summary: "Repaired kasir prototype", assumptions: [], files: repairFiles },
    })),
  };
}

type MockGateway = ReturnType<typeof realGateway>;

function deps(state: ReturnType<typeof readyState>, gateway?: MockGateway) {
  return {
    providerSettings: { mode: "mock" } as any,
    gateway: gateway as unknown as AiGateway,
    save: vi.fn(async (_id: string, next: typeof state, version?: number) => saved(next, (version ?? 0) + 1)),
    persist: vi.fn(async () => undefined),
  };
}

function realDeps(state: ReturnType<typeof readyState>, gateway: MockGateway) {
  return { ...deps(state, gateway), providerSettings: { mode: "openai-compatible" } as any };
}

function expectNoPersistence(injected: ReturnType<typeof deps>) {
  expect(injected.save).not.toHaveBeenCalled();
  expect(injected.persist).not.toHaveBeenCalled();
}

describe("generateProjectDesign executable review cases", () => {
  it("excludes inferred facts from every design provider input", async () => {
    const state = draftReadyState();
    state.studio.screenMap = deriveScreenMap(state);
    state.targetUsers.push("unconfirmed admin");
    state.entities.push("payout");
    state.features.push("payout automation");
    state.provenance["targetUsers.unconfirmed admin"] = {
      source: "AGENT_INFERENCE",
      confidence: "STRONGLY_INFERRED",
      evidence: "The idea may involve an admin.",
    };
    state.provenance["entities.payout"] = {
      source: "AGENT_INFERENCE",
      confidence: "STRONGLY_INFERRED",
      evidence: "The idea may involve payouts.",
    };
    state.provenance["features.payout automation"] = {
      source: "AGENT_INFERENCE",
      confidence: "STRONGLY_INFERRED",
      evidence: "The idea may involve payout automation.",
    };
    const gateway = realGateway("REPAIR");
    const injected = realDeps(state, gateway);

    await generateProjectDesign("draft-design-test", state, 2, undefined, injected);

    const architectureProduct = gateway.runDesignArchitecture.mock.calls[0]?.[0].product;
    const prototypeProduct = gateway.runPrototypeGeneration.mock.calls[0]?.[0].product;
    const repairProduct = gateway.runPrototypeRepair.mock.calls[0]?.[0].product;
    const qualitySummary = JSON.parse(
      gateway.runDesignQualityReview.mock.calls[0]?.[0].productSummary || "{}",
    ) as ProductSummary;
    for (const product of [architectureProduct, prototypeProduct, repairProduct]) {
      expect(product.targetUsers).toEqual(["customer"]);
      expect(product.roles).toEqual(["verified tailor partner"]);
      expect(product.entities).toEqual(["appointment"]);
      expect(product.features).toEqual(["schedule selection", "clothing photo upload"]);
      expect(product.designInputSnapshot.confirmedTruth.actors).toEqual([
        "customer",
        "verified tailor partner",
      ]);
    }
    expect(qualitySummary.targetUsers).toEqual(["customer"]);
    expect(qualitySummary.entities).toEqual(["appointment"]);
    expect(qualitySummary.workflows).toEqual([
      "customer chooses a schedule and uploads clothing photos",
    ]);
  });

  it("runs the mock generation pipeline and persists the result", async () => {
    const state = readyState();
    const injected = deps(state);
    const result = await generateProjectDesign("design-test", state, 3, undefined, injected);
    expect(result.generated.files.map((file) => file.path)).toEqual(["index.html", "styles.css", "app.js"]);
    expect(injected.save).toHaveBeenCalled();
    expect(injected.persist).toHaveBeenCalled();
  });

  it("generates from a draft-ready state without BUILD_READY or a product package", async () => {
    const state = draftReadyState();
    const gateway = realGateway("PASS");
    const injected = realDeps(state, gateway);

    const result = await generateProjectDesign(
      "draft-design-test",
      state,
      2,
      undefined,
      injected,
    );

    expect(result.generated.files.map((file) => file.path)).toEqual([
      "index.html",
      "styles.css",
      "app.js",
    ]);
    expect(gateway.runDesignArchitecture).toHaveBeenCalledTimes(1);
    const architectureInput = gateway.runDesignArchitecture.mock.calls[0]?.[0];
    if (!architectureInput) throw new Error("Architecture input was not captured.");
    expect(architectureInput.product.designInputSnapshot).toMatchObject({
      confirmedTruth: {
        actors: ["customer", "verified tailor partner"],
        workflows: [
          "customer chooses a schedule and uploads clothing photos",
        ],
        scope: ["schedule selection", "clothing photo upload"],
        constraints: ["initial service area is South Jakarta"],
        acceptedDecisions: [],
      },
      draftSpec: {
        productName: "Mobile Tailor",
        summary: "At-home mobile tailoring service",
      },
      labeled: {
        assumptions: ["The service starts in South Jakarta."],
        proposals: [],
        openQuestions: ["Pricing and payment timing remain open."],
      },
    });
    expect(architectureInput.product.designInputSnapshot.designSignals).toEqual(
      [],
    );
    expect(injected.save).toHaveBeenCalled();
    expect(injected.persist).toHaveBeenCalled();
  });

  it("generates when the persisted draft-ready flag is explicit on a partial state", async () => {
    const state = createInitialProjectState({
      id: "explicit-draft-ready",
      name: "Kasir",
      rawIdea: "Kasir sederhana",
    });
    state.normalizedSummary = "A simple cashier app";
    state.targetUsers = ["cashier"];
    state.draftSpecReady = true;
    const gateway = realGateway("PASS");
    const injected = realDeps(state, gateway);

    const result = await generateProjectDesign(
      "explicit-draft-ready",
      state,
      1,
      undefined,
      injected,
    );

    expect(result.generated.files.map((file) => file.path)).toEqual([
      "index.html",
      "styles.css",
      "app.js",
    ]);
    expect(gateway.runDesignArchitecture).toHaveBeenCalledTimes(1);
    expect(injected.save).toHaveBeenCalled();
  });

  it("blocks a non-draft-ready partial project before invoking generation", async () => {
    const state = createInitialProjectState({
      id: "partial-design-test",
      name: "Kasir",
      rawIdea: "Kasir sederhana",
    });
    state.targetUsers = ["cashier"];
    const injected = deps(state);

    await expect(
      generateProjectDesign("partial-design-test", state, 1, undefined, injected),
    ).rejects.toThrow("DESIGN_BLOCKED");
    expectNoPersistence(injected);
  });

  it("blocks a design-ready project when draft specification maturity is incomplete", async () => {
    const state = createInitialProjectState({
      id: "design-ready-incomplete-draft",
      name: "Kasir",
      rawIdea: "Kasir sederhana",
    });
    state.targetUsers = ["cashier"];
    state.entities = ["orders"];
    state.workflows = ["create order"];
    state.decisions = [{
      id: "scope",
      topic: "scope",
      decision: "single location",
      source: "USER",
      confidence: "EXPLICIT",
      status: "ACCEPTED",
      affects: [],
    }];
    const gateway = realGateway("PASS");
    const injected = realDeps(state, gateway);

    await expect(
      generateProjectDesign("design-ready-incomplete-draft", state, 1, undefined, injected),
    ).rejects.toThrow("DESIGN_BLOCKED");
    expect(gateway.runDesignArchitecture).not.toHaveBeenCalled();
    expect(gateway.runPrototypeGeneration).not.toHaveBeenCalled();
    expectNoPersistence(injected);
  });

  it("accepts a provider PASS and records quality metadata", async () => {
    const state = readyState();
    const gateway = realGateway("PASS");
    const injected = realDeps(state, gateway);
    const result = await generateProjectDesign("design-test", state, 1, undefined, injected);
    expect(result.generated.files).toEqual(generatedFiles);
    expect(gateway.runDesignQualityReview).toHaveBeenCalledTimes(1);
    expect(gateway.runPrototypeRepair).not.toHaveBeenCalled();
    expect(injected.save).toHaveBeenCalledTimes(3);
    expect(injected.persist).toHaveBeenCalledTimes(1);
    const metadataSave = injected.save.mock.calls[2][1];
    expect(metadataSave.generationMetadata.designQualityReview).toMatchObject({ verdict: "PASS", score: 92 });
    expect(metadataSave.generationMetadata.repairAttempted).toBe(false);
    expect(metadataSave.generationMetadata.finalDesignStatus).toBe("IN_REVIEW");
  });

  it("repairs a provider REPAIR exactly once and persists the repaired output", async () => {
    const state = readyState();
    const repairedFiles = generatedFiles.map((file) => ({ ...file, content: `${file.content} repaired` }));
    const gateway = realGateway("REPAIR", repairedFiles);
    const injected = realDeps(state, gateway);
    const result = await generateProjectDesign("design-test", state, 1, undefined, injected);
    expect(result.generated.files).toEqual(repairedFiles);
    expect(gateway.runPrototypeRepair).toHaveBeenCalledTimes(1);
    expect(injected.persist).toHaveBeenCalledTimes(1);
    const metadataSave = injected.save.mock.calls[2][1];
    expect(metadataSave.generationMetadata.designQualityReview).toMatchObject({ verdict: "REPAIR" });
    expect(metadataSave.generationMetadata.repairAttempted).toBe(true);
    expect(metadataSave.generationMetadata.finalDesignStatus).toBe("NEEDS_REVIEW");
  });

  it("keeps the generated prototype and marks NEEDS_REVIEW when repair fails", async () => {
    const state = readyState();
    const gateway = realGateway("REPAIR");
    gateway.runPrototypeRepair.mockRejectedValueOnce(new Error("repair unavailable"));
    const injected = realDeps(state, gateway);
    const result = await generateProjectDesign("design-test", state, 1, undefined, injected);
    expect(result.generated.files).toEqual(generatedFiles);
    expect(gateway.runPrototypeRepair).toHaveBeenCalledTimes(1);
    expect(injected.save).toHaveBeenCalledTimes(3);
    expect(injected.persist).toHaveBeenCalledTimes(1);
    const metadataSave = injected.save.mock.calls[2][1];
    expect(metadataSave.generationMetadata.designQualityReview).toMatchObject({ verdict: "REPAIR", score: 92 });
    expect(metadataSave.generationMetadata.repairAttempted).toBe(true);
    expect(metadataSave.generationMetadata.finalDesignStatus).toBe("NEEDS_REVIEW");
  });

  it("blocks an unsafe provider prototype before saving", async () => {
    const state = readyState();
    const gateway = realGateway("PASS");
    gateway.runPrototypeGeneration.mockResolvedValueOnce({ prototype: { summary: "x", assumptions: [], files: [
      { path: "index.html", content: "<main><h1>Kasir</h1></main>" },
      { path: "styles.css", content: "main{}" },
      { path: "app.js", content: "fetch('/api/secret')" },
    ] } });
    const injected = { ...deps(state, gateway), providerSettings: { mode: "openai-compatible" } as any };
    await expect(generateProjectDesign("design-test", state, 1, undefined, injected)).rejects.toMatchObject({
      task: "prototype_validation",
    });
    expectNoPersistence(injected);
    expect(gateway.runDesignQualityReview).not.toHaveBeenCalled();
    expect(gateway.runPrototypeRepair).not.toHaveBeenCalled();
  });

  it("does not persist when the provider quality reviewer fails", async () => {
    const state = readyState();
    const gateway = realGateway("PASS");
    gateway.runDesignQualityReview.mockRejectedValueOnce(new Error("review unavailable"));
    const injected = realDeps(state, gateway);
    await expect(generateProjectDesign("design-test", state, 1, undefined, injected)).rejects.toMatchObject({ task: "quality_review" });
    expectNoPersistence(injected);
    expect(gateway.runDesignQualityReview).toHaveBeenCalledTimes(1);
    expect(gateway.runPrototypeRepair).not.toHaveBeenCalled();
  });

  it("persists final review metadata after a successful repair", async () => {
    const state = readyState();
    const repairedFiles = [
      { path: "index.html", content: `<nav><a href="#/">Kasir</a><a href="#/records">Records</a></nav><main data-route="#/"><section><h1>Kasir</h1><h2>Pesanan</h2><p>Kelola pesanan aktif.</p><button id="save">Simpan</button><input aria-label="Cari pesanan" /></section></main><main data-route="#/records">Records</main>` },
      { path: "styles.css", content: `:root{font-family:system-ui}main{display:flex;gap:24px}h1{font-size:32px;font-weight:700;line-height:1.2}button,input{padding:8px;border:1px solid #bbb;color:#111}@media(max-width:600px){main{display:block}}` },
      { path: "app.js", content: `document.querySelector('#save')?.addEventListener('click',()=>{});` },
    ];
    const gateway = realGateway("REPAIR", repairedFiles);
    const injected = realDeps(state, gateway);
    await generateProjectDesign("design-test", state, 7, undefined, injected);
    const metadataSave = injected.save.mock.calls[2][1];
    expect(metadataSave.generationMetadata).toMatchObject({
      designQualityReview: { verdict: "REPAIR", score: 92 },
      repairAttempted: true,
      finalDesignStatus: "NEEDS_REVIEW",
    });
  });

  it("uses the deterministic baseline when design architecture times out", async () => {
    const state = readyState();
    const gateway = realGateway("PASS");
    gateway.runDesignArchitecture.mockRejectedValueOnce(
      Object.assign(new Error("timeout after 120000ms"), { name: "TimeoutError" }),
    );
    const injected = realDeps(state, gateway);
    const result = await generateProjectDesign("design-test", state, 1, undefined, injected);
    expect(result.architectureResolution).toMatchObject({ source: "BASELINE_FALLBACK", failure: { category: "TIMEOUT" } });
    expect(gateway.runPrototypeGeneration).toHaveBeenCalledWith(expect.objectContaining({
      architecture: expect.objectContaining({ designSpec: result.generated.designSpec }),
    }));
    const fallbackSave = injected.save.mock.calls[1][1];
    expect(fallbackSave.generationMetadata.designArchitecture).toMatchObject({
      source: "BASELINE_FALLBACK", failureCategory: "TIMEOUT",
    });
  });
});

it("rejects a blocked project before invoking generation", async () => {
  const state = createInitialProjectState({ id: "blocked", name: "", rawIdea: "" });
  const injected = deps(state);
  await expect(generateProjectDesign("blocked", state, 1, undefined, injected)).rejects.toThrow("DESIGN_BLOCKED");
  expect(injected.save).not.toHaveBeenCalled();
});
