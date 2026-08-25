import {
  renderDraftArtifacts,
  validateConsistency,
  type DraftArtifactDocuments,
  type ProjectState,
} from "@rockfoundry/core";
import { prisma } from "@rockfoundry/db";

export const DRAFT_ARTIFACT_TYPES = [
  "BRD",
  "PRD",
  "ERD",
  "USER_FLOWS",
  "SCREEN_MAP",
  "DESIGN_BRIEF",
] as const;

export type DraftArtifactType = (typeof DRAFT_ARTIFACT_TYPES)[number];

export const DRAFT_ARTIFACT_FILES: Record<DraftArtifactType, string> = {
  BRD: "BRD.md",
  PRD: "PRD.md",
  ERD: "ERD.md",
  USER_FLOWS: "USER_FLOWS.md",
  SCREEN_MAP: "SCREEN_MAP.md",
  DESIGN_BRIEF: "DESIGN_BRIEF.md",
};

export function draftArtifactEntries(
  documents: DraftArtifactDocuments,
): Array<[DraftArtifactType, string]> {
  return DRAFT_ARTIFACT_TYPES.map((type) => [type, documents[type]]);
}

export async function persistDraftArtifacts(
  projectId: string,
  projectVersion: number,
  state: ProjectState,
) {
  const documents = renderDraftArtifacts(state);
  const consistency = validateConsistency(state);
  const artifacts = await prisma.$transaction(
    draftArtifactEntries(documents).map(([type, content]) =>
      prisma.artifact.upsert({
        where: {
          projectId_type_version: {
            projectId,
            type,
            version: projectVersion,
          },
        },
        create: {
          projectId,
          type,
          status: consistency.status === "BLOCKING" ? "DRAFT" : "READY",
          content,
          version: projectVersion,
        },
        update: {
          status: consistency.status === "BLOCKING" ? "DRAFT" : "READY",
          content,
          generatedAt: new Date(),
        },
      }),
    ),
  );

  return { documents, consistency, artifacts };
}

export function publicDraftArtifact(artifact: {
  id: string;
  type: string;
  status: string;
  content: string;
  version: number;
  generatedAt: Date;
}) {
  const type = artifact.type as DraftArtifactType;
  return {
    id: artifact.id,
    type,
    fileName: DRAFT_ARTIFACT_FILES[type] || `${artifact.type}.md`,
    status: artifact.status,
    content: artifact.content,
    version: artifact.version,
    generatedAt: artifact.generatedAt,
  };
}
