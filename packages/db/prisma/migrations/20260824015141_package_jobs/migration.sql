-- CreateTable
CREATE TABLE "PackageJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "projectVersion" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "stage" TEXT NOT NULL DEFAULT 'PREPARING_PRODUCT',
    "completedStages" TEXT NOT NULL DEFAULT '[]',
    "progress" TEXT NOT NULL DEFAULT '{}',
    "errorSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "heartbeatAt" DATETIME,
    CONSTRAINT "PackageJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PackageJob_projectId_createdAt_idx" ON "PackageJob"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "PackageJob_status_heartbeatAt_idx" ON "PackageJob"("status", "heartbeatAt");
