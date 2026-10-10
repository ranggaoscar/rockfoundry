import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import test from "node:test";
import { PrismaClient } from "@rockfoundry/db";
import {
  MockExecutor,
  HermesExecutor,
  type ExecutorAdapter,
} from "./executor-adapter";
import {
  applyWorkAction,
  advanceExecution,
  workSnapshot,
  WorkError,
} from "./work-os";

const require = createRequire(import.meta.url);
const dbRequire = createRequire(require.resolve("@rockfoundry/db"));
const { PrismaLibSql } = dbRequire("@prisma/adapter-libsql");
async function fixture(legacyCount = 0, startWork = true) {
  const dir = await fs.mkdtemp(
    path.join(
      process.env.ROCKFOUNDRY_TEST_TMP_DIR || os.tmpdir(),
      "rf001-unit-",
    ),
  );
  const adapter = new PrismaLibSql({
    url: `file:${path.join(dir, "test.db").replace(/\\/g, "/")}`,
  });
  // Track explicit connections so Windows releases every SQLite handle on teardown.
  const connect = adapter.connect.bind(adapter);
  const connections: Array<{ dispose(): Promise<void> }> = [];
  adapter.connect = async () => {
    const connection = await connect();
    connections.push(connection);
    return connection;
  };
  const db = new PrismaClient({ adapter });
  const migrations = new URL(
    "../../../../packages/db/prisma/migrations/",
    import.meta.url,
  );
  for (const name of (await fs.readdir(migrations)).sort()) {
    if (!/^\d/.test(name)) continue;
    if (name === "20261010070000_work_os") {
      for (let index = 0; index < legacyCount; index++) {
        await db.project.create({
          data: {
            id: `legacy-${index}`,
            name: `Legacy experiment ${index}`,
            canonicalState: JSON.stringify({ preserved: index }),
          },
        });
      }
    }
    const sql = await fs.readFile(
      new URL(`${name}/migration.sql`, migrations),
      "utf8",
    );
    for (const statement of sql
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean))
      await db.$executeRawUnsafe(statement);
  }
  const result = (
    startWork
      ? await applyWorkAction(db, {
          action: "create_project",
          name: "Daily work",
        })
      : { project: { id: "" } }
  ) as { project: { id: string } };
  const taskResult = (
    startWork
      ? await applyWorkAction(db, {
          action: "create_task",
          projectId: result.project.id,
          title: "Prepare brief",
          acceptanceCriteria: "A reviewable brief",
          priority: "HIGH",
          dueAt: "2026-10-10T12:00:00Z",
        })
      : { task: { id: "" } }
  ) as { task: { id: string } };
  return {
    db,
    projectId: result.project.id,
    taskId: taskResult.task.id,
    close: async () => {
      await db.$disconnect();
      for (const connection of connections) await connection.dispose();
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch (error) {
        // libsql Windows native handles can outlive disconnect until the test process exits.
        if (
          process.platform !== "win32" ||
          (error as NodeJS.ErrnoException).code !== "EBUSY"
        )
          throw error;
      }
    },
  };
}
const execute = (taskId: string, requestId = crypto.randomUUID()) => ({
  action: "execute",
  taskId,
  executorId: "mock",
  requestId,
});

test("RF-001: durable mock run requires explicit acceptance; reopening the DB retains history", async () => {
  const f = await fixture();
  try {
    const queued = (await applyWorkAction(f.db, execute(f.taskId))) as {
      run: { id: string };
    };
    assert.equal(
      (
        await f.db.agentExecution.findUniqueOrThrow({
          where: { id: queued.run.id },
        })
      ).status,
      "QUEUED",
    );
    await advanceExecution(f.db, queued.run.id);
    const stored = await f.db.agentExecution.findUniqueOrThrow({
      where: { id: queued.run.id },
    });
    assert.ok(stored.externalId);
    await f.db.agentExecution.update({
      where: { id: stored.id },
      data: {
        input: JSON.stringify({
          ...JSON.parse(stored.input),
          createdAt: "2020-01-01T00:00:00.000Z",
        }),
      },
    });
    await advanceExecution(f.db, stored.id);
    const review = await workSnapshot(f.db);
    assert.equal(review.runs[0].status, "REVIEW_REQUIRED");
    assert.equal(review.projects[0].tasks[0].status, "REVIEW_REQUIRED");
    assert.match(review.runs[0].output!, /MOCK EXECUTION/);
    assert.equal(review.runs[0].evidence.length, 1);
    await assert.rejects(
      applyWorkAction(f.db, {
        action: "complete_task",
        taskId: f.taskId,
        comment: "skip review",
      }),
      WorkError,
    );
    await f.db.$disconnect(); // reconnect on next query, no in-process executor state required
    await applyWorkAction(f.db, {
      action: "review",
      runId: stored.id,
      decision: "ACCEPTED",
    });
    const accepted = await workSnapshot(f.db);
    assert.equal(accepted.projects[0].tasks[0].status, "DONE");
    assert.equal(accepted.runs[0].approval!.reviewerId, "local-owner");
    await applyWorkAction(f.db, {
      action: "review",
      runId: stored.id,
      decision: "ACCEPTED",
    });
    assert.equal(await f.db.approval.count(), 1);
    await assert.rejects(applyWorkAction(f.db, execute(f.taskId)), WorkError);
  } finally {
    await f.close();
  }
});

