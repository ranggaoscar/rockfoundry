import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { createInitialProjectState } from "../schema";
import { generateExport } from "../export/generator";

describe("Agentic artifact export", () => {
  it("creates BRD, PRD, and ERD at the export root", async () => {
    const state = createInitialProjectState({
      id: "1",
      name: "Test Project",
      rawIdea: "A test project idea",
    });
    const result = await generateExport(state);
    const zip = await JSZip.loadAsync(result.buffer);
    expect(zip.file("BRD.md")).toBeTruthy();
    expect(zip.file("PRD.md")).toBeTruthy();
    expect(zip.file("ERD.md")).toBeTruthy();
    expect(Object.keys(zip.files)).toHaveLength(3);
  });
});
