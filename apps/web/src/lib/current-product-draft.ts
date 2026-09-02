import { ProjectStateSchema, type ProjectState } from "@rockfoundry/core";
import { prisma } from "@rockfoundry/db";
import { isProductDraftCurrent } from "./project-truth";

const DRAFT_ARTIFACT_TYPES = [
  "BRD",
  "PRD",
  "ERD",
  "USER_FLOWS",
  "SCREEN_MAP",
  "DESIGN_BRIEF",
] as const;
type DraftArtifactType = (typeof DRAFT_ARTIFACT_TYPES)[number];

type DraftArtifact = {
  type: string;
  content: string;
  canonicalVersion: number | null;
};

type CurrentDraft = {
  generation: { canonicalVersion: number } | null;
  artifacts: DraftArtifact[];
};

export const CURRENT_PRODUCT_DRAFT_ERROR = "CURRENT_PRODUCT_DRAFT_REQUIRED";

export function hasCompleteCurrentProductDraft(
  draft: CurrentDraft | null,
  currentVersion: number,
  isCurrent: boolean,
) {
  return Boolean(
    draft &&
    isCurrent &&
    draft.generation?.canonicalVersion === currentVersion &&
    draft.artifacts.length === DRAFT_ARTIFACT_TYPES.length &&
    DRAFT_ARTIFACT_TYPES.every((type) => {
      const artifact = draft.artifacts.find((entry) => entry.type === type);
      return Boolean(artifact?.content.trim());
    }),
  );
}

async function draftMatchesCurrentState(
  projectId: string,
  currentVersion: number,
  currentState: ProjectState,
  draftCanonicalVersion: number | null | undefined,
) {
  if (draftCanonicalVersion !== currentVersion) return false;
  const revision = await prisma.projectStateRevision.findUnique({
    where: {
      projectId_version: { projectId, version: draftCanonicalVersion },
    },
    select: { state: true },
  });
  if (!revision) return true;
  try {
    return isProductDraftCurrent(
      ProjectStateSchema.parse(JSON.parse(revision.state)),
      currentState,
    );
  } catch {
    return false;
  }
}

export async function getCurrentProductDraft(input: {
  projectId: string;
  currentVersion: number;
  currentState: ProjectState;
}) {
  const { latestDraftArtifacts } = await import("./artifact-composer");
  const draft = await latestDraftArtifacts(
    input.projectId,
    input.currentVersion,
  );
  const isCurrent = await draftMatchesCurrentState(
    input.projectId,
    input.currentVersion,
    input.currentState,
    draft?.generation?.canonicalVersion,
  );
  return {
    draft,
    isCurrent: hasCompleteCurrentProductDraft(
      draft,
      input.currentVersion,
      isCurrent,
    ),
  };
}

export async function assertCurrentProductDraft(input: {
  projectId: string;
  currentVersion: number;
  currentState: ProjectState;
}) {
  const result = await getCurrentProductDraft(input);
  if (!result.draft || !result.isCurrent)
    throw new Error(CURRENT_PRODUCT_DRAFT_ERROR);
  return result.draft as {
    generation: { canonicalVersion: number };
    artifacts: Array<{ type: DraftArtifactType; content: string }>;
  };
}
