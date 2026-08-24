-- CreateTable
CREATE TABLE "DesignGenerationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "projectVersion" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "stage" TEXT NOT NULL DEFAULT 'DESIGN_ARCHITECTURE',
    "progress" TEXT NOT NULL DEFAULT '{}',
    "errorSummary" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "heartbeatAt" DATETIME,
    CONSTRAINT "DesignGenerationJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DesignGenerationJob_projectId_createdAt_idx" ON "DesignGenerationJob"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "DesignGenerationJob_status_heartbeatAt_idx" ON "DesignGenerationJob"("status", "heartbeatAt");