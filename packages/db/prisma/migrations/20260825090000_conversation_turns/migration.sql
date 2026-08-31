-- CreateTable
CREATE TABLE "ConversationTurn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "projectVersion" INTEGER,
    "responsePayload" TEXT,
    "errorSummary" TEXT,
    "providerCalls" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "ConversationTurn_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
ALTER TABLE "ConversationMessage" ADD COLUMN "conversationTurnId" TEXT;
ALTER TABLE "ConversationMessage" ADD COLUMN "requestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ConversationTurn_projectId_requestId_key" ON "ConversationTurn"("projectId", "requestId");
CREATE INDEX "ConversationTurn_projectId_createdAt_idx" ON "ConversationTurn"("projectId", "createdAt");
CREATE INDEX "ConversationTurn_projectId_status_updatedAt_idx" ON "ConversationTurn"("projectId", "status", "updatedAt");
CREATE INDEX "ConversationMessage_projectId_conversationTurnId_idx" ON "ConversationMessage"("projectId", "conversationTurnId");
CREATE INDEX "ConversationMessage_projectId_requestId_idx" ON "ConversationMessage"("projectId", "requestId");
