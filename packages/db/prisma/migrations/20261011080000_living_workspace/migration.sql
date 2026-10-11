CREATE TABLE "CapturedIdea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INBOX',
    "conversionType" TEXT,
    "conversionId" TEXT,
    CONSTRAINT "CapturedIdea_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CapturedIdea_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "CapturedIdea_workspaceId_status_createdAt_idx" ON "CapturedIdea"("workspaceId", "status", "createdAt");
CREATE INDEX "CapturedIdea_projectId_createdAt_idx" ON "CapturedIdea"("projectId", "createdAt");
CREATE UNIQUE INDEX "CapturedIdea_workspaceId_ownerId_requestId_key" ON "CapturedIdea"("workspaceId", "ownerId", "requestId");

CREATE TABLE "RockThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RockThread_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RockThread_workspaceId_ownerId_updatedAt_idx" ON "RockThread"("workspaceId", "ownerId", "updatedAt");

CREATE TABLE "RockMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "turnId" TEXT,
    CONSTRAINT "RockMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "RockThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RockMessage_turnId_key" ON "RockMessage"("turnId");
CREATE INDEX "RockMessage_threadId_createdAt_idx" ON "RockMessage"("threadId", "createdAt");

CREATE TABLE "RockTurn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "userMessageId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "executorId" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "externalId" TEXT,
    "leaseUntil" DATETIME,
    "errorSummary" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "assistantMessageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RockTurn_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "RockThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RockTurn_userMessageId_fkey" FOREIGN KEY ("userMessageId") REFERENCES "RockMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RockTurn_assistantMessageId_fkey" FOREIGN KEY ("assistantMessageId") REFERENCES "RockMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RockTurn_userMessageId_key" ON "RockTurn"("userMessageId");
CREATE UNIQUE INDEX "RockTurn_requestId_key" ON "RockTurn"("requestId");
CREATE UNIQUE INDEX "RockTurn_assistantMessageId_key" ON "RockTurn"("assistantMessageId");
CREATE INDEX "RockTurn_threadId_createdAt_idx" ON "RockTurn"("threadId", "createdAt");
CREATE INDEX "RockTurn_status_leaseUntil_idx" ON "RockTurn"("status", "leaseUntil");
CREATE UNIQUE INDEX "RockTurn_threadId_requestId_key" ON "RockTurn"("threadId", "requestId");

CREATE TABLE "RockProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "turnId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" TEXT,
    "decisionAt" DATETIME,
    CONSTRAINT "RockProposal_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "RockTurn" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RockProposal_turnId_status_idx" ON "RockProposal"("turnId", "status");
CREATE UNIQUE INDEX "RockProposal_turnId_position_key" ON "RockProposal"("turnId", "position");
