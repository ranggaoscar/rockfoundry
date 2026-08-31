import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

test("DraftGeneration migration creates schema-declared lookup indexes", async () => {
  const migration = await fs.readFile(
    new URL("./prisma/migrations/20260825150000_draft_generations/migration.sql", import.meta.url),
    "utf8",
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "DraftGeneration_projectId_generationNumber_key" ON "DraftGeneration"\("projectId", "generationNumber"\)/,
  );
  assert.match(
    migration,
    /CREATE INDEX "DraftGeneration_projectId_canonicalVersion_status_generationNumber_idx" ON "DraftGeneration"\("projectId", "canonicalVersion", "status", "generationNumber"\)/,
  );
});
