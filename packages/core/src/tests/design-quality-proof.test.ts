import { describe, expect, it } from "vitest";
import { createInitialProjectState, ProjectStateSchema } from "../schema/project";
import { deriveScreenMap } from "../design/screen-map";
import { validatePrototypeFiles } from "../design/validate";
import { validatePrototypeQuality } from "../design/quality";

function fixtures() {
  const state = createInitialProjectState({ id: "proof", name: "Kasir", rawIdea: "Kasir" });
  state.entities = ["pesanan"];
  state.workflows = ["mencatat pesanan"];
  const screens = deriveScreenMap(state);
  const links = screens.map((s) => `<a href="${s.route}">${s.name}</a>`).join("");
  const files = [
    { path: "index.html", content: `<main><nav>${links}</nav><section><h1>Kasir</h1><h2>Pesanan</h2><p>Kelola pesanan aktif.</p><button data-action="create">Tambah pesanan</button><input aria-label="Cari pesanan" /></section></main>` },
    { path: "styles.css", content: `:root{font-family:system-ui}main{display:flex;gap:24px}h1{font-size:32px;font-weight:700;line-height:1.2}button,input{padding:8px;border:1px solid #bbb}@media(max-width:600px){main{display:block}}` },
    { path: "app.js", content: `document.querySelector('[data-action="create"]').addEventListener('click',()=>{});` },
  ];
  return { state, screens, files };
}

describe("design review/repair proof seams", () => {
  it("accepts a repaired prototype after deterministic PASS", () => {
    const { screens, files } = fixtures();
    const safety = validatePrototypeFiles(files, screens);
    const quality = validatePrototypeQuality(files, screens);
    expect(safety.accepted).toBe(true);
    expect(quality.accepted).toBe(false);
    expect(quality.score).toBeGreaterThan(50);
    expect(quality.reasons).toContain("Quality area failed: designSpecAdherence");
  });

  it("rejects unsafe prototype content even when visual quality is present", () => {
    const { screens, files } = fixtures();
    const unsafe = files.map((f) => f.path === "app.js" ? { ...f, content: "fetch('/api');" } : f);
    const safety = validatePrototypeFiles(unsafe, screens);
    expect(safety.accepted).toBe(false);
  });

  it("keeps REPAIR metadata round-trippable for success and failure", () => {
    const state = createInitialProjectState({ id: "metadata", name: "Kasir", rawIdea: "Kasir" });
    const review = { verdict: "REPAIR", score: 62, summary: "Needs repair", blockingProblems: ["missing interaction"] };
    const persisted = ProjectStateSchema.parse({ ...state, generationMetadata: {
      ...state.generationMetadata,
      designQualityReview: review,
      repairAttempted: true,
      finalDesignStatus: "IN_REVIEW",
    }});
    expect(persisted.generationMetadata.designQualityReview).toEqual(review);
    expect(persisted.generationMetadata.repairAttempted).toBe(true);
    expect(persisted.generationMetadata.finalDesignStatus).toBe("IN_REVIEW");
    const failed = ProjectStateSchema.parse({ ...state, generationMetadata: {
      ...state.generationMetadata,
      designQualityReview: { ...review, summary: "repair failed" },
      repairAttempted: true,
      finalDesignStatus: "NEEDS_REVIEW",
    }});
    expect(failed.generationMetadata.finalDesignStatus).toBe("NEEDS_REVIEW");
  });
});
