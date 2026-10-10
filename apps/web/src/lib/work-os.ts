import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@rockfoundry/db";
import { createInitialProjectState } from "@rockfoundry/core";
import { z } from "zod";
import { ExecutorError } from "./executor-error";
import {
  ExecutionInputSchema,
  executorAdapters,
  type ExecutorAdapter,
} from "./executor-adapter";

const WORKSPACE = "personal";
const ACTOR = "local-owner"; // Server-owned identity; not client-supplied role/tenant data.
const id = z.string().min(1).max(200);
const title = z.string().trim().min(1).max(200);
const date = z.iso.datetime({ offset: true }).nullable().optional();
const assignment = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("HUMAN"), humanId: z.literal(ACTOR) }).strict(),
  z
    .object({
      kind: z.literal("EXECUTOR"),
      executorId: z.enum(["mock", "hermes"]),
    })
    .strict(),
]);
const taskFields = {
  title,
  description: z.string().max(10000).nullable().optional(),
  acceptanceCriteria: z.string().trim().min(1).max(10000),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  dueAt: date,
  plannedDate: date,
  goalId: id.nullable().optional(),
  milestoneId: id.nullable().optional(),
  assignment: assignment.optional(),
};
const TaskPatchSchema = z.object(taskFields).partial().strict();
export const WorkActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create_project"),
      name: title,
      description: z.string().max(5000).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("update_project"),
      projectId: id,
      name: title.optional(),
      description: z.string().max(5000).nullable().optional(),
      workStatus: z.enum(["ACTIVE", "PAUSED", "DONE"]).optional(),
      targetDate: date,
    })
    .strict(),
  z
    .object({ action: z.literal("create_task"), projectId: id, ...taskFields })
    .strict(),
  z
    .object({
      action: z.literal("update_task"),
      taskId: id,
      ...TaskPatchSchema.shape,
    })
    .strict(),
  z.object({ action: z.literal("create_goal"), projectId: id, title }).strict(),
  z
    .object({
      action: z.literal("create_milestone"),
      projectId: id,
      title,
      goalId: id.nullable().optional(),
      dueAt: date,
    })
    .strict(),
  z
    .object({
      action: z.literal("execute"),
      taskId: id,
      executorId: z.enum(["mock", "hermes"]),
      requestId: z.uuid(),
    })
    .strict(),
  z.object({ action: z.literal("poll"), runId: id }).strict(),
  z
    .object({
      action: z.literal("review"),
      runId: id,
      decision: z.enum(["ACCEPTED", "REJECTED"]),
      comment: z.string().max(5000).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("complete_task"),
      taskId: id,
      comment: z.string().trim().min(1).max(5000),
    })
    .strict(),
]);
// Explicit partial schema retains TypeScript field types; no status/owner mutation route.
export class WorkError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
type Tx = Prisma.TransactionClient;
async function scopedProject(tx: Tx, projectId: string) {
  const project = await tx.project.findFirst({
    where: { id: projectId, deletedAt: null, work: { workspaceId: WORKSPACE } },
  });
  if (!project)
    throw new WorkError("Project not found in personal workspace.", 404);
  return project;
}
async function scopedTask(tx: Tx, taskId: string) {
  const task = await tx.task.findUnique({
    where: { id: taskId },
    include: { assignment: true },
  });
  if (!task) throw new WorkError("Task not found.", 404);
  await scopedProject(tx, task.projectId);
  return task;
}
async function scopedRun(tx: Tx, runId: string) {
  const run = await tx.agentExecution.findUnique({ where: { id: runId } });
  if (!run) throw new WorkError("Execution not found.", 404);
  await scopedTask(tx, run.taskId);
  return run;
}
async function event(
  tx: Tx,
  type: string,
  detail: string,
  refs: { projectId?: string; taskId?: string; executionId?: string } = {},
) {
  await tx.activityEvent.create({
    data: { workspaceId: WORKSPACE, actorId: ACTOR, type, detail, ...refs },
  });
}
async function associations(
  tx: Tx,
  projectId: string,
  goalId?: string | null,
  milestoneId?: string | null,
) {
  if (
    goalId &&
    !(await tx.goal.findFirst({ where: { id: goalId, projectId } }))
  )
    throw new WorkError("Goal belongs to another project.", 400);
  if (
    milestoneId &&
    !(await tx.milestone.findFirst({ where: { id: milestoneId, projectId } }))
  )
    throw new WorkError("Milestone belongs to another project.", 400);
}
function dates(data: { dueAt?: string | null; plannedDate?: string | null }) {
  return {
    ...(data.dueAt === undefined
      ? {}
      : { dueAt: data.dueAt ? new Date(data.dueAt) : null }),
    ...(data.plannedDate === undefined
      ? {}
      : { plannedDate: data.plannedDate ? new Date(data.plannedDate) : null }),
  };
}
export async function workSnapshot(
  db: PrismaClient,
  adapters = executorAdapters(),
) {
  const [workspace, projects, runs, activity] = await Promise.all([
    db.workspace.findUniqueOrThrow({
      where: { id: WORKSPACE },
      select: { id: true, name: true },
    }),
    db.project.findMany({
      where: { deletedAt: null, work: { workspaceId: WORKSPACE } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        work: true,
        goals: true,
        milestones: true,
        tasks: {
          include: { assignment: true },
          orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        },
      },
    }),
    db.agentExecution.findMany({
      where: {
        task: {
          project: { deletedAt: null, work: { workspaceId: WORKSPACE } },
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        task: { select: { id: true, title: true, projectId: true } },
        evidence: true,
        approval: true,
      },
    }),
    db.activityEvent.findMany({
      where: { workspaceId: WORKSPACE },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  return {
    workspace,
    projects: projects.map(({ work, ...project }) => ({
      ...project,
      workStatus: work!.status,
      targetDate: work!.targetDate,
    })),
    // Immutable submission input is internal, never credentials or UI payload.
    runs: runs.map(({ input: _input, leaseUntil: _lease, ...run }) => {
      void _input;
      void _lease;
      return run;
    }),
    activity,
    executors: adapters.map((adapter) => ({
      id: adapter.id,
      label: adapter.label,
      ...adapter.availability(),
    })),
  };
}

export async function applyWorkAction(
  db: PrismaClient,
  body: unknown,
  adapters = executorAdapters(),
) {
  const parsed = WorkActionSchema.safeParse(body);
  if (!parsed.success)
    throw new WorkError(
      "Invalid work request: " +
        parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      400,
    );
  const data = parsed.data;
  if (data.action === "poll") return advanceExecution(db, data.runId, adapters);
  if (data.action === "execute") {
    const adapter = adapters.find((item) => item.id === data.executorId);
    if (!adapter?.availability().available)
      throw new WorkError(
        adapter?.availability().reason || "Executor unavailable.",
        503,
      );
    // Claim the task slot and persist intent before external submission.
    const run = await db.$transaction(async (tx) => {
      const task = await scopedTask(tx, data.taskId);
      const existing = await tx.agentExecution.findUnique({
        where: {
          taskId_requestId: { taskId: data.taskId, requestId: data.requestId },
        },
      });
      if (existing) {
        if (existing.executorId !== data.executorId)
          throw new WorkError(
            "Request ID is already bound to a different executor.",
          );
        return existing;
      }
      if (task.status === "DONE")
        throw new WorkError("Accepted tasks cannot be executed again.");
      const runId = randomUUID();
      const claimed = await tx.task.updateMany({
        where: {
          id: task.id,
          activeExecutionId: null,
          status: { not: "DONE" },
        },
        data: { activeExecutionId: runId, status: "IN_PROGRESS" },
      });
      if (claimed.count !== 1)
        throw new WorkError(
          "This task already has an execution. Retry or review the existing run.",
        );
      const run = await tx.agentExecution.create({
        data: {
          id: runId,
          taskId: task.id,
          executorId: adapter.id,
          requestId: data.requestId,
          input: JSON.stringify({
            taskId: task.id,
            title: task.title,
            description: task.description,
            acceptanceCriteria: task.acceptanceCriteria,
            createdAt: new Date().toISOString(),
            ...(adapter.bindingId
              ? { executorBinding: adapter.bindingId }
              : {}),
          }),
        },
      });
      await tx.taskAssignment.upsert({
        where: { taskId: task.id },
        create: { taskId: task.id, kind: "EXECUTOR", executorId: adapter.id },
        update: { kind: "EXECUTOR", executorId: adapter.id, humanId: null },
      });
      await event(tx, "EXECUTION_QUEUED", "Task queued for " + adapter.id, {
        projectId: task.projectId,
        taskId: task.id,
        executionId: run.id,
      });
      return run;
    });
    return { run };
  }
  return db.$transaction(async (tx) => {
    if (data.action === "create_project") {
      const projectId = randomUUID();
      const state = createInitialProjectState({
        id: projectId,
        name: data.name,
        rawIdea: data.description || "",
      });
      const project = await tx.project.create({
        data: {
          id: projectId,
          name: data.name,
          description: data.description,
          canonicalState: JSON.stringify(state),
          revisions: {
            create: {
              version: 1,
              state: JSON.stringify(state),
              reason: "Work OS project created",
            },
          },
          work: { create: { workspaceId: WORKSPACE } },
        },
      });
      await event(tx, "PROJECT_CREATED", project.name, { projectId });
      return { project };
    }
    if (data.action === "update_project") {
      const project = await scopedProject(tx, data.projectId);
      if (
        data.workStatus === "DONE" &&
        (await tx.task.count({
          where: { projectId: project.id, status: { not: "DONE" } },
        }))
      )
        throw new WorkError(
          "Accept outstanding tasks before marking this project done.",
        );
      if (data.name !== undefined || data.description !== undefined) {
        const state = JSON.parse(project.canonicalState);
        state.name = data.name || project.name;
        const version = project.version + 1;
        const changed = await tx.project.updateMany({
          where: { id: project.id, version: project.version },
          data: {
            name: data.name,
            description: data.description,
            canonicalState: JSON.stringify(state),
            version,
          },
        });
        if (changed.count !== 1)
          throw new WorkError("Project changed. Refresh before retrying.");
        await tx.projectStateRevision.create({
          data: {
            projectId: project.id,
            version,
            state: JSON.stringify(state),
            reason: "Work OS project details updated",
          },
        });
      }
      await tx.projectWork.update({
        where: { projectId: project.id },
        data: {
          status: data.workStatus,
          ...(data.targetDate === undefined
            ? {}
            : {
                targetDate: data.targetDate ? new Date(data.targetDate) : null,
              }),
        },
      });
      await event(tx, "PROJECT_UPDATED", "Project details updated", {
        projectId: project.id,
      });
      return { ok: true };
    }
    if (data.action === "create_goal" || data.action === "create_milestone") {
      await scopedProject(tx, data.projectId);
      if (data.action === "create_goal") {
        const goal = await tx.goal.create({
          data: { projectId: data.projectId, title: data.title },
        });
        await event(tx, "GOAL_CREATED", data.title, {
          projectId: data.projectId,
        });
        return { goal };
      }
      await associations(tx, data.projectId, data.goalId);
      const milestone = await tx.milestone.create({
        data: {
          projectId: data.projectId,
          title: data.title,
          goalId: data.goalId,
          ...dates(data),
        },
      });
      await event(tx, "MILESTONE_CREATED", data.title, {
        projectId: data.projectId,
      });
      return { milestone };
    }
    if (data.action === "create_task") {
      const project = await scopedProject(tx, data.projectId);
      const work = await tx.projectWork.findUniqueOrThrow({
        where: { projectId: project.id },
      });
      if (work.status === "DONE")
        throw new WorkError("Reopen the project before adding work.");
      await associations(tx, project.id, data.goalId, data.milestoneId);
      const { action: _action, assignment: assignee, ...fields } = data;
      void _action;
      const task = await tx.task.create({
        data: {
          ...fields,
          ...dates(fields),
          assignment: { create: assignee || { kind: "HUMAN", humanId: ACTOR } },
        },
      });
      await event(tx, "TASK_CREATED", task.title, {
        projectId: project.id,
        taskId: task.id,
      });
      return { task };
    }
    if (data.action === "update_task") {
      const task = await scopedTask(tx, data.taskId);
      if (task.activeExecutionId || task.status === "DONE")
        throw new WorkError(
          "Running, pending-review and accepted tasks are immutable. Reject the result before revising the task.",
        );
      const fields = TaskPatchSchema.parse(
        Object.fromEntries(
          Object.entries(data).filter(
            ([key]) => key !== "action" && key !== "taskId",
          ),
        ),
      );
      await associations(tx, task.projectId, fields.goalId, fields.milestoneId);
      const { assignment: assignee, ...rest } = fields;
      const updated = await tx.task.update({
        where: { id: task.id },
        data: {
          ...rest,
          ...dates(rest),
          ...(assignee
            ? {
                assignment: {
                  upsert: {
                    create: assignee,
                    update: {
                      ...assignee,
                      humanId: assignee.kind === "HUMAN" ? ACTOR : null,
                      executorId:
                        assignee.kind === "EXECUTOR"
                          ? assignee.executorId
                          : null,
                    },
                  },
                },
              }
            : {}),
        },
      });
      await event(tx, "TASK_UPDATED", task.title, {
        projectId: task.projectId,
        taskId: task.id,
      });
      return { task: updated };
    }
    if (data.action === "complete_task") {
      const task = await scopedTask(tx, data.taskId);
      if (task.status === "DONE") return { ok: true };
      if (task.activeExecutionId || task.assignment?.kind !== "HUMAN")
        throw new WorkError(
          "Review and accept the agent result to complete this task.",
        );
      await tx.task.update({
        where: { id: task.id },
        data: { status: "DONE", acceptedAt: new Date() },
      });
      await event(tx, "TASK_ACCEPTED", data.comment, {
        projectId: task.projectId,
        taskId: task.id,
      });
      return { ok: true };
    }
    if (data.action === "review") {
      const run = await scopedRun(tx, data.runId);
      const prior = await tx.approval.findUnique({
        where: { executionId: run.id },
      });
      if (prior) {
        if (prior.decision !== data.decision)
          throw new WorkError("This result has already been reviewed.");
        return { approval: prior };
      }
      if (run.status !== "REVIEW_REQUIRED")
        throw new WorkError(
          "Only completed results awaiting review may be accepted or rejected.",
        );
      const task = await scopedTask(tx, run.taskId);
      const accepted = data.decision === "ACCEPTED";
      const claimed = await tx.task.updateMany({
        where: {
          id: task.id,
          activeExecutionId: run.id,
          status: "REVIEW_REQUIRED",
        },
        data: {
          status: accepted ? "DONE" : "TODO",
          activeExecutionId: null,
          acceptedAt: accepted ? new Date() : null,
        },
      });
      if (claimed.count !== 1)
        throw new WorkError("Task no longer points to this result.");
      const approval = await tx.approval.create({
        data: {
          executionId: run.id,
          decision: data.decision,
          reviewerId: ACTOR,
          comment: data.comment,
        },
      });
      await tx.agentExecution.update({
        where: { id: run.id },
        data: { status: accepted ? "COMPLETED" : "REJECTED" },
      });
      await event(
        tx,
        accepted ? "RESULT_ACCEPTED" : "RESULT_REJECTED",
        data.comment || data.decision,
        { projectId: task.projectId, taskId: task.id, executionId: run.id },
      );
      return { approval };
    }
    throw new WorkError("Unsupported action.", 400);
  });
}

/** Durable, request-driven lifecycle. GET never executes work. Recoverable after refresh/restart. */
export async function advanceExecution(
  db: PrismaClient,
  runId: string,
  adapters: ExecutorAdapter[] = executorAdapters(),
) {
  const run = await scopedRun(db, runId);
  if (["COMPLETED", "REJECTED", "REVIEW_REQUIRED"].includes(run.status))
    return { run };
  const adapter = adapters.find((item) => item.id === run.executorId);
  if (!adapter?.availability().available)
    throw new WorkError(
      adapter?.availability().reason ||
        "Executor unavailable; persisted intent retained.",
      503,
    );
  if (!run.externalId && run.status !== "QUEUED" && !adapter.idempotentSubmit)
    throw new WorkError(
      "Submission outcome is uncertain. Reconcile with the executor before any retry.",
    );
  if (
    !run.externalId &&
    run.status !== "QUEUED" &&
    adapter.retryWindowMs &&
    Date.now() - run.createdAt.getTime() >= adapter.retryWindowMs
  )
    throw new WorkError(
      "Submission retry window expired. Reconcile the external run before retrying; no new job is submitted.",
    );
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + 30000);
  const claimed = await db.agentExecution.updateMany({
    where: {
      id: run.id,
      status: run.status,
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: {
      status: run.externalId ? "RUNNING" : "SUBMITTING",
      leaseUntil,
      startedAt: run.startedAt || now,
      errorSummary: null,
      completedAt: null,
      retryCount: run.status === "FAILED" ? { increment: 1 } : undefined,
    },
  });
  if (claimed.count !== 1)
    return {
      run: await db.agentExecution.findUnique({ where: { id: run.id } }),
    };
  try {
    const input = ExecutionInputSchema.parse(JSON.parse(run.input));
    let externalId = run.externalId;
    if (!externalId) {
      const submission = await adapter.submit(input, run.id);
      externalId = submission.externalId;
      if (!externalId || externalId.length > 500)
        throw new Error("Invalid execution identifier");
      await db.agentExecution.updateMany({
        where: { id: run.id, leaseUntil },
        data: { externalId, status: "RUNNING" },
      });
      return {
        run: await db.agentExecution.findUniqueOrThrow({
          where: { id: run.id },
        }),
      };
    }
    const result = await adapter.read(externalId, input);
    if (result.status === "FAILED")
      throw new ExecutorError(
        "EXECUTOR_TERMINAL",
        "Executor returned a terminal failure. Inspect/reconcile the existing external run; no new execution was submitted.",
      );
    if (result.status !== "COMPLETED") {
      if (result.error)
        await db.agentExecution.updateMany({
          where: { id: run.id, leaseUntil },
          data: {
            errorSummary:
              "Executor is waiting for human tool approval. Resolve in Hermes; RockFoundry does not auto-approve tools.",
          },
        });
      return {
        run: await db.agentExecution.findUniqueOrThrow({
          where: { id: run.id },
        }),
      };
    }
    if (!result.output?.trim())
      throw new Error("Executor returned no reviewable output");
    await db.$transaction(async (tx) => {
      const changed = await tx.agentExecution.updateMany({
        where: { id: run.id, status: "RUNNING", leaseUntil },
        data: {
          status: "REVIEW_REQUIRED",
          output: result.output!.slice(0, 200000),
          completedAt: new Date(),
        },
      });
      if (changed.count !== 1) return;
      for (const evidence of (result.evidence || []).slice(0, 50))
        await tx.evidence.upsert({
          where: {
            executionId_key: { executionId: run.id, key: evidence.key },
          },
          create: {
            executionId: run.id,
            ...evidence,
            content: evidence.content.slice(0, 100000),
          },
          update: {},
        });
      await tx.task.updateMany({
        where: { id: run.taskId, activeExecutionId: run.id },
        data: { status: "REVIEW_REQUIRED" },
      });
      const task = await scopedTask(tx, run.taskId);
      await event(
        tx,
        "RESULT_READY",
        "Executor completed; human acceptance required.",
        { projectId: task.projectId, taskId: task.id, executionId: run.id },
      );
    });
  } catch (cause) {
    // Never persist transport exception text, URLs, auth headers or provider payloads.
    await db.$transaction(async (tx) => {
      const changed = await tx.agentExecution.updateMany({
        where: { id: run.id, leaseUntil },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorSummary:
            cause instanceof ExecutorError
              ? cause.safeMessage
              : "Execution unavailable or failed. Retry safely using this same run; no new submission identity is created.",
        },
      });
      if (changed.count) {
        const task = await scopedTask(tx, run.taskId);
        await event(
          tx,
          "EXECUTION_FAILED",
          "Execution failed; existing submission identity retained.",
          { projectId: task.projectId, taskId: task.id, executionId: run.id },
        );
      }
    });
  } finally {
    await db.agentExecution.updateMany({
      where: { id: run.id, leaseUntil },
      data: { leaseUntil: null },
    });
  }
  return {
    run: await db.agentExecution.findUniqueOrThrow({ where: { id: run.id } }),
  };
}
