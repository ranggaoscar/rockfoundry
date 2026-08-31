import { describe, expect, it } from "vitest";
import {
  getDraftBatchProgress,
  type DraftGenerationBatch,
} from "./product-documents";

const batches: DraftGenerationBatch[] = [
  {
    id: "BRD_PRD",
    label: "Menyusun BRD & PRD",
    documentTypes: ["BRD", "PRD"],
    status: "COMPLETE",
  },
  {
    id: "ERD_USER_FLOWS",
    label: "Menyusun ERD & User Flows",
    documentTypes: ["ERD", "USER_FLOWS"],
    status: "RUNNING",
  },
  {
    id: "SCREEN_MAP_DESIGN_BRIEF",
    label: "Menyusun Screen Map & Design Brief",
    documentTypes: ["SCREEN_MAP", "DESIGN_BRIEF"],
    status: "PENDING",
  },
];

describe("Product Draft batch progress", () => {
  it("keeps API labels and maps status without positional inference", () => {
    expect(getDraftBatchProgress(batches).map((batch) => batch.label)).toEqual([
      "Menyusun BRD & PRD",
      "Menyusun ERD & User Flows",
      "Menyusun Screen Map & Design Brief",
    ]);
    expect(getDraftBatchProgress(batches)).toEqual([
      { ...batches[0], presentation: "completed" },
      { ...batches[1], presentation: "active" },
      { ...batches[2], presentation: "pending" },
    ]);
    expect(
      getDraftBatchProgress(
        batches.map((batch) => ({ ...batch, status: "FAILED" as const })),
      ).map((batch) => batch.presentation),
    ).toEqual(["failed", "failed", "failed"]);
  });
});
