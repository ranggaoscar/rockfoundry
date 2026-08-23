import { describe, expect, it } from "vitest";
import { createInitialProjectState, ProjectStateSchema } from "../schema";
import {
  applyVisualRevision,
  classifyDesignRevision,
  deriveScreenMap,
  evaluateDesignReadiness,
  generateMockPrototype,
  validatePrototypeFiles,
} from "../design";

function jobState(extras: Record<string, unknown> = {}) {
  return ProjectStateSchema.parse({
    ...createInitialProjectState({
      id: "job-1",
      name: "Job Platform",
      rawIdea: "Saya mau bikin platform untuk mencari kerja.",
    }),
    targetUsers: ["pencari kerja"],
    roles: ["pencari kerja"],
    workflows: ["cari lowongan", "simpan lowongan"],
    entities: ["Job", "Application"],
    decisions: [
      {
        id: "d1",
        topic: "product_identity",
        decision: "job_seeker_only",
        source: "USER",
        status: "ACCEPTED",
      },
    ],
    ...extras,
  });
}

describe("Design Studio core", () => {
  it("keeps empty ideas blocked and allows partial generation with assumptions", () => {
    const empty = createInitialProjectState({ id: "x", name: "Empty" });
    expect(evaluateDesignReadiness(empty).level).toBe("BLOCKED");
    const partial = jobState();
    const readiness = evaluateDesignReadiness(partial);
    expect(["PARTIAL", "READY"]).toContain(readiness.level);
    if (readiness.level === "PARTIAL")
      expect(readiness.unresolved.length).toBeGreaterThan(0);
  });

  it("derives job-seeker screens and keeps employer posting inferred until confirmed", () => {
    const screens = deriveScreenMap(jobState());
    expect(screens.map((screen) => screen.name)).toEqual(
      expect.arrayContaining(["Job Discovery", "Job Detail"]),
    );
    expect(screens.some((screen) => screen.id === "employer-jobs")).toBe(false);

    const twoSided = jobState({
      decisions: [
        {
          id: "d2",
          topic: "product_identity",
          decision: "two_sided_marketplace",
          source: "USER",
          confidence: "EXPLICIT",
          status: "ACCEPTED",
          affects: ["actors"],
        },
      ],
    });
    const employerScreens = deriveScreenMap(twoSided);
    expect(employerScreens.map((screen) => screen.id)).toEqual(
      expect.arrayContaining(["employer-dashboard", "employer-jobs"]),
    );
  });

  it("rejects unsafe prototype files and accepts the mock generator", () => {
    const state = jobState();
    const generated = generateMockPrototype(state);
    expect(
      validatePrototypeFiles(generated.files, generated.screenMap).accepted,
    ).toBe(true);
    expect(generated.files.map((file) => file.path)).toEqual([
      "index.html",
      "styles.css",
      "app.js",
    ]);
    expect(generated.files[0].content).not.toContain("Post Job");

    const unsafe = validatePrototypeFiles(
      [
        {
          path: "../../evil.js",
          content: `<script src="https://evil.example/x.js"></script>`,
        },
        {
          path: "index.html",
          content: `<iframe></iframe><script>fetch("https://evil.example/")</script>`,
        },
      ],
      generated.screenMap,
    );
    expect(unsafe.accepted).toBe(false);
    expect(unsafe.reasons.join(" ")).toMatch(/unsafe|blocked|missing/i);
  });

  it("classifies product-model requests separately from visual revisions", () => {
    expect(
      classifyDesignRevision("Satu perusahaan harus punya beberapa recruiter."),
    ).toBe("POTENTIAL_PRODUCT_DECISION");
    expect(
      classifyDesignRevision("Bikin dashboard employer lebih compact."),
    ).toBe("DESIGN_STRUCTURE");
    expect(classifyDesignRevision("Kurangi card radius.")).toBe("VISUAL_ONLY");
  });

  it("keeps previous files when applying a compact visual revision", () => {
    const generated = generateMockPrototype(jobState());
    const revised = applyVisualRevision(
      generated,
      "Bikin dashboard employer lebih compact.",
    );
    expect(revised.files).toHaveLength(3);
    expect(
      revised.files.find((file) => file.path === "styles.css")?.content,
    ).toContain("width:168px");
  });
});