test("RF-001: duplicate/concurrent requests produce one persisted intent; no concurrent submit", async () => {
  const f = await fixture();
  try {
    const key = crypto.randomUUID();
    await applyWorkAction(f.db, execute(f.taskId, key));
    await applyWorkAction(f.db, execute(f.taskId, key));
    await assert.rejects(applyWorkAction(f.db, execute(f.taskId)), WorkError);
    assert.equal(await f.db.agentExecution.count(), 1);
    const run = await f.db.agentExecution.findFirstOrThrow();
    let submits = 0;
    const mock = new MockExecutor();
    mock.submit = async (_input, identity) => {
      submits++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { externalId: `mock:${identity}` };
    };
    await Promise.all([
      advanceExecution(f.db, run.id, [mock]),
      advanceExecution(f.db, run.id, [mock]),
    ]);
    assert.equal(submits, 1);
    await assert.rejects(
      applyWorkAction(f.db, {
        action: "update_task",
        taskId: f.taskId,
        title: "Changed after submit",
      }),
      WorkError,
    );
  } finally {
    await f.close();
  }
});

test("RF-001: failures retain identity, idempotent retry works, uncertain non-idempotent submission is blocked", async () => {
  const f = await fixture();
  try {
    await applyWorkAction(f.db, execute(f.taskId));
    const run = await f.db.agentExecution.findFirstOrThrow();
    const identities: string[] = [];
    const mock = new MockExecutor();
    mock.submit = async (_input, identity) => {
      identities.push(identity);
      if (identities.length === 1)
        throw new Error("secret exception must never persist");
      return { externalId: `mock:${identity}` };
    };
    await advanceExecution(f.db, run.id, [mock]);
    assert.equal(
      (await f.db.agentExecution.findFirstOrThrow()).status,
      "FAILED",
    );
    assert.doesNotMatch(
      (await f.db.agentExecution.findFirstOrThrow()).errorSummary!,
      /secret/,
    );
    const unsafe: ExecutorAdapter = {
      ...mock,
      id: "mock",
      label: "unsafe",
      idempotentSubmit: false,
      availability: () => ({ available: true }),
      submit: mock.submit,
      read: mock.read,
    };
    await assert.rejects(advanceExecution(f.db, run.id, [unsafe]), WorkError);
    await advanceExecution(f.db, run.id, [mock]);
    assert.deepEqual(identities, [run.id, run.id]);
    assert.equal((await f.db.agentExecution.findFirstOrThrow()).retryCount, 1);
  } finally {
    await f.close();
  }
});

test("RF-001: reject retains evidence/history and permits a new run; stale acceptance is refused", async () => {
  const f = await fixture();
  try {
    await applyWorkAction(f.db, execute(f.taskId));
    const run = await f.db.agentExecution.findFirstOrThrow();
    await advanceExecution(f.db, run.id);
    await f.db.agentExecution.update({
      where: { id: run.id },
      data: {
        input: JSON.stringify({
          ...JSON.parse(run.input),
          createdAt: "2020-01-01T00:00:00.000Z",
        }),
      },
    });
    await advanceExecution(f.db, run.id);
    await applyWorkAction(f.db, {
      action: "review",
      runId: run.id,
      decision: "REJECTED",
      comment: "Needs revision",
    });
    assert.equal(
      (await f.db.task.findUniqueOrThrow({ where: { id: f.taskId } })).status,
      "TODO",
    );
    await applyWorkAction(f.db, {
      action: "update_task",
      taskId: f.taskId,
      title: "Improved brief",
    });
    await applyWorkAction(f.db, execute(f.taskId));
    await assert.rejects(
      applyWorkAction(f.db, {
        action: "review",
        runId: run.id,
        decision: "ACCEPTED",
      }),
      WorkError,
    );
    assert.equal(await f.db.agentExecution.count(), 2);
    assert.equal(await f.db.evidence.count(), 1);
  } finally {
    await f.close();
  }
});

