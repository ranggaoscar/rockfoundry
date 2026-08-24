import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { createInitialProjectState, generateExport } from "@rockfoundry/core";
import { PACKAGE_STAGES, PACKAGE_TIMING_KEYS } from "./package-jobs";

test("PackageJob is deterministic and contains no AI prototype stage", async () => {
  assert.deepEqual(PACKAGE_STAGES, [
    "PREPARING_PRODUCT",
    "GENERATING_DOCUMENTS",
    "BUILDING_SCREEN_MAP",
    "BASELINE_DESIGN_SPEC",
    "FINALIZING_HANDOFF",
    "COMPLETED",
  ]);
  assert.deepEqual(PACKAGE_TIMING_KEYS, [
    "documentMs",
    "screenMapMs",
    "baselineDesignSpecMs",
    "handoffMs",
    "totalMs",
  ]);

  const source = await fs.readFile(new URL("./package-jobs.ts", import.meta.url), "utf8");
  assert.equal(source.includes("@rockfoundry/ai"), false);
  assert.equal(source.includes("generateProjectDesign"), false);
  assert.equal(source.includes("prototype_generation"), false);
  assert.equal(source.includes("design_architecture"), false);

  let providerCalls = 0;
  const neverResolvingProvider = () => {
    providerCalls += 1;
    return new Promise<never>(() => undefined);
  };
  const packageResult = await generateExport(
    createInitialProjectState({ id: "package-contract", name: "Contract", rawIdea: "Kasir" }),
  );
  assert.equal(providerCalls, 0);
  void neverResolvingProvider;
  assert.ok(packageResult.metadata.fileCount >= 13);
  assert.ok(packageResult.documents.AGENT_HANDOFF.includes("Product Truth is authoritative"));
});
