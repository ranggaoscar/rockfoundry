import { prisma } from "@rockfoundry/db";
import {
  applyGeneratedDesign,
  buildDesignSpec,
  type DesignSpec,
  applyVisualRevision,
  approveDesign,
  classifyDesignRevision,
  evaluateDesignReadiness,
  generateMockPrototype,
  markDesignStale,
  renderDraftArtifacts,
  validatePrototypeFiles,
  validatePrototypeQuality,
  DesignGenerationResultSchema,
  deriveScreenMap,
  type DesignGenerationResult,
  type DesignScreen,
  type ProjectState,
} from "@rockfoundry/core";
import { resolveProviderSettings } from "./provider-config";
import { getAiGateway } from "./ai-provider";
import { saveProjectState } from "./local-project";
import { createServerToolRegistry } from "./server-tools";
import { AgentRunner } from "@rockfoundry/core";
import {
  classifyDesignFailure,
  formatDesignFailureDiagnostics,
  safeDesignFailureMessage,
} from "@rockfoundry/ai";
import {
  latestDraftArtifacts,
  DRAFT_ARTIFACT_TYPES,
} from "./artifact-composer";
import { parsePersistedScreenMap } from "./design-draft-bridge";

export class DesignGenerationError extends Error {
  constructor(
    public readonly task:
      | "design_architecture"
      | "draft_screen_map"
      | "prototype_generation"
      | "prototype_validation"
      | "quality_review"
      | "prototype_repair",
    public readonly cause: unknown,
  ) {
    super(`Design generation failed during ${task}.`);
    this.name = "DesignGenerationError";
  }
}

export function classifyDesignGenerationFailure(error: unknown) {
  const failure =
    error instanceof DesignGenerationError
      ? error
      : new DesignGenerationError("prototype_generation", error);
  return classifyDesignFailure(failure.cause, { task: failure.task });
}

export function logDesignGenerationFailure(error: unknown) {
  const failure =
    error instanceof DesignGenerationError
      ? error
      : new DesignGenerationError("prototype_generation", error);
  const diagnostics = classifyDesignFailure(failure.cause, {
    task: failure.task,
  });
  console.error(
    `[design-generation] ${formatDesignFailureDiagnostics(diagnostics)}`,
  );
  return diagnostics;
}

export function designGenerationUserMessage(error: unknown) {
  if (
    error instanceof DesignGenerationError &&
    error.task === "draft_screen_map"
  )
    return "Screen Map dari Product Draft saat ini tidak dapat digunakan. Generate ulang Product Draft sebelum membuat prototype.";
  return safeDesignFailureMessage(classifyDesignGenerationFailure(error));
}

const ARTIFACT_TYPES = [
  "DESIGN_SPEC",
  "SCREEN_MAP",
  "DESIGN_DECISIONS",
  "PROTOTYPE_HTML",
  "PROTOTYPE_CSS",
  "PROTOTYPE_JS",
  "DESIGN_MANIFEST",
] as const;

