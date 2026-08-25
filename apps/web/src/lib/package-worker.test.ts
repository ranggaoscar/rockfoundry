import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { createInitialProjectState } from "@rockfoundry/core";
import { runPackageWorkerOnce } from "./package-worker";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { PrismaLibSql } = require("@prisma/adapter-libsql") as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { PrismaClient } = require("@prisma/client") as any;

async function tempDb() {
  const db = new PrismaClient({
    adapter: new PrismaLibSql({ url: "file::memory:?cache=shared" }),
  });
  await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "Artifact"`);
  await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "PackageJob"`);
  await db.$executeRawUnsafe(`CREATE TABLE "PackageJob" ("id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL, "projectVersion" INTEGER NOT NULL, "status" TEXT NOT NULL DEFAULT 'QUEUED', "stage" TEXT NOT NULL DEFAULT 'PREPARING_PRODUCT', "completedStages" TEXT NOT NULL DEFAULT '[]', "progress" TEXT NOT NULL DEFAULT '{}', "errorSummary" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "startedAt" DATETIME, "completedAt" DATETIME, "heartbeatAt" DATETIME)`);
  await db.$executeRawUnsafe(`CREATE TABLE "Artifact" ("id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL, "draftGenerationId" TEXT, "type" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT', "content" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1, "canonicalVersion" INTEGER, "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX "Artifact_projectId_type_version_key" ON "Artifact" ("projectId", "type", "version")`);
  return db;
}

async function closeDb(db: { $disconnect: () => Promise<void>; _engine?: { stop?: () => Promise<void> } }) {
  await db.$disconnect();
  await db._engine?.stop?.();
}

test("package worker completes the package without prototype generation", async () => {
  const db = await tempDb();
  const state = createInitialProjectState({
    id: "package-worker-project",
    name: "Package Worker",
    rawIdea: "Kasir untuk toko kecil",
  });
  const project = {
    id: state.id,
    name: state.name,
    description: state.rawIdea,
    canonicalState: JSON.stringify(state),
    version: 1,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  try {
    await db.packageJob.create({
      data: {
        id: "package-worker-job",
        projectId: project.id,
        projectVersion: project.version,
      },
    });

    assert.equal(
      await runPackageWorkerOnce({
        db,
        getProject: async (projectId) =>
          projectId === project.id ? project : null,
      }),
      true,
    );

    const job = await db.packageJob.findUnique({ where: { id: "package-worker-job" } });
    assert.equal(job?.status, "COMPLETED");
    assert.deepEqual(JSON.parse(job?.completedStages || "[]"), [
      "GENERATING_DOCUMENTS",
      "BUILDING_SCREEN_MAP",
      "BASELINE_DESIGN_SPEC",
      "FINALIZING_HANDOFF",
      "COMPLETED",
    ]);

    const artifacts = (await db.artifact.findMany({
      where: { projectId: project.id, version: project.version },
    })) as Array<{ type: string; content: string }>;
    const byType = new Map(artifacts.map((artifact) => [artifact.type, artifact]));
    assert.ok(byType.has("AGENT_HANDOFF"));
    assert.ok(byType.has("PACKAGE_SCREEN_MAP"));
    assert.ok(byType.has("PACKAGE_DESIGN_SPEC"));
    assert.ok(byType.has("PACKAGE_DESIGN_DECISIONS"));
    assert.equal(
      artifacts.some((artifact) => artifact.type.startsWith("PROTOTYPE_")),
      false,
    );
    assert.match(byType.get("AGENT_HANDOFF")?.content || "", /Product Truth is authoritative/);
    assert.ok(Array.isArray(JSON.parse(byType.get("PACKAGE_SCREEN_MAP")?.content || "[]")));
    assert.equal(typeof JSON.parse(byType.get("PACKAGE_DESIGN_SPEC")?.content || "{}").layout, "object");
    assert.equal(JSON.parse(job?.progress || "{}").timings.totalMs >= 0, true);
  } finally {
    await closeDb(db);
  }
});
