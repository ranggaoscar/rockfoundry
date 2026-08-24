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
import {
  claimNextDesignGenerationJob,
  enqueueDesignGenerationJob,
  recoverStaleDesignGenerationJobs,
  startDesignGenerationJobHeartbeat,
} from "./design-job-claims";

async function tempDb() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rockfoundry-design-jobs-"));
  const db = new PrismaClient({ adapter: new PrismaLibSql({ url: "file::memory:?cache=shared" }) });
  await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "DesignGenerationJob"`);
  await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "Project"`);
  await db.$executeRawUnsafe(`CREATE TABLE "Project" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "description" TEXT, "canonicalState" TEXT NOT NULL DEFAULT '{}', "version" INTEGER NOT NULL DEFAULT 1, "deletedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await db.$executeRawUnsafe(`CREATE TABLE "DesignGenerationJob" ("id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL, "projectVersion" INTEGER NOT NULL, "status" TEXT NOT NULL DEFAULT 'QUEUED', "stage" TEXT NOT NULL DEFAULT 'DESIGN_ARCHITECTURE', "progress" TEXT NOT NULL DEFAULT '{}', "errorSummary" TEXT, "retryCount" INTEGER NOT NULL DEFAULT 0, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "startedAt" DATETIME, "completedAt" DATETIME, "heartbeatAt" DATETIME)`);
  await db.$executeRawUnsafe(`INSERT INTO "Project" ("id", "name") VALUES ('p1', 'test')`);
  return { db, dir };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function closeDb(db: any, dir: string) {
  try {
    await db.$executeRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch {
    // The database may already be closing; disconnect remains the required teardown.
  }
  await db.$disconnect();
  await db._engine?.stop?.();
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EBUSY" && code !== "EPERM") throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw lastError;
}

function fakeTimers() {
  let callback: (() => void | Promise<void>) | undefined;
  let cleared = false;
  return {
    timers: {
      setInterval(next: () => void | Promise<void>) {
        callback = next;
        return "heartbeat";
      },
      clearInterval() {
        cleared = true;
      },
    },
    async tick() {
      await callback?.();
    },
    wasCleared() {
      return cleared;
    },
  };
}

test("prototype jobs are durable, version-bound, and retryable without PackageJob", async () => {
  const { db, dir } = await tempDb();
  try {
    const first = await enqueueDesignGenerationJob(db, "p1", 1);
    assert.equal(first.reused, false);
    assert.equal(first.job.status, "QUEUED");
    assert.equal((await enqueueDesignGenerationJob(db, "p1", 1)).reused, true);
    await assert.rejects(() => enqueueDesignGenerationJob(db, "p1", 2), /different project version/);
    await db.designGenerationJob.update({ where: { id: first.job.id }, data: { status: "FAILED" } });
    const retry = await enqueueDesignGenerationJob(db, "p1", 1);
    assert.equal(retry.reused, false);
    assert.equal(retry.job.retryCount, 1);
    assert.equal(await db.designGenerationJob.count(), 2);
  } finally {
    await closeDb(db, dir);
  }
});

test("prototype jobs claim and stale-recover independently", async () => {
  const { db, dir } = await tempDb();
  try {
    const queued = await enqueueDesignGenerationJob(db, "p1", 1);
    assert.equal(await claimNextDesignGenerationJob(db), queued.job.id);
    assert.equal(await claimNextDesignGenerationJob(db), null);
    await db.designGenerationJob.update({
      where: { id: queued.job.id },
      data: { heartbeatAt: new Date(Date.now() - 121_000) },
    });
    assert.equal((await recoverStaleDesignGenerationJobs(db)).count, 1);
    const failed = await db.designGenerationJob.findUnique({ where: { id: queued.job.id } });
    assert.equal(failed?.status, "FAILED");
    assert.equal(failed?.stage, "FAILED");
  } finally {
    await closeDb(db, dir);
  }
});

test("prototype heartbeat refresh is terminal-state safe", async () => {
  const { db, dir } = await tempDb();
  try {
    const queued = await enqueueDesignGenerationJob(db, "p1", 1);
    await claimNextDesignGenerationJob(db);
    const fake = fakeTimers();
    const stop = startDesignGenerationJobHeartbeat(db, queued.job.id, 15_000, fake.timers);
    await fake.tick();
    const active = await db.designGenerationJob.findUnique({ where: { id: queued.job.id } });
    assert.ok(active?.heartbeatAt && Date.now() - active.heartbeatAt.getTime() < 120_000);
    await db.designGenerationJob.update({ where: { id: queued.job.id }, data: { status: "COMPLETED" } });
    await fake.tick();
    assert.equal(fake.wasCleared(), true);
    stop();
  } finally {
    await closeDb(db, dir);
  }
});