async function persistDesignArtifacts(
  projectId: string,
  version: number,
  generated: DesignGenerationResult,
  status: string,
  canonicalVersion?: number,
) {
  const files = Object.fromEntries(
    generated.files.map((file) => [file.path, file.content]),
  );
  const payloads: Record<(typeof ARTIFACT_TYPES)[number], string> = {
    DESIGN_SPEC: JSON.stringify(generated.designSpec, null, 2),
    SCREEN_MAP: JSON.stringify(generated.screenMap, null, 2),
    DESIGN_DECISIONS: generated.summary,
    PROTOTYPE_HTML: files["index.html"] || "",
    PROTOTYPE_CSS: files["styles.css"] || "",
    PROTOTYPE_JS: files["app.js"] || "",
    DESIGN_MANIFEST: JSON.stringify({
      version,
      canonicalVersion: canonicalVersion ?? null,
      status,
      screens: generated.screenMap.map((screen) => screen.id),
    }),
  };
  await prisma.$transaction(
    ARTIFACT_TYPES.map((type) =>
      prisma.artifact.upsert({
        where: { projectId_type_version: { projectId, type, version } },
        create: {
          projectId,
          type,
          version,
          canonicalVersion: canonicalVersion ?? null,
          status,
          content: payloads[type],
        },
        update: {
          status,
          canonicalVersion: canonicalVersion ?? null,
          content: payloads[type],
          generatedAt: new Date(),
        },
      }),
    ),
  );
}
export function designSnapshot(state: ProjectState) {
  const pack = state.generationMetadata.designPackage as
    | { files?: Array<{ path: string; content: string }>; spec?: unknown }
    | undefined;
  return {
    studio: state.studio,
    readiness: evaluateDesignReadiness(state),
    files: pack?.files || [],
    spec: pack?.spec || null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function hasExplicitUserProvenance(
  state: ProjectState,
  prefixes: string[],
  value: string,
) {
  return prefixes.some((prefix) => {
    const provenance = state.provenance[`${prefix}.${value}`];
    return (
      provenance?.source === "USER" && provenance.confidence === "EXPLICIT"
    );
  });
}

function explicitValues(
  state: ProjectState,
  values: string[],
  prefixes: string[],
) {
  return values.filter((value) =>
    hasExplicitUserProvenance(state, prefixes, value),
  );
}

function explicitAcceptedDecisions(state: ProjectState) {
  return state.decisions.filter(
    (decision) =>
      decision.status === "ACCEPTED" &&
      decision.source === "USER" &&
      decision.confidence === "EXPLICIT" &&
      hasExplicitUserProvenance(state, ["decision"], decision.topic),
  );
}

function explicitDesignState(state: ProjectState) {
  return {
    productType:
      state.productType &&
      hasExplicitUserProvenance(state, ["productType"], state.productType)
        ? state.productType
        : null,
    targetUsers: explicitValues(state, state.targetUsers, [
      "targetUsers",
      "user",
    ]),
    roles: explicitValues(state, state.roles, ["roles", "role"]),
    entities: explicitValues(state, state.entities, ["entities", "entity"]),
    workflows: explicitValues(state, state.workflows, [
      "workflows",
      "workflow",
    ]),
    features: explicitValues(state, state.features, ["features", "feature"]),
    constraints: explicitValues(state, state.constraints, [
      "constraints",
      "constraint",
    ]),
    decisions: explicitAcceptedDecisions(state),
  };
}

function designInputSnapshot(state: ProjectState) {
  const explicit = explicitDesignState(state);
  const acceptedDecisions = explicit.decisions.map(
    ({ topic, decision, affects }) => ({
      topic,
      decision,
      affects,
    }),
  );
  const actors = [...explicit.targetUsers, ...explicit.roles];
  const rawProposals = state.generationMetadata.conversationProposals;
  const proposals = Array.isArray(rawProposals)
    ? rawProposals
        .filter(isRecord)
        .map((proposal) => ({
          topic: typeof proposal.topic === "string" ? proposal.topic : null,
          statement:
            typeof proposal.statement === "string" ? proposal.statement : null,
          status:
            typeof proposal.status === "string" ? proposal.status : "PROPOSED",
        }))
        .filter((proposal) => proposal.topic || proposal.statement)
    : [];
  const rawDesignSignals = state.generationMetadata.designSignals;
  const designSignals = [
    ...state.design,
    ...(Array.isArray(rawDesignSignals) ? rawDesignSignals : []),
  ]
    .map((signal) => {
      if (typeof signal === "string") return signal;
      if (isRecord(signal) && typeof signal.value === "string")
        return signal.value;
      return null;
    })
    .filter((signal): signal is string => Boolean(signal));

  return {
    confirmedTruth: {
      actors: [...new Set(actors)],
      workflows: explicit.workflows,
      scope: explicit.features,
      constraints: explicit.constraints,
      acceptedDecisions,
    },
    draftSpec: {
      productName: state.name,
      summary: state.normalizedSummary || state.rawIdea,
    },
    labeled: {
      assumptions: state.assumptions
        .filter((assumption) => !assumption.resolved)
        .map((assumption) => assumption.statement),
      proposals,
      openQuestions: [...state.openQuestions],
    },
    designSignals: [...new Set(designSignals)],
  };
}

export type PersistedDraftArtifacts = Partial<
  Record<"PRD" | "USER_FLOWS" | "SCREEN_MAP" | "DESIGN_BRIEF", string>
>;

export function designProductContext(
  state: ProjectState,
  persistedDraft?: PersistedDraftArtifacts,
) {
  const explicit = explicitDesignState(state);
  const fallback = renderDraftArtifacts(state);
  const draftArtifacts = {
    PRD: persistedDraft?.PRD || fallback.PRD,
    USER_FLOWS: persistedDraft?.USER_FLOWS || fallback.USER_FLOWS,
    SCREEN_MAP: persistedDraft?.SCREEN_MAP || fallback.SCREEN_MAP,
    DESIGN_BRIEF: persistedDraft?.DESIGN_BRIEF || fallback.DESIGN_BRIEF,
  };
  return {
    name: state.name,
    summary: state.normalizedSummary || state.rawIdea,
    productType: explicit.productType,
    targetUsers: explicit.targetUsers,
    roles: explicit.roles,
    entities: explicit.entities,
    workflows: explicit.workflows,
    features: explicit.features,
    decisions: explicit.decisions.map(({ topic, decision, affects }) => ({
      topic,
      decision,
      affects,
    })),
    assumptions: state.assumptions
      .filter((assumption) => !assumption.resolved)
      .map((assumption) => assumption.statement),
    draftArtifacts,
    designInputSnapshot: designInputSnapshot(state),
  };
}

type DesignGenerationStage =
  | "DESIGN_ARCHITECTURE"
  | "PROTOTYPE_GENERATION"
  | "QUALITY_REVIEW"
  | "PROTOTYPE_REPAIR";

type ArchitectureResolution = {
  designSpec: DesignSpec;
  summary: string;
  assumptions: string[];
  source: "AI" | "BASELINE_FALLBACK";
  attemptMs: number;
  failure?: ReturnType<typeof classifyDesignGenerationFailure>;
};

async function generateWithRealProvider(
  state: ProjectState,
  input: { request?: string; existing?: DesignGenerationResult } = {},
  gateway = getAiGateway(),
  onStage?: (stage: DesignGenerationStage) => void | Promise<void>,
  persistedDraft?: PersistedDraftArtifacts,
  persistedScreenMap?: DesignScreen[],
): Promise<
  DesignGenerationResult & {
    architectureResolution: ArchitectureResolution;
    prototypeMs: number;
  }
> {
  const product = designProductContext(state, persistedDraft);
  const screenMap = persistedScreenMap?.length
    ? persistedScreenMap
    : state.studio.screenMap.length
      ? state.studio.screenMap
      : deriveScreenMap(state);
  const baseline = buildDesignSpec(state, screenMap);
  const architectureStarted = Date.now();
  let architecture: ArchitectureResolution;
  try {
    await onStage?.("DESIGN_ARCHITECTURE");
    const response = await gateway.runDesignArchitecture({
      product,
      screenMap,
    });
    architecture = {
      designSpec: response.architecture.designSpec,
      summary: response.architecture.summary,
      assumptions: response.architecture.assumptions,
      source: "AI",
      attemptMs: Date.now() - architectureStarted,
    };
  } catch (error) {
    const failure = classifyDesignGenerationFailure(
      new DesignGenerationError("design_architecture", error),
    );
    architecture = {
      designSpec: baseline,
      summary:
        "Deterministic baseline design direction derived from Product Truth and Screen Map.",
      assumptions: [],
      source: "BASELINE_FALLBACK",
      attemptMs: Date.now() - architectureStarted,
      failure,
    };
  }
  let prototype;
  const prototypeStarted = Date.now();
  try {
    await onStage?.("PROTOTYPE_GENERATION");
    prototype = await gateway.runPrototypeGeneration({
      product,
      architecture: {
        designSpec: architecture.designSpec,
        summary: architecture.summary,
        assumptions: architecture.assumptions,
      },
      screenMap,
      revisionRequest: input.request,
      existingFiles: input.existing?.files,
    });
  } catch (error) {
    throw new DesignGenerationError("prototype_generation", error);
  }
  try {
    return {
      ...DesignGenerationResultSchema.parse({
        designSpec: architecture.designSpec,
        screenMap,
        files: prototype.prototype.files,
        summary: prototype.prototype.summary || architecture.summary,
        assumptions: [
          ...architecture.assumptions,
          ...prototype.prototype.assumptions,
        ],
      }),
      architectureResolution: architecture,
      prototypeMs: Date.now() - prototypeStarted,
    };
  } catch (error) {
    throw new DesignGenerationError("prototype_validation", error);
  }
}

export async function generateProjectDesign(
  projectId: string,
  state: ProjectState,
  version: number,
  request?: string,
  deps: {
    providerSettings?: ReturnType<typeof resolveProviderSettings>;
    gateway?: ReturnType<typeof getAiGateway>;
    save?: typeof saveProjectState;
    persist?: typeof persistDesignArtifacts;
    onStage?: (stage: DesignGenerationStage) => void | Promise<void>;
    persistedDraft?: PersistedDraftArtifacts;
  } = {},
) {
  const totalStarted = Date.now();
  if (!state.rawIdea.trim() && !state.normalizedSummary?.trim())
    throw new Error("DESIGN_BLOCKED");
  const hasCurrentPersistedScreenMap = Object.prototype.hasOwnProperty.call(
    deps.persistedDraft || {},
    "SCREEN_MAP",
  );
  const persistedScreenMap = hasCurrentPersistedScreenMap
    ? parsePersistedScreenMap(deps.persistedDraft?.SCREEN_MAP || "")
    : [];
  if (hasCurrentPersistedScreenMap && persistedScreenMap.length === 0)
    throw new DesignGenerationError(
      "draft_screen_map",
      new Error("CURRENT_DRAFT_SCREEN_MAP_UNUSABLE"),
    );
  const effectiveScreenMap = persistedScreenMap.length
    ? persistedScreenMap
    : state.studio.screenMap.length
      ? state.studio.screenMap
      : deriveScreenMap(state);
  const product = designProductContext(state, deps.persistedDraft);
  const settings = deps.providerSettings || resolveProviderSettings();
  const generated =
    settings.mode === "openai-compatible"
      ? await generateWithRealProvider(
          state,
          { request },
          deps.gateway,
          deps.onStage,
          deps.persistedDraft,
          effectiveScreenMap,
        )
      : (await deps.onStage?.("PROTOTYPE_GENERATION"),
        generateMockPrototype(state, {
          request,
          screenMap: effectiveScreenMap,
        }));
  const architectureResolution: ArchitectureResolution =
    "architectureResolution" in generated
      ? (generated.architectureResolution as ArchitectureResolution)
      : {
          source: "BASELINE_FALLBACK",
          attemptMs: 0,
          designSpec: generated.designSpec,
          summary: generated.summary,
          assumptions: generated.assumptions,
        };
  const prototypeGenerationMs =
    "prototypeMs" in generated && typeof generated.prototypeMs === "number"
      ? generated.prototypeMs
      : 0;
  let reviewed = generated;
  const validation = validatePrototypeFiles(reviewed.files, reviewed.screenMap);
  if (!validation.accepted)
    throw new DesignGenerationError(
      "prototype_validation",
      new Error(validation.reasons.join(" ")),
    );
  let quality = validatePrototypeQuality(
    reviewed.files,
    reviewed.screenMap,
    reviewed.designSpec,
  );
  let designStatus: "IN_REVIEW" | "NEEDS_REVIEW" = "IN_REVIEW";
  let qualityReview: {
    verdict: "PASS" | "REPAIR";
    score?: number;
    summary?: string;
    blockingProblems?: string[];
  } | null = null;
  let repairAttempted = false;
  let qualityReviewMs = 0;
  let repairMs = 0;
  if (settings.mode === "openai-compatible") {
    const gateway = deps.gateway || getAiGateway();
    const files = Object.fromEntries(
      reviewed.files.map((file) => [file.path, file.content]),
    );
    let review;
    const qualityStarted = Date.now();
    try {
      await deps.onStage?.("QUALITY_REVIEW");
      review = await gateway.runDesignQualityReview({
        productSummary: JSON.stringify({
          name: product.name,
          productType: product.productType,
          targetUsers: product.targetUsers,
          roles: product.roles,
          entities: product.entities,
          workflows: product.workflows,
          features: product.features,
          decisions: product.decisions,
          designInputSnapshot: product.designInputSnapshot,
        }),
        screenMap: reviewed.screenMap,
        designSpec: reviewed.designSpec,
        prototype: {
          html: files["index.html"] || "",
          css: files["styles.css"] || "",
          js: files["app.js"] || "",
        },
        quality,
      });
    } catch (error) {
      throw new DesignGenerationError("quality_review", error);
    } finally {
      qualityReviewMs = Date.now() - qualityStarted;
    }
    qualityReview = {
      verdict: review.verdict,
      score: review.score,
      summary: review.improvements[0] || review.assessments[0]?.assessment,
      blockingProblems: review.blockingProblems,
    };
    if (review.verdict === "REPAIR") {
      repairAttempted = true;
      const repairStarted = Date.now();
      try {
        await deps.onStage?.("PROTOTYPE_REPAIR");
        const repaired = await gateway.runPrototypeRepair({
          product,
          screenMap: reviewed.screenMap,
          designSpec: reviewed.designSpec,
          existingFiles: reviewed.files,
          blockingProblems: review.blockingProblems,
        });
        reviewed = DesignGenerationResultSchema.parse({
          ...reviewed,
          files: repaired.prototype.files,
        });
        const repairedSafety = validatePrototypeFiles(
          reviewed.files,
          reviewed.screenMap,
        );
        quality = validatePrototypeQuality(
          reviewed.files,
          reviewed.screenMap,
          reviewed.designSpec,
        );
        qualityReview = {
          ...qualityReview!,
          summary: quality.accepted
            ? "Repaired prototype passed deterministic safety and quality checks."
            : quality.reasons.join(" "),
          blockingProblems: quality.reasons,
        };
        if (!repairedSafety.accepted || !quality.accepted)
          designStatus = "NEEDS_REVIEW";
      } catch {
        designStatus = "NEEDS_REVIEW";
      } finally {
        repairMs = Date.now() - repairStarted;
      }
    }
  } else if (!quality.accepted) {
    throw new DesignGenerationError(
      "prototype_validation",
      new Error(quality.reasons.join(" ")),
    );
  }
  const next = applyGeneratedDesign(state, reviewed, {
    summary: reviewed.summary,
    source: "SYSTEM",
    status: designStatus,
    request,
  });
  let saved = await (deps.save || saveProjectState)(projectId, next, version);
  await (deps.persist || persistDesignArtifacts)(
    projectId,
    saved.state.studio.currentVersion,
    reviewed,
    saved.state.studio.status,
    version,
  );
  saved = await (deps.save || saveProjectState)(
    projectId,
    {
      ...saved.state,
      generationMetadata: {
        ...saved.state.generationMetadata,
        designArchitecture: {
          source: architectureResolution.source,
          ...(architectureResolution.failure
            ? { failureCategory: architectureResolution.failure.category }
            : {}),
        },
      },
    },
    saved.version,
  );
  if (qualityReview || repairAttempted) {
    saved = await (deps.save || saveProjectState)(
      projectId,
      {
        ...saved.state,
        generationMetadata: {
          ...saved.state.generationMetadata,
          designQualityReview: qualityReview,
          repairAttempted,
          finalDesignStatus: designStatus,
        },
      },
      saved.version,
    );
  }
  return {
    ...saved,
    generated: reviewed,
    validation,
    architectureResolution,
    timings: {
      designArchitectureAiMs: architectureResolution.attemptMs,
      prototypeMs: prototypeGenerationMs,
      qualityReviewMs,
      repairMs,
      totalMs: Date.now() - totalStarted,
    },
  };
}

export function reviseMockDesign(
  state: ProjectState,
  current: DesignGenerationResult,
  request: string,
  persistedScreenMap: DesignScreen[] = [],
) {
  const screenMap = persistedScreenMap.length
    ? persistedScreenMap
    : current.screenMap.length
      ? current.screenMap
      : state.studio.screenMap.length
        ? state.studio.screenMap
        : deriveScreenMap(state);
  if (/compact/i.test(request)) return applyVisualRevision(current, request);
  return generateMockPrototype(state, { request, screenMap });
}
export async function reviseProjectDesign(
  projectId: string,
  state: ProjectState,
  version: number,
  text: string,
) {
  const impact = classifyDesignRevision(text);
  if (impact === "POTENTIAL_PRODUCT_DECISION") {
    return {
      impact,
      state,
      version,
      message:
        "This changes the product model, not only the interface. Confirm it as a product decision before design can change.",
    };
  }
  const pack = state.generationMetadata.designPackage as
    | {
        spec?: DesignGenerationResult["designSpec"];
        files?: DesignGenerationResult["files"];
        summary?: string;
      }
    | undefined;
  if (!pack?.files) throw new Error("NO_DESIGN");
  const persistedDraft = await latestDraftArtifacts(projectId, version);
  const persistedScreenMap = persistedDraft
    ? parsePersistedScreenMap(
        persistedDraft.artifacts.find(
          (artifact) => artifact.type === "SCREEN_MAP",
        )?.content || "",
      )
    : [];
  const current: DesignGenerationResult = {
    designSpec:
      pack.spec ||
      generateMockPrototype(state, { screenMap: persistedScreenMap })
        .designSpec,
    screenMap: persistedScreenMap.length
      ? persistedScreenMap
      : state.studio.screenMap.length
        ? state.studio.screenMap
        : deriveScreenMap(state),
    files: pack.files,
    summary: pack.summary || "",
    assumptions: state.studio.assumptions,
  };
  const settings = resolveProviderSettings();
  const generated =
    settings.mode === "openai-compatible"
      ? await generateWithRealProvider(
          state,
          { request: text, existing: current },
          undefined,
          undefined,
          undefined,
          current.screenMap,
        )
      : reviseMockDesign(state, current, text, current.screenMap);
  const validation = validatePrototypeFiles(
    generated.files,
    generated.screenMap,
  );
  const quality = validatePrototypeQuality(
    generated.files,
    generated.screenMap,
    generated.designSpec,
  );
  if (!validation.accepted || !quality.accepted)
    throw new DesignGenerationError(
      "prototype_validation",
      new Error([...validation.reasons, ...quality.reasons].join(" ")),
    );
  const next = applyGeneratedDesign(state, generated, {
    summary: text,
    source: "USER",
    request: text,
  });
  const saved = await saveProjectState(projectId, next, version);
  await persistDesignArtifacts(
    projectId,
    saved.state.studio.currentVersion,
    generated,
    saved.state.studio.status,
    version,
  );
  return { impact, ...saved, generated };
}

export async function approveProjectDesign(
  projectId: string,
  state: ProjectState,
  version: number,
) {
  const saved = await saveProjectState(
    projectId,
    approveDesign(state),
    version,
  );
  return saved;
}

export async function markStaleAfterProductChange(
  projectId: string,
  state: ProjectState,
  version: number,
  screenIds: string[],
) {
  return saveProjectState(
    projectId,
    markDesignStale(state, screenIds),
    version,
  );
}

export async function researchDesignReferences(
  projectId: string,
  state: ProjectState,
  query: string,
) {
  const tools = createServerToolRegistry();
  const settings = resolveProviderSettings();
  const runner = new AgentRunner(
    {
      nextAction({ iteration }) {
        if (iteration === 1)
          return {
            id: "design-search",
            type: "CALL_TOOL",
            toolName: "web_search",
            input: { query, maxResults: 5 },
          };
        return {
          id: "wait",
          type: "WAIT_FOR_USER",
          reason: "Design references collected as untrusted evidence.",
        };
      },
    },
    tools,
  );
  const result = await runner.run({
    project: state,
    latestUserMessage: query,
    onToolStart: async (action) => {
      if (action.type !== "CALL_TOOL") return;
      await prisma.toolRun.create({
        data: {
          projectId,
          toolName: action.toolName,
          status: "RUNNING",
          inputSummary: query,
          startedAt: new Date(),
        },
      });
    },
    onToolRun: async (activity) => {
      await prisma.toolRun.updateMany({
        where: { projectId, toolName: "web_search", status: "RUNNING" },
        data: {
          status: "COMPLETED",
          outputSummary: activity.observation?.summary || "Search completed.",
          completedAt: new Date(),
        },
      });
    },
  });
  return { providerMode: settings.mode, result };
}
