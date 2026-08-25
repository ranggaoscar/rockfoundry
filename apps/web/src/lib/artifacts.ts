import type { ProjectState } from "@rockfoundry/core";
import {
  composeDraftArtifacts,
  DRAFT_ARTIFACT_FILES,
  DRAFT_ARTIFACT_TYPES,
  latestDraftArtifacts,
  publicDraftArtifact,
} from "./artifact-composer";

export { DRAFT_ARTIFACT_FILES, DRAFT_ARTIFACT_TYPES, latestDraftArtifacts, publicDraftArtifact };
export type { DraftArtifactType } from "./artifact-composer";

export function draftArtifactEntries(documents: Record<string, string>) {
  return DRAFT_ARTIFACT_TYPES.map((type) => [type, documents[type]] as const);
}

export async function persistDraftArtifacts(
  projectId: string,
  projectVersion: number,
  state: ProjectState,
) {
  return composeDraftArtifacts(projectId, projectVersion, state);
}
