import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { PrismaLibSql } = require("@prisma/adapter-libsql") as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { PrismaClient } = require("@prisma/client") as any;
import { claimNextPackageJob, enqueuePackageJob, isPackageJobVersionCurrent, recoverStalePackageJobs } from "./package-job-claims";

 test("worker module import is side-effect free and bootstrap is idempotent", async () => {
  const worker = await import("./package-worker");
  worker.resetPackageWorkerForTests();
  assert.equal(worker.isPackageWorkerStartedForTests(), false);
  worker.startPackageWorker();
  worker.startPackageWorker();
  assert.equal(worker.isPackageWorkerStartedForTests(), true);
  worker.resetPackageWorkerForTests();
  assert.equal(worker.isPackageWorkerStartedForTests(), false);
});

 test("Node instrumentation explicitly boots the worker", async () => {
  process.env.NEXT_RUNTIME = "nodejs";
  const worker = await import("./package-worker");
  worker.resetPackageWorkerForTests();
  const instrumentation = await import("../instrumentation");
  await instrumentation.register();
  assert.equal(worker.isPackageWorkerStartedForTests(), true);
  worker.resetPackageWorkerForTests();
});

 test("edge instrumentation does not boot the worker", async () => {
  process.env.NEXT_RUNTIME = "edge";
  const worker = await import("./package-worker");
  worker.resetPackageWorkerForTests();
  const instrumentation = await import("../instrumentation");
  await instrumentation.register();
  assert.equal(worker.isPackageWorkerStartedForTests(), false);
});

process.env.NEXT_RUNTIME = "nodejs";

