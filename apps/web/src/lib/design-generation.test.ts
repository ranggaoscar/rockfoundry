/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createInitialProjectState } from "@rockfoundry/core";
import type { AiGateway } from "@rockfoundry/ai";
import { DesignGenerationError, generateProjectDesign } from "./design";

function readyState() {
  const state = createInitialProjectState({ id: "design-test", name: "Kasir", rawIdea: "Kasir sederhana" });
  state.normalizedSummary = "A cashier app";
  state.targetUsers = ["cashiers"];
  state.entities = ["orders"];
  state.workflows = ["create order"];
  state.features = ["order entry"];
  return state;
}

const saved = (state: ReturnType<typeof readyState>, version = 1) => ({ state, version });

const generatedFiles = [
  { path: "index.html", content: "<nav>Kasir</nav><main data-route=\"#/\"><h1>Kasir</h1><a href=\"#/records\">Records</a><button id=save>Simpan</button></main><main data-route=\"#/records\">Records</main>" },
  { path: "styles.css", content: "main { color: #111; } @media (max-width: 600px) { main { display: block; } }" },
  { path: "app.js", content: "document.querySelector('#save')?.addEventListener('click', () => {});" },
];

function realGateway(review: "PASS" | "REPAIR", repairFiles = generatedFiles) {
  return {
    runDesignArchitecture: vi.fn(async () => ({
      architecture: { designSpec: {
        productName: "Kasir", direction: { mood: "restrained" }, navigation: "sidebar", visualHierarchy: "clear", density: "comfortable",
        typography: "system", spacing: "4px", surfaces: "neutral", controls: "clear", responsive: "stack",
      }, summary: "Kasir workspace", assumptions: [] },
    })),
    runPrototypeGeneration: vi.fn(async () => ({
      prototype: { summary: "Kasir prototype", assumptions: [], files: generatedFiles },
    })),
    runDesignQualityReview: vi.fn(async () => ({
      verdict: review, score: 92, assessments: [], improvements: [], blockingProblems: ["Improve hierarchy"],
    })),
    runPrototypeRepair: vi.fn(async () => ({
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
  it("runs the mock generation pipeline and persists the result", async () => {
    const state = readyState();
    const injected = deps(state);
    const result = await generateProjectDesign("design-test", state, 3, undefined, injected);
    expect(result.generated.files.map((file) => file.path)).toEqual(["index.html", "styles.css", "app.js"]);
    expect(injected.save).toHaveBeenCalled();
    expect(injected.persist).toHaveBeenCalled();
  });

  it("accepts a provider PASS and records quality metadata", async () => {
    const state = readyState();
    const gateway = realGateway("PASS");
    const injected = realDeps(state, gateway);
    const result = await generateProjectDesign("design-test", state, 1, undefined, injected);
    expect(result.generated.files).toEqual(generatedFiles);
    expect(gateway.runDesignQualityReview).toHaveBeenCalledTimes(1);
    expect(gateway.runPrototypeRepair).not.toHaveBeenCalled();
    expect(injected.save).toHaveBeenCalledTimes(2);
    expect(injected.persist).toHaveBeenCalledTimes(1);
    const metadataSave = injected.save.mock.calls[1][1];
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
    const metadataSave = injected.save.mock.calls[1][1];
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
    expect(injected.save).toHaveBeenCalledTimes(2);
    expect(injected.persist).toHaveBeenCalledTimes(1);
    const metadataSave = injected.save.mock.calls[1][1];
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
    await expect(generateProjectDesign("design-test", state, 1, undefined, injected)).rejects.toThrow("review unavailable");
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
    const metadataSave = injected.save.mock.calls[1][1];
    expect(metadataSave.generationMetadata).toMatchObject({
      designQualityReview: { verdict: "REPAIR", score: 92 },
      repairAttempted: true,
      finalDesignStatus: "NEEDS_REVIEW",
    });
  });

  it("surfaces provider architecture failure as a typed generation error", async () => {
    const state = readyState();
    const gateway = { runDesignArchitecture: vi.fn(async () => { throw new Error("provider unavailable"); }) } as unknown as MockGateway;
    const injected = { ...deps(state, gateway), providerSettings: { mode: "openai-compatible" } as any };
    await expect(generateProjectDesign("design-test", state, 1, undefined, injected)).rejects.toSatisfy(
      (error: unknown) => error instanceof DesignGenerationError && error.task === "design_architecture",
    );
    expectNoPersistence(injected);
    expect(gateway.runDesignArchitecture).toHaveBeenCalledTimes(1);
  });
});

it("rejects a blocked project before invoking generation", async () => {
  const state = createInitialProjectState({ id: "blocked", name: "", rawIdea: "" });
  const injected = deps(state);
  await expect(generateProjectDesign("blocked", state, 1, undefined, injected)).rejects.toThrow("DESIGN_BLOCKED");
  expect(injected.save).not.toHaveBeenCalled();
});
