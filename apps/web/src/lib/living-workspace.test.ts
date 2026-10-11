/* eslint-disable @typescript-eslint/no-explicit-any -- integration test assertions inspect dynamic API payloads. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { PrismaClient } from "@rockfoundry/db";
import { HermesExecutor, type ExecutorAdapter } from "./executor-adapter";
import { applyLivingAction, livingSnapshot } from "./living-workspace";
import { applyWorkAction, WorkError } from "./work-os";

const require = createRequire(import.meta.url);
const dbRequire = createRequire(require.resolve("@rockfoundry/db"));
const { PrismaLibSql } = dbRequire("@prisma/adapter-libsql");
async function fixture() {
  const dir = await fs.mkdtemp(
    path.join(
      process.env.ROCKFOUNDRY_TEST_TMP_DIR || os.tmpdir(),
      "rf003-unit-",
    ),
  );
  const adapter = new PrismaLibSql({
    url: `file:${path.join(dir, "test.db").replace(/\\/g, "/")}`,
  });
  const connect = adapter.connect.bind(adapter);
  const connections: Array<{ dispose(): Promise<void> }> = [];
  adapter.connect = async () => {
    const c = await connect();
    connections.push(c);
    return c;
  };
  const db = new PrismaClient({ adapter });
  const migrations = new URL(
    "../../../../packages/db/prisma/migrations/",
    import.meta.url,
  );
  for (const name of (await fs.readdir(migrations)).sort()) {
    if (!/^\d/.test(name)) continue;
    const sql = await fs.readFile(
      new URL(`${name}/migration.sql`, migrations),
      "utf8",
    );
    for (const statement of sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await db.$executeRawUnsafe(statement);
  }
  const { project } = (await applyWorkAction(db, {
    action: "create_project",
    name: "RF003 active project",
  })) as { project: { id: string } };
  const close = async () => {
    await db.$disconnect();
    for (const c of connections) await c.dispose();
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (e) {
      if (
        process.platform !== "win32" ||
        (e as NodeJS.ErrnoException).code !== "EBUSY"
      )
        throw e;
    }
  };
  return { db, projectId: project.id, close };
}
const req = () => crypto.randomUUID();
function scripted(
  output: string,
  opts: { fail?: boolean } = {},
): ExecutorAdapter {
  let submits = 0;
  return {
    id: "hermes",
    label: "scripted",
    idempotentSubmit: true,
    bindingId: "fixture-binding",
    availability: () => ({ available: true }),
    async submit(_input, key) {
      submits++;
      return { externalId: `fixture:${key}` };
    },
    async read(_id, input) {
      if (opts.fail) throw new Error("offline");
      if (input.acceptanceCriteria.length > 20_000)
        throw new Error("context too large");
      return { status: "COMPLETED", output };
    },
    get submits() {
      return submits;
    },
  } as ExecutorAdapter;
}

test("RF-003 capture persists before unavailable executor and retries retain immutable idea", async () => {
  const f = await fixture();
  const old = process.env.ROCKFOUNDRY_LIVING_MOCK;
  process.env.ROCKFOUNDRY_LIVING_MOCK = "false";
  try {
    const requestId = req();
    const result = (await applyLivingAction(f.db, {
      action: "capture",
      requestId,
      text: "Keep the original note",
    })) as any;
    const sent = (await applyLivingAction(f.db, {
      action: "send",
      requestId: req(),
      text: "Please discuss it",
      executorId: "hermes",
    })) as any;
    assert.equal(sent.turn.status, "BLOCKED");
    assert.equal(
      await f.db.rockMessage.count({
        where: { threadId: sent.threadId, role: "USER" },
      }),
      1,
    );
    await assert.rejects(
      applyLivingAction(f.db, {
        action: "capture",
        requestId,
        text: "Changed text must not replace it",
      }),
      WorkError,
    );
    const repeat = (await applyLivingAction(f.db, {
      action: "capture",
      requestId,
      text: "Keep the original note",
    })) as any;
    assert.equal(result.idea.id, repeat.idea.id);
    assert.equal(repeat.idea.originalText, "Keep the original note");
  } finally {
    if (old === undefined) delete process.env.ROCKFOUNDRY_LIVING_MOCK;
    else process.env.ROCKFOUNDRY_LIVING_MOCK = old;
    await f.close();
  }
});

test("RF-003 explicit dev mock receives persisted idea and creates owner-confirmed proposal only", async () => {
  const f = await fixture();
  const oldMock = process.env.ROCKFOUNDRY_LIVING_MOCK;
  process.env.ROCKFOUNDRY_LIVING_MOCK = "true";
  try {
    await applyLivingAction(f.db, {
      action: "capture",
      requestId: req(),
      text: "Build a quiet workspace dashboard",
      projectId: f.projectId,
    });
    const sent = (await applyLivingAction(f.db, {
      action: "send",
      requestId: req(),
      text: "Help me plan the saved idea",
      executorId: "mock",
    })) as any;
    const snap = await livingSnapshot(f.db, sent.threadId);
    assert.equal(snap.messages.filter((m: any) => m.role === "USER").length, 1);
    assert.equal(snap.turns[0].status, "COMPLETED");
    assert.equal(snap.turns[0].proposals.length, 1);
    assert.equal(snap.projects[0].tasks.length, 0);
    assert.equal(snap.turns[0].proposals[0].status, "PENDING");
    const approval = (await applyLivingAction(f.db, {
      action: "decide",
      proposalId: snap.turns[0].proposals[0].id,
      decision: "APPROVED",
      payload: {
        projectId: f.projectId,
        title: "Edited dashboard task",
        acceptanceCriteria: "Dashboard is usable",
      },
    })) as any;
    assert.equal(approval.proposal.status, "APPROVED");
    assert.equal(
      await f.db.task.count({
        where: { projectId: f.projectId, title: "Edited dashboard task" },
      }),
      1,
    );
    await applyLivingAction(f.db, {
      action: "decide",
      proposalId: snap.turns[0].proposals[0].id,
      decision: "APPROVED",
    });
    assert.equal(
      await f.db.task.count({
        where: { projectId: f.projectId, title: "Edited dashboard task" },
      }),
      1,
    );
  } finally {
    if (oldMock === undefined) delete process.env.ROCKFOUNDRY_LIVING_MOCK;
    else process.env.ROCKFOUNDRY_LIVING_MOCK = oldMock;
    await f.close();
  }
});

test("RF-003 proposal rejects foreign and legacy project/task identities; invalid text output has no actions", async () => {
  const f = await fixture();
  const old = process.env.ROCKFOUNDRY_LIVING_MOCK;
  try {
    await f.db.project.create({
      data: { id: "legacy-project", name: "legacy", canonicalState: "{}" },
    });
    await f.db.capturedIdea.create({
      data: {
        workspaceId: "personal",
        ownerId: "local-owner",
        requestId: req(),
        originalText: "hello",
      },
    });
    const thread = await f.db.rockThread.create({
      data: { workspaceId: "personal", ownerId: "local-owner", title: "test" },
    });
    const message = await f.db.rockMessage.create({
      data: { threadId: thread.id, role: "USER", content: "go" },
    });
    const turn = await f.db.rockTurn.create({
      data: {
        threadId: thread.id,
        userMessageId: message.id,
        requestId: req(),
        executorId: "hermes",
        input: JSON.stringify({
          taskId: "x",
          title: "t",
          description: null,
          acceptanceCriteria: "x",
          createdAt: new Date().toISOString(),
          executorBinding: "fixture-binding",
        }),
      },
    });
    // Output not valid structured JSON is displayed as prose and never becomes executable.
    const adapter = scripted("plain unstructured response");
    await applyLivingAction(f.db, { action: "advance", turnId: turn.id }, [
      adapter,
    ]);
    const snapshot = await livingSnapshot(f.db, thread.id);
    assert.equal(snapshot.turns[0].proposals.length, 0);
    assert.match(
      snapshot.messages.find((m: any) => m.role === "ASSISTANT")?.content || "",
      /plain unstructured/,
    );
    assert.ok(old === undefined || typeof old === "string");
    const bad = await f.db.rockMessage.create({
      data: { threadId: thread.id, role: "USER", content: "propose legacy" },
    });
    const badTurn = await f.db.rockTurn.create({
      data: {
        threadId: thread.id,
        userMessageId: bad.id,
        requestId: req(),
        executorId: "hermes",
        input: JSON.stringify({
          taskId: "x",
          title: "t",
          description: null,
          acceptanceCriteria: JSON.stringify({ projects: [], ideas: [] }),
          createdAt: new Date().toISOString(),
          executorBinding: "fixture-binding",
        }),
      },
    });
    const malicious = scripted(
      JSON.stringify({
        reply: "no",
        proposals: [
          {
            type: "create_task",
            payload: {
              projectId: "legacy-project",
              title: "bad",
              acceptanceCriteria: "bad",
            },
          },
        ],
      }),
    );
    await applyLivingAction(f.db, { action: "advance", turnId: badTurn.id }, [
      malicious,
    ]);
    assert.equal(
      await f.db.rockProposal.count({ where: { turnId: badTurn.id } }),
      0,
    );
  } finally {
    await f.close();
  }
});

test("RF-003 conversation submission is idempotent and message survives provider failure", async () => {
  const f = await fixture();
  const adapter = scripted("", { fail: true });
  try {
    const key = req();
    await applyLivingAction(
      f.db,
      {
        action: "send",
        requestId: key,
        text: "persist me",
        executorId: "hermes",
      },
      [adapter],
    );
    const thread = await f.db.rockThread.findFirstOrThrow();
    await assert.rejects(
      applyLivingAction(
        f.db,
        {
          action: "send",
          requestId: key,
          threadId: thread.id,
          text: "edited ambiguous retry",
          executorId: "hermes",
        },
        [adapter],
      ),
      WorkError,
    );
    assert.equal(
      await f.db.rockMessage.count({
        where: { threadId: thread.id, role: "USER", content: "persist me" },
      }),
      1,
    );
    await applyLivingAction(
      f.db,
      {
        action: "send",
        requestId: key,
        text: "persist me",
        threadId: thread.id,
        executorId: "hermes",
      },
      [adapter],
    );
    assert.equal(
      await f.db.rockMessage.count({
        where: { threadId: thread.id, role: "USER" },
      }),
      1,
    );
  } finally {
    await f.close();
  }
});

test("RF-003 conversion is atomic, idempotent, timestamp preserving and scheduled", async () => {
  const f = await fixture();
  try {
    const originalText = "  Original kitchen idea\nkeep whitespace  ";
    const { idea } = (await applyLivingAction(f.db, {
      action: "capture",
      requestId: req(),
      text: originalText,
    })) as any;
    const conversion = {
      action: "convert",
      ideaId: idea.id,
      target: "task",
      projectId: f.projectId,
      title: "Owner task",
      acceptanceCriteria: "Reviewed",
      plannedDate: new Date().toISOString(),
    };
    await applyLivingAction(f.db, conversion);
    await applyLivingAction(f.db, conversion);
    const saved = await f.db.capturedIdea.findUniqueOrThrow({
      where: { id: idea.id },
    });
    assert.equal(saved.originalText, originalText);
    assert.equal(saved.createdAt.getTime(), idea.createdAt.getTime());
    assert.equal(await f.db.task.count(), 1);
    assert.ok((await f.db.task.findFirstOrThrow()).plannedDate);
    const next = (await applyLivingAction(f.db, {
      action: "capture",
      requestId: req(),
      text: "Future project",
    })) as any;
    await applyLivingAction(f.db, {
      action: "convert",
      ideaId: next.idea.id,
      target: "project",
      title: "Owner project",
    });
    assert.equal(
      (
        await f.db.capturedIdea.findUniqueOrThrow({
          where: { id: next.idea.id },
        })
      ).status,
      "CONVERTED",
    );
  } finally {
    await f.close();
  }
});

test("RF-003 asynchronous turn recovers after refresh, bounded context and same submission", async () => {
  const f = await fixture();
  let submits = 0,
    reads = 0;
  const adapter: ExecutorAdapter = {
    id: "hermes",
    label: "HTTP contract fixture",
    bindingId: "safe",
    idempotentSubmit: true,
    retryWindowMs: 86400000,
    availability: () => ({ available: true }),
    submit: async (input, key) => {
      submits++;
      assert.ok(input.acceptanceCriteria.length < 28000);
      return { externalId: key };
    },
    read: async () => {
      reads++;
      return reads === 1
        ? { status: "RUNNING" }
        : {
            status: "COMPLETED",
            output: JSON.stringify({ reply: "Grounded reply", proposals: [] }),
          };
    },
  };
  try {
    const sent = (await applyLivingAction(
      f.db,
      { action: "send", requestId: req(), text: "Priorities?" },
      [adapter],
    )) as any;
    assert.equal(sent.turn.status, "RUNNING");
    await f.db.$disconnect();
    await Promise.all([
      applyLivingAction(f.db, { action: "advance", turnId: sent.turn.id }, [
        adapter,
      ]),
      applyLivingAction(f.db, { action: "advance", turnId: sent.turn.id }, [
        adapter,
      ]),
    ]);
    assert.equal(submits, 1);
    assert.equal(
      await f.db.rockMessage.count({ where: { role: "ASSISTANT" } }),
      1,
    );
    assert.equal(
      (await livingSnapshot(f.db, sent.threadId)).turns[0].status,
      "COMPLETED",
    );
    const blocked = (await applyLivingAction(
      f.db,
      { action: "send", requestId: req(), text: "Saved without provider" },
      [],
    )) as any;
    assert.equal(blocked.turn.status, "BLOCKED");
    await applyLivingAction(
      f.db,
      { action: "advance", turnId: blocked.turn.id },
      [adapter],
    );
    assert.equal(
      (
        await f.db.rockTurn.findUniqueOrThrow({
          where: { id: blocked.turn.id },
        })
      ).status,
      "COMPLETED",
    );
  } finally {
    await f.close();
  }
});

test("RF-003 approval validation rollback, dismiss and retry horizon fail closed", async () => {
  const f = await fixture();
  const old = process.env.ROCKFOUNDRY_LIVING_MOCK;
  process.env.ROCKFOUNDRY_LIVING_MOCK = "true";
  try {
    await applyLivingAction(f.db, {
      action: "capture",
      requestId: req(),
      text: "Review my idea",
    });
    const sent = (await applyLivingAction(f.db, {
      action: "send",
      requestId: req(),
      text: "Propose a task",
      executorId: "mock",
    })) as any;
    const proposal = (await livingSnapshot(f.db, sent.threadId)).turns[0]
      .proposals[0];
    await assert.rejects(
      applyLivingAction(f.db, {
        action: "decide",
        proposalId: proposal.id,
        decision: "APPROVED",
        payload: { ...proposal.payload, projectId: "legacy-not-active" },
      }),
      WorkError,
    );
    assert.equal(await f.db.task.count(), 0);
    assert.equal(
      (
        await f.db.rockProposal.findUniqueOrThrow({
          where: { id: proposal.id },
        })
      ).status,
      "PENDING",
    );
    await applyLivingAction(f.db, {
      action: "decide",
      proposalId: proposal.id,
      decision: "DISMISSED",
    });
    assert.equal(await f.db.task.count(), 0);
    const unavailable = (await applyLivingAction(
      f.db,
      { action: "send", requestId: req(), text: "retry safety" },
      [],
    )) as any;
    await f.db.rockTurn.update({
      where: { id: unavailable.turn.id },
      data: {
        status: "FAILED",
        input: JSON.stringify({
          taskId: "living",
          title: "retry",
          description: null,
          acceptanceCriteria: "old",
          createdAt: "2000-01-01T00:00:00Z",
          executorBinding: "fixture-binding",
        }),
      },
    });
    const unsafe = { ...scripted("reply"), retryWindowMs: 1000 };
    await assert.rejects(
      applyLivingAction(
        f.db,
        { action: "advance", turnId: unavailable.turn.id },
        [unsafe],
      ),
      WorkError,
    );
  } finally {
    if (old === undefined) delete process.env.ROCKFOUNDRY_LIVING_MOCK;
    else process.env.ROCKFOUNDRY_LIVING_MOCK = old;
    await f.close();
  }
});

test("RF-003 official Hermes Runs adapter powers structured conversation and edited owner review", async () => {
  const f = await fixture();
  let posts = 0,
    externalId = "";
  const adapter = new HermesExecutor({
    enabled: true,
    baseUrl: "http://127.0.0.1:8643",
    key: "fixture-private-key",
    model: "rockfoundry",
    fetch: async (url, init) => {
      const path = new URL(String(url)).pathname;
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer fixture-private-key",
      );
      if (path === "/health") return Response.json({ status: "ok" });
      if (path === "/v1/capabilities")
        return Response.json({
          platform: "hermes-agent",
          auth: { type: "bearer", required: true },
          features: {
            run_submission: true,
            run_status: true,
            runs_idempotency: {
              supported: true,
              durable: true,
              retention_seconds: 86400,
            },
          },
        });
      if (path === "/v1/runs") {
        posts++;
        externalId = new Headers(init?.headers).get("Idempotency-Key")!;
        const body = JSON.parse(String(init?.body));
        assert.equal(body.model, "rockfoundry");
        assert.ok(body.input.includes(f.projectId));
        assert.ok(!body.input.includes("fixture-private-key"));
        return Response.json({ run_id: externalId });
      }
      return Response.json({
        run_id: externalId,
        status: "completed",
        output: JSON.stringify({
          reply:
            "Based on your saved idea and active project, here is a proposal—not a confirmed task.",
          proposals: [
            {
              type: "create_task",
              payload: {
                projectId: f.projectId,
                title: "Kitchen plan",
                acceptanceCriteria: "Owner reviewed",
                plannedDate: new Date().toISOString(),
              },
            },
          ],
        }),
      });
    },
  });
  try {
    await applyLivingAction(f.db, {
      action: "capture",
      requestId: req(),
      text: "Kitchen visualization",
    });
    const sent = (await applyLivingAction(
      f.db,
      { action: "send", requestId: req(), text: "Suggest a kitchen plan" },
      [adapter],
    )) as any;
    const snap = await livingSnapshot(f.db, sent.threadId, [adapter]);
    assert.equal(posts, 1);
    assert.equal(await f.db.task.count(), 0);
    const proposal = snap.turns[0].proposals[0];
    await Promise.allSettled([
      applyLivingAction(f.db, {
        action: "decide",
        proposalId: proposal.id,
        decision: "APPROVED",
        payload: { ...proposal.payload, title: "Owner edited plan" },
      }),
      applyLivingAction(f.db, {
        action: "decide",
        proposalId: proposal.id,
        decision: "APPROVED",
      }),
    ]);
    assert.equal(await f.db.task.count(), 1);
    const saved = await f.db.rockProposal.findUniqueOrThrow({
      where: { id: proposal.id },
    });
    assert.equal(JSON.parse(saved.payload).title, "Kitchen plan");
    assert.ok(JSON.parse(saved.result!).reviewedPayload);
    assert.equal(
      (
        await f.db.rockTurn.findUniqueOrThrow({
          where: { id: snap.turns[0].id },
        })
      ).externalId,
      externalId,
    );
  } finally {
    await f.close();
  }
});

test("RF-003 context is bounded and isolates conversation history and exact validation scope", async () => {
  const f = await fixture();
  let prompt = "";
  const adapter: ExecutorAdapter = {
    id: "hermes",
    label: "bounds fixture",
    idempotentSubmit: true,
    availability: () => ({ available: true }),
    submit: async (input, key) => {
      prompt = input.acceptanceCriteria;
      return { externalId: key };
    },
    read: async () => ({
      status: "COMPLETED",
      output: JSON.stringify({ reply: "Bounded", proposals: [] }),
    }),
  };
  try {
    for (let index = 0; index < 22; index++) {
      const project = (await applyWorkAction(f.db, {
        action: "create_project",
        name: `Project ${index} ` + "x".repeat(180),
      })) as any;
      await applyWorkAction(f.db, {
        action: "create_task",
        projectId: project.project.id,
        title: "t".repeat(190),
        acceptanceCriteria: "Bounded",
      });
    }
    for (let index = 0; index < 15; index++)
      await applyLivingAction(f.db, {
        action: "capture",
        requestId: req(),
        text: "idea".repeat(2000),
      });
    const other = await f.db.rockThread.create({
      data: {
        workspaceId: "personal",
        ownerId: "local-owner",
        title: "Different conversation",
      },
    });
    await f.db.rockMessage.create({
      data: {
        threadId: other.id,
        role: "USER",
        content: "UNRELATED_THREAD_SENTINEL",
      },
    });
    await applyLivingAction(
      f.db,
      { action: "send", requestId: req(), text: "Summarize actual priorities" },
      [adapter],
    );
    const context = JSON.parse(
      prompt.match(/LIVING_CONTEXT_JSON\n([\s\S]*?)\nEND_LIVING_CONTEXT/)![1],
    );
    assert.ok(JSON.stringify(context).length <= 16000);
    assert.ok(context.projects.length <= 20);
    assert.ok(context.tasks.length <= 40);
    assert.ok(context.ideas.length <= 12);
    assert.ok(!prompt.includes("UNRELATED_THREAD_SENTINEL"));
    assert.ok(context.snapshotAt);
  } finally {
    await f.close();
  }
});