async function tempDb() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rockfoundry-package-jobs-"));
  const databasePath = path.join(dir, "test.db");
  const db = new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${databasePath}` }) });
  await db.$executeRawUnsafe(`CREATE TABLE "Project" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "description" TEXT, "canonicalState" TEXT NOT NULL DEFAULT '{}', "version" INTEGER NOT NULL DEFAULT 1, "deletedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await db.$executeRawUnsafe(`CREATE TABLE "PackageJob" ("id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL, "projectVersion" INTEGER NOT NULL, "status" TEXT NOT NULL DEFAULT 'QUEUED', "stage" TEXT NOT NULL DEFAULT 'PREPARING_PRODUCT', "completedStages" TEXT NOT NULL DEFAULT '[]', "progress" TEXT NOT NULL DEFAULT '{}', "errorSummary" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "startedAt" DATETIME, "completedAt" DATETIME, "heartbeatAt" DATETIME)`);
  await db.$executeRawUnsafe(`INSERT INTO "Project" ("id", "name") VALUES ('p1', 'test')`);
  return { db, dir };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function closeDb(db: any, dir: string) {
  await db.$disconnect();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EBUSY" || attempt === 9) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}

test("claims a queued job with a DB compare-and-set", async () => {
  const { db, dir } = await tempDb();
  try {
    await db.packageJob.create({ data: { id: "j1", projectId: "p1", projectVersion: 1 } });
    const ids = await Promise.all([claimNextPackageJob(db), claimNextPackageJob(db)]);
    assert.equal(ids.filter(Boolean).length, 1);
    const claimed = await db.packageJob.findUnique({ where: { id: "j1" } });
    assert.equal(claimed?.status, "RUNNING");
    assert.ok(claimed?.startedAt instanceof Date);
    assert.ok(claimed?.heartbeatAt instanceof Date);
    assert.ok((claimed?.heartbeatAt?.getTime() ?? 0) >= (claimed?.startedAt?.getTime() ?? 0));
  } finally { await closeDb(db, dir); }
});

test("marks stale running jobs failed and leaves fresh jobs alone", async () => {
  const { db, dir } = await tempDb();
  try {
    await db.packageJob.createMany({ data: [
      { id: "stale", projectId: "p1", projectVersion: 1, status: "RUNNING", heartbeatAt: new Date(Date.now() - 180_000) },
      { id: "fresh", projectId: "p1", projectVersion: 1, status: "RUNNING", heartbeatAt: new Date() },
    ] });
    const result = await recoverStalePackageJobs(db);
    assert.equal(result.count, 1);
    assert.equal((await db.packageJob.findUnique({ where: { id: "stale" } }))?.status, "FAILED");
    assert.equal((await db.packageJob.findUnique({ where: { id: "fresh" } }))?.status, "RUNNING");
  } finally { await closeDb(db, dir); }
});

test("duplicate queued jobs are claimed one at a time", async () => {
  const { db, dir } = await tempDb();
  try {
    await db.packageJob.createMany({ data: [
      { id: "j1", projectId: "p1", projectVersion: 1 },
      { id: "j2", projectId: "p1", projectVersion: 1 },
    ] });
    const first = await claimNextPackageJob(db);
    const second = await claimNextPackageJob(db);
    assert.equal(first, "j1");
    assert.equal(second, "j2");
    assert.equal(await claimNextPackageJob(db), null);
  } finally { await closeDb(db, dir); }
});

test("enqueue persists a new job as QUEUED before any worker claim", async () => {
  const { db, dir } = await tempDb();
  try {
    const result = await enqueuePackageJob(db, "p1", 7);
    const persisted = await db.packageJob.findUnique({ where: { id: result.job.id } });
    assert.equal(result.reused, false);
    assert.equal(persisted?.status, "QUEUED");
    assert.equal(persisted?.projectVersion, 7);
    assert.equal(persisted?.startedAt, null);
    assert.equal(persisted?.heartbeatAt, null);
    assert.equal(persisted?.completedAt, null);
  } finally { await closeDb(db, dir); }
});

test("enqueue persists and reloads version and timing fields", async () => {
  const { db, dir } = await tempDb();
  try {
    const result = await enqueuePackageJob(db, "p1", 1);
    assert.equal(result.reused, false);
    const reloaded = await db.packageJob.findUnique({ where: { id: result.job.id } });
    assert.equal(reloaded?.projectVersion, 1);
    assert.ok(reloaded?.createdAt instanceof Date);
    assert.equal(reloaded?.startedAt, null);
    await db.packageJob.update({ where: { id: result.job.id }, data: { status: "RUNNING", startedAt: new Date(), heartbeatAt: new Date() } });
    const afterReload = await db.packageJob.findUnique({ where: { id: result.job.id } });
    assert.ok(afterReload?.startedAt instanceof Date);
    assert.ok(afterReload?.heartbeatAt instanceof Date);
  } finally { await closeDb(db, dir); }
});

test("enqueue reuses active builds and rejects a duplicate for another version", async () => {
  const { db, dir } = await tempDb();
  try {
    const first = await enqueuePackageJob(db, "p1", 1);
    const second = await enqueuePackageJob(db, "p1", 1);
    assert.equal(second.reused, true);
    assert.equal(second.job.id, first.job.id);
    await assert.rejects(() => enqueuePackageJob(db, "p1", 2), /different project version/);
    assert.equal(await db.packageJob.count({ where: { projectId: "p1" } }), 1);
    assert.equal(isPackageJobVersionCurrent(1, 1), true);
    assert.equal(isPackageJobVersionCurrent(2, 1), false);
  } finally { await closeDb(db, dir); }
});

test("project version safety rejects stale work without mutating the current version", async () => {
  const { db, dir } = await tempDb();
  try {
    const queued = await enqueuePackageJob(db, "p1", 1);
    await db.$executeRawUnsafe(`UPDATE "Project" SET "version" = 2 WHERE "id" = 'p1'`);
    const project = await db.$queryRawUnsafe(`SELECT "version" FROM "Project" WHERE "id" = 'p1'`) as Array<{ version: number }>;
    assert.equal(isPackageJobVersionCurrent(project[0].version, queued.job.projectVersion), false);
    assert.equal((await db.packageJob.findUnique({ where: { id: queued.job.id } }))?.status, "QUEUED");
    const current = await db.$queryRawUnsafe(`SELECT "version" FROM "Project" WHERE "id" = 'p1'`) as Array<{ version: number }>;
    assert.equal(current[0].version, 2);
  } finally { await closeDb(db, dir); }
});

test("generation failure safety records failure state and preserves timing/progress data", async () => {
  const { db, dir } = await tempDb();
  try {
    const queued = await enqueuePackageJob(db, "p1", 1);
    const startedAt = new Date(Date.now() - 25);
    const failedAt = new Date();
    await db.packageJob.update({
      where: { id: queued.job.id },
      data: {
        status: "FAILED", stage: "FAILED", startedAt, heartbeatAt: failedAt,
        errorSummary: "generator unavailable",
        completedStages: JSON.stringify(["GENERATING_DOCUMENTS"]),
        progress: JSON.stringify({ stageLabel: "Menyusun dokumen", timings: { documentMs: 25, totalMs: 25 } }),
      },
    });
    const failed = await db.packageJob.findUnique({ where: { id: queued.job.id } });
    assert.equal(failed?.status, "FAILED");
    assert.equal(failed?.stage, "FAILED");
    assert.equal(failed?.errorSummary, "generator unavailable");
    assert.deepEqual(JSON.parse(failed?.completedStages ?? "[]"), ["GENERATING_DOCUMENTS"]);
    assert.deepEqual(JSON.parse(failed?.progress ?? "{}").timings, { documentMs: 25, totalMs: 25 });
    assert.equal(failed?.startedAt?.getTime(), startedAt.getTime());
    assert.equal(failed?.heartbeatAt?.getTime(), failedAt.getTime());
  } finally { await closeDb(db, dir); }
});

test("duplicate-version enqueue fails immediately, then retries only after the active job fails", async () => {
  const { db, dir } = await tempDb();
  try {
    const active = await enqueuePackageJob(db, "p1", 1);
    const failureStartedAt = Date.now();

    await assert.rejects(() => enqueuePackageJob(db, "p1", 2), /different project version/);
    assert.equal(await db.packageJob.count({ where: { projectId: "p1" } }), 1);

    await db.packageJob.update({
      where: { id: active.job.id },
      data: { status: "FAILED", stage: "FAILED", errorSummary: "transient" },
    });

    const retry = await enqueuePackageJob(db, "p1", 2);
    assert.equal(retry.reused, false);
    assert.notEqual(retry.job.id, active.job.id);
    assert.equal(retry.job.projectVersion, 2);
    assert.ok(retry.job.createdAt.getTime() >= failureStartedAt);
    assert.equal(await db.packageJob.count({ where: { projectId: "p1" } }), 2);
  } finally { await closeDb(db, dir); }
});

test("failed jobs can be retried, while stale recovery respects the 120-second boundary", async () => {
  const { db, dir } = await tempDb();
  try {
    const first = await enqueuePackageJob(db, "p1", 1);
    await db.packageJob.update({ where: { id: first.job.id }, data: { status: "FAILED", errorSummary: "transient" } });
    const retry = await enqueuePackageJob(db, "p1", 1);
    assert.equal(retry.reused, false);
    assert.notEqual(retry.job.id, first.job.id);

    const now = Date.now();
    await db.packageJob.createMany({ data: [
      { id: "boundary-fresh", projectId: "p1", projectVersion: 1, status: "RUNNING", heartbeatAt: new Date(now - 100_000) },
      { id: "boundary-stale", projectId: "p1", projectVersion: 1, status: "RUNNING", heartbeatAt: new Date(now - 121_000) },
    ] });
    const recovered = await recoverStalePackageJobs(db);
    assert.equal(recovered.count, 1);
    assert.equal((await db.packageJob.findUnique({ where: { id: "boundary-fresh" } }))?.status, "RUNNING");
    assert.equal((await db.packageJob.findUnique({ where: { id: "boundary-stale" } }))?.status, "FAILED");
  } finally { await closeDb(db, dir); }
});
