import type { ProjectState } from "../schema/project";
import type { DesignGenerationResult } from "../schema/design";
import { DesignStateSchema } from "../schema/design";
import { evaluateDesignReadiness } from "./readiness";

export function applyGeneratedDesign(
  state: ProjectState,
  generated: DesignGenerationResult,
  input: { summary: string; source?: "USER" | "SYSTEM"; request?: string; status?: "DRAFT" | "IN_REVIEW" | "NEEDS_REVIEW" } = {
    summary: generated.summary,
  },
): ProjectState {
  const nextVersion = state.studio.currentVersion + 1;
  const readiness = evaluateDesignReadiness(state);
  const studio = DesignStateSchema.parse({
    ...state.studio,
    status: input.status || "DRAFT",
    readiness,
    direction: generated.designSpec.direction,
    screenMap: generated.screenMap,
    activeScreenId: generated.screenMap[0]?.id || null,
    currentVersion: nextVersion,
    stale: false,
    staleScreens: [],
    assumptions: generated.assumptions,
    debt: {
      unresolved: generated.assumptions,
      count: generated.assumptions.length,
    },
    revisions: [
      ...state.studio.revisions,
      {
        version: nextVersion,
        summary: input.summary,
        createdAt: new Date().toISOString(),
        source: input.source || "SYSTEM",
        affectedScreens: generated.screenMap.map((screen) => screen.id),
      },
    ],
  });
  return {
    ...state,
    studio,
    generationMetadata: {
      ...state.generationMetadata,
      designPackage: {
        version: nextVersion,
        spec: generated.designSpec,
        files: generated.files,
        summary: generated.summary,
      },
    },
  };
}

export function approveDesign(state: ProjectState): ProjectState {
  if (state.studio.currentVersion < 1) return state;
  return {
    ...state,
    studio: {
      ...state.studio,
      status: "APPROVED",
      approvedVersion: state.studio.currentVersion,
      approvedAt: new Date().toISOString(),
      stale: false,
    },
  };
}

export function markDesignStale(
  state: ProjectState,
  screenIds: string[],
): ProjectState {
  if (state.studio.currentVersion < 1) return state;
  return {
    ...state,
    studio: {
      ...state.studio,
      status: "NEEDS_REVIEW",
      stale: true,
      staleScreens: [...new Set([...state.studio.staleScreens, ...screenIds])],
    },
  };
}
