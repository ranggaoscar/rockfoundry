import { describe, expect, it } from "vitest";
import { createInitialProjectState, ProjectStateSchema } from "../schema/project";
import {
  DesignSpecSchema,
  DesignStateSchema,
  PrototypeGenerationOutputSchema,
} from "../schema/design";
import { generateExport } from "../export/generator";

describe("design schema compatibility", () => {
  it("reads a legacy DesignState with safe defaults", () => {
    const parsed = DesignStateSchema.parse({ status: "DRAFT", currentVersion: 1 });

    expect(parsed).toMatchObject({
      status: "DRAFT",
      currentVersion: 1,
      activeScreenId: null,
      approvedVersion: null,
      stale: false,
      screenMap: [],
      revisions: [],
      assumptions: [],
    });
    expect(parsed.readiness).toMatchObject({ level: "BLOCKED", score: 0, blockers: [], unresolved: [] });
    expect(parsed.direction).toMatchObject({ mood: "quiet-technical", navigation: "sidebar" });
  });

  it("reads the legacy DesignSpec V1 shape unchanged", () => {
    const parsed = DesignSpecSchema.parse({
      productName: "Legacy catalog",
      navigation: "sidebar",
      visualHierarchy: "title, list, detail",
      density: "comfortable",
      typography: "system sans",
      spacing: "8px",
      surfaces: "white cards",
      controls: "outlined buttons",
      responsive: "stack on mobile",
      components: ["Table", "Button"],
      interactions: ["filter records"],
      states: ["empty", "loading"],
    });

    expect(parsed.productName).toBe("Legacy catalog");
    expect(parsed.components).toEqual(["Table", "Button"]);
    expect(parsed.tokens).toBeDefined();
    expect(parsed.layout).toBeDefined();
    expect(parsed.componentsV2).toEqual([]);
    expect(parsed.screensV2).toEqual([]);
  });

  it("accepts additive V2 metadata without changing V1 fields", () => {
    const parsed = DesignSpecSchema.parse({
      productName: "V2 catalog",
      navigation: "sidebar",
      visualHierarchy: "title, list, detail",
      density: "comfortable",
      typography: "system sans",
      spacing: "8px",
      surfaces: "white cards",
      controls: "outlined buttons",
      responsive: "stack on mobile",
      tokens: { radius: "12px" },
      layout: { mobileNavigation: "bottom bar" },
      componentsV2: [{ name: "RecordTable", purpose: "show records", variants: ["compact"] }],
      screensV2: [{ screenId: "catalog", primaryAction: "Add record" }],
    });

    expect(parsed.navigation).toBe("sidebar");
    expect(parsed.tokens).toMatchObject({ radius: "12px", typography: "system scale" });
    expect(parsed.layout).toMatchObject({ mobileNavigation: "bottom bar", desktopNavigation: "sidebar" });
    expect(parsed.componentsV2[0]).toMatchObject({ name: "RecordTable", variants: ["compact"], stateNotes: "" });
    expect(parsed.screensV2[0]).toMatchObject({ screenId: "catalog", primaryAction: "Add record" });
  });

  it("reads an old prototype artifact and preserves the allowed file contract", () => {
    const parsed = PrototypeGenerationOutputSchema.parse({
      files: [
        { path: "index.html", content: "<main>legacy</main>" },
        { path: "styles.css", content: "main { color: #111; }" },
        { path: "app.js", content: "" },
      ],
      summary: "legacy prototype",
    });

    expect(parsed.files.map(({ path }) => path)).toEqual(["index.html", "styles.css", "app.js"]);
    expect(parsed.assumptions).toEqual([]);
  });

  it("keeps the old handoff/export document structure readable", async () => {
    const result = await generateExport(createInitialProjectState({ id: "legacy", name: "Legacy", rawIdea: "A catalog" }));

    expect(Object.keys(result.documents).sort()).toEqual([
      "AGENT_HANDOFF",
      "BRD",
      "DECISIONS",
      "DECISIONS_JSON",
      "DO_NOT_INVENT",
      "ERD",
      "INVARIANTS",
      "PRD",
      "READINESS",
    ]);
    expect(result.metadata.fileCount).toBe(8);
    expect(result.documents.AGENT_HANDOFF).toContain("# Agent Handoff");
  });

  it("defaults absent additive project metadata safely", () => {
    const legacy = createInitialProjectState({ id: "safe", name: "Safe", rawIdea: "A tool" });
    const parsed = ProjectStateSchema.parse(legacy);

    expect(parsed.generationMetadata).toEqual({});
    expect(parsed.design).toEqual([]);
    expect(parsed.studio.status).toBe("NOT_STARTED");
  });
});
