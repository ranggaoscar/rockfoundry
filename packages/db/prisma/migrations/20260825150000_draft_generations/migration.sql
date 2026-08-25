-- CreateTable
CREATE TABLE "DraftGeneration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "canonicalVersion" INTEGER NOT NULL,
    "generationNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "sourceGenerationId" TEXT,
    "composerInput" TEXT NOT NULL,
    "composerMetadata" TEXT,
    "errorSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "DraftGeneration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DraftGeneration_sourceGenerationId_fkey" FOREIGN KEY ("sourceGenerationId") REFERENCES "DraftGeneration" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Rebuild Artifact so the optional generation relation is enforced while preserving legacy rows.
CREATE TABLE "Artifact_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "draftGenerationId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "canonicalVersion" INTEGER,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Artifact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Artifact_draftGenerationId_fkey" FOREIGN KEY ("draftGenerationId") REFERENCES "DraftGeneration" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "Artifact_new" ("id", "projectId", "draftGenerationId", "type", "status", "content", "version", "canonicalVersion", "generatedAt")
SELECT "id", "projectId", NULL, "type", "status", "content", "version", NULL, "generatedAt" FROM "Artifact";

DROP TABLE "Artifact";
ALTER TABLE "Artifact_new" RENAME TO "Artifact";

CREATE UNIQUE INDEX "Artifact_projectId_type_version_key" ON "Artifact"("projectId", "type", "version");
CREATE INDEX "Artifact_projectId_type_generatedAt_idx" ON "Artifact"("projectId", "type", "generatedAt");
CREATE INDEX "Artifact_draftGenerationId_type_idx" ON "Artifact"("draftGenerationId", "type");
CREATE UNIQUE INDEX "DraftGeneration_projectId_generationNumber_key" ON "DraftGeneration"("projectId", "generationNumber");
CREATE INDEX "DraftGeneration_projectId_canonicalVersion_status_generationNumber_idx" ON "DraftGeneration"("projectId", "canonicalVersion", "status", "generationNumber");