test("RF-001: scope/acceptance/ownership validation and unavailable Hermes do not mutate work", async () => {
  const f = await fixture();
  try {
    const other = (await applyWorkAction(f.db, {
      action: "create_project",
      name: "Other project",
    })) as { project: { id: string } };
    const goal = (await applyWorkAction(f.db, {
      action: "create_goal",
      projectId: other.project.id,
      title: "Other goal",
    })) as { goal: { id: string } };
    await assert.rejects(
      applyWorkAction(f.db, {
        action: "update_task",
        taskId: f.taskId,
        goalId: goal.goal.id,
      }),
      WorkError,
    );
    await assert.rejects(
      applyWorkAction(f.db, {
        action: "update_task",
        taskId: f.taskId,
        status: "DONE",
      }),
      WorkError,
    );
    await assert.rejects(
      applyWorkAction(f.db, {
        action: "execute",
        taskId: f.taskId,
        executorId: "hermes",
        requestId: crypto.randomUUID(),
      }),
      WorkError,
    );
    assert.equal(await f.db.agentExecution.count(), 0);
    assert.equal(new HermesExecutor().availability().available, false);
    await assert.rejects(
      applyWorkAction(f.db, {
        action: "update_project",
        projectId: f.projectId,
        workStatus: "DONE",
      }),
      WorkError,
    );
    await applyWorkAction(f.db, {
      action: "complete_task",
      taskId: f.taskId,
      comment: "Verified human deliverable",
    });
    await applyWorkAction(f.db, {
      action: "update_project",
      projectId: f.projectId,
      workStatus: "DONE",
    });
    const project = (await workSnapshot(f.db)).projects.find(
      (p) => p.id === f.projectId,
    )!;
    assert.equal(project.workStatus, "DONE");
    await f.db.project.update({
      where: { id: f.projectId },
      data: { deletedAt: new Date() },
    });
    await assert.rejects(applyWorkAction(f.db, execute(f.taskId)), WorkError);
  } finally {
    await f.close();
  }
});

for (const count of [49, 144]) {
  test(`RF-002G: ${count} legacy projects survive backfill without activating Work OS`, async () => {
    const f = await fixture(count, false);
    try {
      const legacyBefore = await f.db.project.findMany({
        orderBy: { id: "asc" },
      });
      assert.equal(await f.db.projectWork.count(), count); // Old migration remains checksum-compatible.
      // Even historical operational experiments must not leak into Today/goals/runs.
      await f.db.goal.create({
        data: { projectId: "legacy-0", title: "Pilot goal" },
      });
      const pilotTask = await f.db.task.create({
        data: {
          projectId: "legacy-0",
          title: "Overdue pilot task",
          acceptanceCriteria: "Historical test",
          dueAt: new Date("2020-01-01"),
        },
      });
      await f.db.agentExecution.create({
        data: {
          id: crypto.randomUUID(),
          taskId: pilotTask.id,
          executorId: "mock",
          requestId: crypto.randomUUID(),
          input: "{}",
          status: "REVIEW_REQUIRED",
        },
      });
      await f.db.activityEvent.create({
        data: {
          workspaceId: "personal",
          projectId: "legacy-0",
          actorId: "local-owner",
          type: "TASK_CREATED",
          detail: "Historical pilot task",
        },
      });
      const empty = await workSnapshot(f.db);
      assert.equal(empty.projects.length, 0);
      assert.equal(empty.runs.length, 0);
      assert.equal(empty.activity.length, 0);
      assert.ok(empty.executors.some((executor) => executor.id === "hermes"));
      await assert.rejects(
        applyWorkAction(f.db, {
          action: "create_task",
          projectId: "legacy-0",
          title: "Not activated",
          acceptanceCriteria: "Must not be created",
        }),
        WorkError,
      );
      const created = (await applyWorkAction(f.db, {
        action: "create_project",
        name: "Owner operational project",
      })) as { project: { id: string } };
      const task = (await applyWorkAction(f.db, {
        action: "create_task",
        projectId: created.project.id,
        title: "Real work",
        acceptanceCriteria: "Owner reviewed",
        priority: "HIGH",
      })) as { task: { id: string } };
      await applyWorkAction(f.db, {
        action: "update_task",
        taskId: task.task.id,
        title: "Updated real work",
      });
      await applyWorkAction(f.db, {
        action: "create_goal",
        projectId: created.project.id,
        title: "Operational goal",
      });
      await f.db.$disconnect();
      const refreshed = await workSnapshot(f.db);
      assert.equal(refreshed.projects.length, 1);
      assert.equal(refreshed.projects[0].id, created.project.id);
      assert.equal(refreshed.projects[0].tasks[0].title, "Updated real work");
      assert.equal(refreshed.projects[0].goals.length, 1);
      assert.deepEqual(
        await f.db.project.findMany({
          where: { id: { startsWith: "legacy-" } },
          orderBy: { id: "asc" },
        }),
        legacyBefore,
      );
      // Existing Product Studio uses the unchanged Project records, not Work OS membership.
      assert.equal(
        (await f.db.project.findUniqueOrThrow({ where: { id: "legacy-0" } }))
          .canonicalState,
        legacyBefore.find((project) => project.id === "legacy-0")!
          .canonicalState,
      );
      // A newly created Product Studio project without the explicit activation event stays legacy.
      await f.db.project.create({
        data: { id: "studio-new", name: "New prototype", canonicalState: "{}" },
      });
      assert.equal((await workSnapshot(f.db)).projects.length, 1);
    } finally {
      await f.close();
    }
  });
}
