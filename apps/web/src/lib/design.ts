import { prisma } from "@rockfoundry/db";
import {
  applyGeneratedDesign,
  applyVisualRevision,
  approveDesign,
  classifyDesignRevision,
  evaluateDesignReadiness,
  generateMockPrototype,
  markDesignStale,
  validatePrototypeFiles,
  DesignGenerationResultSchema,
  deriveScreenMap,
  type DesignGenerationResult,
  type ProjectState,
} from "@rockfoundry/core";
import { resolveProviderSettings } from "./provider-config";
import { getAiGateway } from "./ai-provider";
import { saveProjectState } from "./local-project";
import { createServerToolRegistry } from "./server-tools";
import { AgentRunner } from "@rockfoundry/core";
import { ApiError } from "@rockfoundry/ai";
import { z } from "zod";

export class DesignGenerationError extends Error {
  constructor(
    public readonly task:
      "design_architecture" | "prototype_generation" | "prototype_validation",
    public readonly cause: unknown,
  ) {
    super(`Design generation failed during ${task}.`);
    this.name = "DesignGenerationError";
  }
}

export function logDesignGenerationFailure(error: unknown) {
  const failure =
    error instanceof DesignGenerationError
      ? error
      : new DesignGenerationError("prototype_generation", error);
  const cause = failure.cause;
  const category =
    cause instanceof ApiError
      ? "provider HTTP"
      : cause instanceof z.ZodError
        ? "Zod schema"
        : failure.task === "prototype_validation"
          ? "prototype validation"
          : cause instanceof Error && /timed out/i.test(cause.message)
            ? "timeout"
            : cause instanceof Error &&
                /parse JSON|invalid JSON/i.test(cause.message)
              ? "JSON parse"
              : "unknown";
  const detail =
    cause instanceof ApiError
      ? `HTTP ${cause.statusCode}`
      : cause instanceof Error && /timed out/i.test(cause.message)
        ? cause.message
        : undefined;
  console.error(
    `[design-generation] ${failure.task} failed: ${category}${detail ? ` (${detail})` : ""}`,
  );
  if (cause instanceof z.ZodError) {
    const safeCause = cause as z.ZodError & { topLevelKeys?: string[] };
    console.error(
      `[design-generation] issues: ${safeCause.issues
        .map((issue) => {
          const path = issue.path.join(".") || "<root>";
          const expected =
            "expected" in issue && typeof issue.expected === "string"
              ? ` (${issue.expected})`
              : "";
          return `${path}: ${issue.code}${expected}`;
        })
        .join(", ")}`,
    );
    console.error(
      `[design-generation] topLevelKeys: ${(safeCause.topLevelKeys || []).join(",")}`,
    );
  }
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
          status,
          content: payloads[type],
        },
        update: { status, content: payloads[type], generatedAt: new Date() },
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

function designProductContext(state: ProjectState) {
  return {
    name: state.name,
    summary: state.normalizedSummary || state.rawIdea,
    productType: state.productType || null,
    targetUsers: state.targetUsers,
    roles: state.roles,
    entities: state.entities,
    workflows: state.workflows,
    features: state.features,
    decisions: state.decisions
      .filter((decision) => decision.status === "ACCEPTED")
      .map(({ topic, decision, affects }) => ({ topic, decision, affects })),
    assumptions: state.assumptions
      .filter((assumption) => !assumption.resolved)
      .map((assumption) => assumption.statement),
  };
}

async function generateWithRealProvider(
  state: ProjectState,
  input: { request?: string; existing?: DesignGenerationResult } = {},
): Promise<DesignGenerationResult> {
  const gateway = getAiGateway();
  const product = designProductContext(state);
  const screenMap = state.studio.screenMap.length
    ? state.studio.screenMap
    : deriveScreenMap(state);
  let architecture;
  try {
    architecture = await gateway.runDesignArchitecture({ product, screenMap });
  } catch (error) {
    throw new DesignGenerationError("design_architecture", error);
  }
  let prototype;
  try {
    prototype = await gateway.runPrototypeGeneration({
      product,
      architecture: architecture.architecture,
      screenMap,
      revisionRequest: input.request,
      existingFiles: input.existing?.files,
    });
  } catch (error) {
    throw new DesignGenerationError("prototype_generation", error);
  }
  return DesignGenerationResultSchema.parse({
    designSpec: architecture.architecture.designSpec,
    screenMap,
    files: prototype.prototype.files,
    summary: prototype.prototype.summary || architecture.architecture.summary,
    assumptions: [
      ...architecture.architecture.assumptions,
      ...prototype.prototype.assumptions,
    ],
  });
}

export async function generateProjectDesign(
  projectId: string,
  state: ProjectState,
  version: number,
  request?: string,
) {
  const readiness = evaluateDesignReadiness(state);
  if (readiness.level === "BLOCKED") throw new Error("DESIGN_BLOCKED");
  const settings = resolveProviderSettings();
  const generated =
    settings.mode === "openai-compatible"
      ? await generateWithRealProvider(state, { request })
      : generateMockPrototype(state, { request });
  const validation = validatePrototypeFiles(
    generated.files,
    generated.screenMap,
  );
  if (!validation.accepted)
    throw new DesignGenerationError(
      "prototype_validation",
      new Error(validation.reasons.join(" ")),
    );
  const next = applyGeneratedDesign(state, generated, {
    summary: generated.summary,
    source: "SYSTEM",
    request,
  });
  const saved = await saveProjectState(projectId, next, version);
  await persistDesignArtifacts(
    projectId,
    saved.state.studio.currentVersion,
    generated,
    saved.state.studio.status,
  );
  return { ...saved, generated, validation };
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
  const current: DesignGenerationResult = {
    designSpec: pack.spec || generateMockPrototype(state).designSpec,
    screenMap: state.studio.screenMap,
    files: pack.files,
    summary: pack.summary || "",
    assumptions: state.studio.assumptions,
  };
  const settings = resolveProviderSettings();
  const generated =
    settings.mode === "openai-compatible"
      ? await generateWithRealProvider(state, {
          request: text,
          existing: current,
        })
      : impact === "VISUAL_ONLY" || /compact/i.test(text)
        ? applyVisualRevision(current, text)
        : generateMockPrototype(state, { request: text });
  const validation = validatePrototypeFiles(
    generated.files,
    generated.screenMap,
  );
  if (!validation.accepted)
    throw new DesignGenerationError(
      "prototype_validation",
      new Error(validation.reasons.join(" ")),
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
