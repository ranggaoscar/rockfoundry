type ProjectState = {
  normalizedSummary?: string;
  rawIdea?: string;
  assumptions?: Array<{
    id?: string;
    statement?: string;
    confidence?: string;
    impact?: string;
    resolved?: boolean;
  }>;
  openQuestions?: string[];
  discovery?: { unresolvedTopics?: string[] };
  studio?: {
    status?: string;
    currentVersion?: number;
    approvedVersion?: number | null;
    stale?: boolean;
    screenMap?: Array<{
      id?: string;
      name?: string;
      route?: string;
      purpose?: string;
      status?: string;
    }>;
  };
};

type DraftDocument = {
  type: string;
  fileName: string;
  status: string;
  current: boolean;
  version: number;
  content?: string;
};

type DraftGeneration = {
  id: string;
  generationNumber: number;
  canonicalVersion: number;
  status: string;
} | null;

type ScreenMapEntry = {
  name?: string;
  route?: string;
  purpose?: string;
  status?: string;
};

export type ProjectWebMcpContextInput = {
  project: {
    id: string;
    name: string;
    description: string | null;
    canonicalState: ProjectState;
    version: number;
  };
  draft: {
    generation: DraftGeneration;
    documents: DraftDocument[];
    hasCurrentDraft: boolean;
  };
  screenMap?: ScreenMapEntry[];
};

export function buildProjectWebMcpContext({
  project,
  draft,
  screenMap,
}: ProjectWebMcpContextInput) {
  const screens =
    screenMap?.length ? screenMap : project.canonicalState.studio?.screenMap || [];
  const assumptions = (project.canonicalState.assumptions || [])
    .filter((assumption) => !assumption.resolved && assumption.statement)
    .map((assumption) => ({
      statement: assumption.statement,
      confidence: assumption.confidence || "UNKNOWN",
      impact: assumption.impact || "MEDIUM",
    }));
  const studio = project.canonicalState.studio;

  return {
    project: {
      id: project.id,
      name: project.name,
      summary:
        project.canonicalState.normalizedSummary ||
        project.description ||
        project.canonicalState.rawIdea ||
        null,
      version: project.version,
    },
    productDraft: {
      status:
        draft.generation?.status ||
        (draft.documents.length > 0 ? "COMPLETE" : "NOT_STARTED"),
      generation: draft.generation
        ? {
            id: draft.generation.id,
            number: draft.generation.generationNumber,
            canonicalVersion: draft.generation.canonicalVersion,
          }
        : null,
      hasCurrentDraft: draft.hasCurrentDraft,
      documents: draft.documents.map((document) => ({
        type: document.type,
        fileName: document.fileName,
        status: document.status,
        current: document.current,
        version: document.version,
      })),
    },
    screenMap: screens.map((screen) => ({
      name: screen.name || "Untitled screen",
      route: screen.route || null,
      purpose: screen.purpose || null,
      status: screen.status || null,
    })),
    design: {
      status: studio?.status || "NOT_STARTED",
      currentVersion: studio?.currentVersion || 0,
      approvedVersion: studio?.approvedVersion || null,
      stale: studio?.stale || false,
      prototypeAvailable: Boolean((studio?.currentVersion || 0) > 0),
    },
    openQuestions:
      project.canonicalState.openQuestions?.length
        ? project.canonicalState.openQuestions
        : project.canonicalState.discovery?.unresolvedTopics || [],
    assumptions,
  };
}
