import assert from "node:assert/strict";
import { describe, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createRequire } from "node:module";
import {
  ConversationAgentOutputError,
} from "@rockfoundry/ai";
import {
  ConversationAgentResponseSchema,
  applyConversationResponse,
  createInitialProjectState,
} from "@rockfoundry/core";
import {
  AI_INVALID_RESPONSE_MESSAGE,
  AI_PROVIDER_ERROR_MESSAGE,
} from "./ai-error";


import {
  claimConversationTurn,
  claimFailedConversationTurn,
  CONVERSATION_TURN_STALE_MS,
  CONVERSATION_TURN_STATUS,
  parseStoredConversationResponse,
  publicConversationTurn,
  recoverStaleConversationTurns,
  runClaimedConversationTurn,
} from "./conversation-turn";
import { isProductDraftCurrent } from "./project-truth";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { PrismaLibSql } = require("@prisma/adapter-libsql") as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { PrismaClient } = require("@prisma/client") as any;

type TestDb = InstanceType<typeof PrismaClient>;

async function makeDb() {
  const db = new PrismaClient({ adapter: new PrismaLibSql({ url: `file:conversation-turn-${Date.now()}-${Math.random()}` }) }) as TestDb;
  await db.$executeRawUnsafe(`CREATE TABLE "Project" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "description" TEXT, "canonicalState" TEXT NOT NULL DEFAULT '{}', "version" INTEGER NOT NULL DEFAULT 1, "deletedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await db.$executeRawUnsafe(`CREATE TABLE "ConversationTurn" ("id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL, "requestId" TEXT NOT NULL, "text" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'RUNNING', "attempt" INTEGER NOT NULL DEFAULT 1, "projectVersion" INTEGER, "responsePayload" TEXT, "errorSummary" TEXT, "providerCalls" INTEGER NOT NULL DEFAULT 0, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" DATETIME)`);
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX "ConversationTurn_projectId_requestId_key" ON "ConversationTurn"("projectId", "requestId")`);
  await db.$executeRawUnsafe(`CREATE TABLE "ConversationMessage" ("id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL, "role" TEXT NOT NULL, "content" TEXT NOT NULL, "metadata" TEXT, "conversationTurnId" TEXT, "requestId" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await db.$executeRawUnsafe(`CREATE TABLE "ProjectStateRevision" ("id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL, "version" INTEGER NOT NULL, "state" TEXT NOT NULL, "reason" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  const projectId = "p1";
  const state = createInitialProjectState({ id: projectId, name: "Test", rawIdea: "A product" });
  await db.project.create({ data: { id: projectId, name: state.name, canonicalState: JSON.stringify(state), version: 1 } });
  return { db, projectId, state };
}

async function closeDb(db: TestDb) {
  await db.$disconnect();
}

const response = ConversationAgentResponseSchema.parse({
  message: "Stored assistant response",
  mode: "BRAINSTORM",
  stateDelta: { explicitFacts: [], confirmedDecisions: [], corrections: [], resolvedQuestions: [], resolvedAssumptions: [] },
  proposals: [],
  assumptions: [],
  unresolvedRisks: [],
  suggestedNextAction: { type: "NONE" },
});

async function claim(db: TestDb, projectId: string, requestId: string) {
  return claimConversationTurn(db, { projectId, requestId, text: "same text" });
}

describe("durable conversation turns", () => {
it("same request key claims one turn and one user, including concurrent claims", async () => {
  const { db, projectId, state } = await makeDb();
  try {
    const [first, second] = await Promise.all([claim(db, projectId, "r1"), claim(db, projectId, "r1")]);
    assert.equal([first.kind, second.kind].filter((kind) => kind === "CLAIMED").length, 1);
    assert.equal(await db.conversationTurn.count(), 1);
    assert.equal(await db.conversationMessage.count({ where: { role: "user" } }), 1);
    const winner = first.kind === "CLAIMED" ? first : second;
    let providerCalls = 0;
    const completed = await runClaimedConversationTurn({
      db,
      projectId,
      turnId: winner.turn.id,
      text: winner.turn.text,
      mode: "BRAINSTORM",
      intent: "BRAINSTORM",
      state,
      expectedVersion: 1,
      runAgent: async () => {
        providerCalls += 1;
        return { response, state };
      },
    });
    assert.equal(providerCalls, 1);
    assert.equal(completed.turn.status, CONVERSATION_TURN_STATUS.COMPLETED);
    assert.equal(completed.turn.providerCalls, 1);
    const userMessage = await db.conversationMessage.findFirstOrThrow({ where: { role: "user" } });
    assert.equal(completed.payload.userMessageId, userMessage.id);
    const completedPayloadTurn = completed.payload.turn;
    if (!completedPayloadTurn || typeof completedPayloadTurn !== "object" || !("status" in completedPayloadTurn)) {
      throw new Error("completed payload must include turn status");
    }
    assert.equal(completedPayloadTurn.status, "COMPLETED");
    assert.equal(await db.conversationMessage.count({ where: { role: "user" } }), 1);
    assert.equal(await db.conversationMessage.count({ where: { role: "assistant" } }), 1);
    const replay = await claim(db, projectId, "r1");
    assert.equal(replay.kind, "EXISTING");
    assert.deepEqual(
      parseStoredConversationResponse(replay.turn),
      JSON.parse(JSON.stringify(completed.payload)),
    );
  } finally {
    await closeDb(db);
  }
});
it("completed turn response payload is replayable without a new claim", async () => {
  const { db, projectId } = await makeDb();
  try {
    const first = await claim(db, projectId, "r2");
    assert.equal(first.kind, "CLAIMED");
    if (first.kind !== "CLAIMED") throw new Error("expected claim");
    const payload = { message: response.message, version: 2, turn: { status: "COMPLETED" } };
    await db.conversationTurn.update({ where: { id: first.turn.id }, data: { status: "COMPLETED", responsePayload: JSON.stringify(payload), projectVersion: 2 } });
    const duplicate = await claim(db, projectId, "r2");
    assert.equal(duplicate.kind, "EXISTING");
    assert.deepEqual(parseStoredConversationResponse(duplicate.turn), payload);
    assert.equal(await db.conversationMessage.count({ where: { role: "user" } }), 1);
  } finally {
    await closeDb(db);
  }
});

it("failed retry is atomically claimable, preserves provider count, and never duplicates user", async () => {
  const { db, projectId } = await makeDb();
  try {
    const first = await claim(db, projectId, "r3");
    assert.equal(first.kind, "CLAIMED");
    if (first.kind !== "CLAIMED") throw new Error("expected claim");
    await db.conversationTurn.update({ where: { id: first.turn.id }, data: { status: "FAILED", providerCalls: 1, errorSummary: "provider" } });
    const [retryOne, retryTwo] = await Promise.all([
      claimFailedConversationTurn(db, { projectId, turnId: first.turn.id }),
      claimFailedConversationTurn(db, { projectId, turnId: first.turn.id }),
    ]);
    const winner = retryOne.claimed ? retryOne : retryTwo;
    assert.equal([retryOne.claimed, retryTwo.claimed].filter(Boolean).length, 1);
    assert.equal(winner.turn.providerCalls, 1);
    await db.conversationTurn.update({ where: { id: first.turn.id }, data: { status: "COMPLETED", providerCalls: winner.turn.providerCalls + 1 } });
    const completed = await db.conversationTurn.findUnique({ where: { id: first.turn.id } });
    assert.equal(completed?.providerCalls, 2);
    assert.equal(await db.conversationMessage.count({ where: { role: "user" } }), 1);
  } finally {
    await closeDb(db);
  }
});

it("stale running retry is claimable and completes one assistant without duplicating user", async () => {
  const { db, projectId, state } = await makeDb();
  try {
    const first = await claim(db, projectId, "stale-retry");
    assert.equal(first.kind, "CLAIMED");
    if (first.kind !== "CLAIMED") throw new Error("expected claim");
    const now = Date.now();
    await db.conversationTurn.update({
      where: { id: first.turn.id },
      data: { updatedAt: new Date(now - CONVERSATION_TURN_STALE_MS - 1) },
    });
    const retryClaim = await claimFailedConversationTurn(db, {
      projectId,
      turnId: first.turn.id,
    });
    assert.equal(retryClaim.claimed, true);
    await runClaimedConversationTurn({
      db,
      projectId,
      turnId: first.turn.id,
      text: first.turn.text,
      mode: "BRAINSTORM",
      intent: "BRAINSTORM",
      state,
      expectedVersion: 1,
      attempt: retryClaim.turn.attempt,
      providerCalls: retryClaim.turn.providerCalls,
      runAgent: async () => ({ response, state }),
    });
    assert.equal(await db.conversationMessage.count({ where: { role: "user" } }), 1);
    assert.equal(await db.conversationMessage.count({ where: { role: "assistant" } }), 1);
    assert.equal(
      (await db.conversationTurn.findUnique({ where: { id: first.turn.id } }))?.status,
      CONVERSATION_TURN_STATUS.COMPLETED,
    );
  } finally {
    await closeDb(db);
  }
});
it("stale original attempt cannot complete after retry claims a new attempt", async () => {
  const { db, projectId, state } = await makeDb();
  try {
    const first = await claim(db, projectId, "fence");
    assert.equal(first.kind, "CLAIMED");
    if (first.kind !== "CLAIMED") throw new Error("expected claim");
    const originalAttempt = first.turn.attempt;
    await db.conversationTurn.update({
      where: { id: first.turn.id },
      data: { status: "FAILED", providerCalls: 1 },
    });
    const retryClaim = await claimFailedConversationTurn(db, {
      projectId,
      turnId: first.turn.id,
    });
    assert.equal(retryClaim.claimed, true);
    assert.equal(retryClaim.turn.attempt, originalAttempt + 1);
    await assert.rejects(
      runClaimedConversationTurn({
        db,
        projectId,
        turnId: first.turn.id,
        text: first.turn.text,
        mode: "BRAINSTORM",
        intent: "BRAINSTORM",
        state,
        expectedVersion: 1,
        attempt: originalAttempt,
        runAgent: async () => ({ response, state }),
      }),
      /CONVERSATION_TURN_NOT_CURRENT/,
    );
    assert.equal(
      (await db.conversationTurn.findUnique({ where: { id: first.turn.id } }))?.attempt,
      retryClaim.turn.attempt,
    );
  } finally {
    await closeDb(db);
  }
});

it("normal turn preserves an open contradiction after a grounded later fact", async () => {
  const { db, projectId, state } = await makeDb();
  try {
    state.targetUsers = ["internal employees"];
    const first = await claim(db, projectId, "contradiction-turn");
    assert.equal(first.kind, "CLAIMED");
    if (first.kind !== "CLAIMED") throw new Error("expected claim");
    const contradictionResponse = ConversationAgentResponseSchema.parse({
      ...response,
      message: "Public registration is now in scope.",
      stateDelta: {
        explicitFacts: [
          {
            path: "features",
            value: "public registration",
            evidence: "public registration",
          },
        ],
        confirmedDecisions: [],
        corrections: [],
        resolvedQuestions: [],
        resolvedAssumptions: [],
      },
    });
    await runClaimedConversationTurn({
      db,
      projectId,
      turnId: first.turn.id,
      text: "Add public registration for anyone.",
      mode: "BRAINSTORM",
      intent: "BRAINSTORM",
      state,
      expectedVersion: 1,
      runAgent: async () => ({
        response: contradictionResponse,
        state: applyConversationResponse(
          state,
          contradictionResponse,
          "Add public registration for anyone.",
        ),
      }),
    });
    const saved = await db.project.findUnique({ where: { id: projectId } });
    const parsed = JSON.parse(saved?.canonicalState || "{}");
    assert.equal(parsed.features.includes("public registration"), true);
    assert.equal(
      parsed.contradictions.some(
        (item: { id: string; status: string }) =>
          item.id === "internal-vs-public" && item.status === "OPEN",
      ),
      true,
    );
  } finally {
    await closeDb(db);
  }
});

it("stale running turns become failed while fresh running turns remain running", async () => {
  const { db, projectId } = await makeDb();
  try {
    const stale = await claim(db, projectId, "stale");
    const fresh = await claim(db, projectId, "fresh");
    assert.equal(stale.kind, "CLAIMED");
    assert.equal(fresh.kind, "CLAIMED");
    if (stale.kind !== "CLAIMED" || fresh.kind !== "CLAIMED") throw new Error("expected claims");
    const now = Date.now();
    await db.conversationTurn.update({ where: { id: stale.turn.id }, data: { updatedAt: new Date(now - CONVERSATION_TURN_STALE_MS - 1) } });
    await recoverStaleConversationTurns(db, now);
    assert.equal((await db.conversationTurn.findUnique({ where: { id: stale.turn.id } }))?.status, CONVERSATION_TURN_STATUS.FAILED);
    assert.equal((await db.conversationTurn.findUnique({ where: { id: fresh.turn.id } }))?.status, CONVERSATION_TURN_STATUS.RUNNING);
  } finally {
    await closeDb(db);
  }
});
it("persists semantic model-output and provider summaries without raw errors", async () => {
  const { db, projectId, state } = await makeDb();
  try {
    const outputTurn = await claim(db, projectId, "semantic-output");
    assert.equal(outputTurn.kind, "CLAIMED");
    if (outputTurn.kind !== "CLAIMED") throw new Error("expected claim");
    await assert.rejects(
      runClaimedConversationTurn({
        db,
        projectId,
        turnId: outputTurn.turn.id,
        text: outputTurn.turn.text,
        mode: "BRAINSTORM",
        intent: "BRAINSTORM",
        state,
        expectedVersion: 1,
        runAgent: async () => {
          throw new ConversationAgentOutputError(
            "private provider body should never persist",
          );
        },
      }),
    );
    const failedOutput = await db.conversationTurn.findUniqueOrThrow({
      where: { id: outputTurn.turn.id },
    });
    assert.equal(failedOutput.errorSummary, AI_INVALID_RESPONSE_MESSAGE);
    assert.equal(publicConversationTurn(failedOutput).errorSummary, AI_INVALID_RESPONSE_MESSAGE);

    const providerTurn = await claim(db, projectId, "semantic-provider");
    assert.equal(providerTurn.kind, "CLAIMED");
    if (providerTurn.kind !== "CLAIMED") throw new Error("expected claim");
    await assert.rejects(
      runClaimedConversationTurn({
        db,
        projectId,
        turnId: providerTurn.turn.id,
        text: providerTurn.turn.text,
        mode: "BRAINSTORM",
        intent: "BRAINSTORM",
        state,
        expectedVersion: 1,
        runAgent: async () => {
          throw new Error("private provider body should never persist");
        },
      }),
    );
    const failedProvider = await db.conversationTurn.findUniqueOrThrow({
      where: { id: providerTurn.turn.id },
    });
    assert.equal(failedProvider.errorSummary, AI_PROVIDER_ERROR_MESSAGE);
    assert.equal(publicConversationTurn(failedProvider).errorSummary, AI_PROVIDER_ERROR_MESSAGE);
    assert.equal(failedProvider.errorSummary.includes("private"), false);
  } finally {
    await closeDb(db);
  }
});

it("fast-paths explicit product rules without calling the Conversation Agent", async () => {
  const { db, projectId, state } = await makeDb();
  try {
    const text =
      "Only the seller/owner can confirm an order. Customers must not be able to edit an order after payment.";
    const claimed = await claimConversationTurn(db, {
      projectId,
      requestId: "explicit-rules",
      text,
    });
    assert.equal(claimed.kind, "CLAIMED");
    if (claimed.kind !== "CLAIMED") throw new Error("expected claim");
    const runAgent = vi.fn();

    const completed = await runClaimedConversationTurn({
      db,
      projectId,
      turnId: claimed.turn.id,
      text,
      mode: "BRAINSTORM",
      intent: "BRAINSTORM",
      state,
      expectedVersion: 1,
      runAgent,
    });

    assert.equal(runAgent.mock.calls.length, 0);
    assert.equal(completed.turn.providerCalls, 0);
    assert.equal(completed.turn.status, CONVERSATION_TURN_STATUS.COMPLETED);
    assert.equal(await db.conversationMessage.count({ where: { projectId } }), 2);
    assert.equal(await db.projectStateRevision.count({ where: { projectId } }), 1);
    assert.deepEqual(completed.state.businessRules, [
      "Only the seller/owner can confirm an order.",
      "Customers must not be able to edit an order after payment.",
    ]);
    assert.equal(
      completed.state.provenance[
        "businessRules.Customers must not be able to edit an order after payment."
      ]?.evidence,
      "Customers must not be able to edit an order after payment.",
    );
    assert.equal(isProductDraftCurrent(state, completed.state), false);
  } finally {
    await closeDb(db);
  }
});
});
