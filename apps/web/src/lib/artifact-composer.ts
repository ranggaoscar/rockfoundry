import {
  selectCoherentDraftArtifacts,
  DRAFT_BRIDGE_TYPES,
} from "./design-draft-bridge";
import {
  assessArtifactComposerQuality,
  buildArtifactComposerInput,
  normalizeArtifactComposerOutput,
  validateConsistency,
  type ArtifactComposerDocument,
  type ArtifactComposerInput,
  type ArtifactComposerItem,
  type ArtifactComposerOutput,
  type ProjectState,
} from "@rockfoundry/core";
import { getAiGateway } from "./ai-provider";
import { prisma } from "@rockfoundry/db";
import {
  classifyDesignFailure,
  formatDesignFailureDiagnostics,
} from "@rockfoundry/ai";

export const ARTIFACT_COMPOSER_ERROR_MESSAGE =
  "RockFoundry couldn't generate the Product Draft.";

export function artifactComposerErrorPayload(error: unknown) {
  const diagnostics = logArtifactComposerFailure(error);
  return {
    error: ARTIFACT_COMPOSER_ERROR_MESSAGE,
    code: "DRAFT_GENERATION_FAILED",
    retryable: diagnostics.category !== "SCHEMA_VALIDATION",
  } as const;
}

export function logArtifactComposerFailure(error: unknown) {
  const diagnostics = classifyDesignFailure(error, {
    task: "artifact_composer",
  });
  console.error(
    `[artifact-composer] ${formatDesignFailureDiagnostics(diagnostics)}`,
  );
  return diagnostics;
}

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

type DraftArtifactRow = {
  id: string;
  type: string;
  status: string;
  content: string;
  version: number;
  canonicalVersion: number | null;
  generatedAt: Date;
  draftGenerationId?: string | null;
};

function usefulMessage(message: { role: string; content: string }) {
  return (
    ["user", "assistant", "tool", "system"].includes(message.role) &&
    message.content.trim().length > 0
  );
}

function formatItem(item: ArtifactComposerItem) {
  const evidence = item.evidenceIds.length
    ? ` (evidence: ${item.evidenceIds.join(", ")})`
    : "";
  const rationale = item.rationale ? ` — ${item.rationale}` : "";
  return `- **${item.label}** ${item.text}${evidence}${rationale}`;
}

function formatLedger(document: ArtifactComposerDocument) {
  const items = document.sections.flatMap((section) => section.items);
  const matching = (label: ArtifactComposerItem["label"]) =>
    items.filter((item) => item.label === label);
  const lines = (label: ArtifactComposerItem["label"]) => {
    const values = matching(label);
    return values.length
      ? values.map(formatItem).join("\n")
      : "- None recorded.";
  };
  return [
    `## CONFIRMED\n\n${lines("CONFIRMED")}`,
    `## ASSUMPTIONS / PROPOSALS\n\n### ASSUMPTION\n\n${lines("ASSUMPTION")}\n\n### PROPOSAL\n\n${lines("PROPOSAL")}`,
    `## OPEN QUESTIONS\n\n${lines("OPEN_QUESTION")}`,
  ].join("\n\n");
}

export function formatComposedDocument(document: ArtifactComposerDocument) {
  const sections = document.sections
    .map((section) => {
      const paragraphs = section.paragraphs.join("\n\n");
      const items = section.items.map(formatItem).join("\n");
      return `## ${section.title}\n\n${[paragraphs, items].filter(Boolean).join("\n\n") || "- No detail recorded."}`;
    })
    .join("\n\n");
  return `# ${document.title}\n\n${document.summary}\n\n## TRUTH LEDGER\n\n${formatLedger(document)}\n\n${sections}\n`;
}

export function formatComposedDocuments(
  output: Record<DraftArtifactType, ArtifactComposerDocument>,
) {
  return Object.fromEntries(
    DRAFT_ARTIFACT_TYPES.map((type) => [
      type,
      formatComposedDocument(output[type]),
    ]),
  ) as Record<DraftArtifactType, string>;
}

async function loadPreviousGeneration(projectId: string) {
  const generations = await prisma.draftGeneration.findMany({
    where: { projectId, status: "COMPLETE" },
    orderBy: { generationNumber: "desc" },
    include: { artifacts: true },
    take: 8,
  });
  return (
    generations.find((generation) =>
      DRAFT_ARTIFACT_TYPES.every((type) =>
        generation.artifacts.some((artifact) => artifact.type === type),
      ),
    ) || null
  );
}

async function composerInput(
  projectId: string,
  state: ProjectState,
): Promise<{
  input: ArtifactComposerInput;
  previous: Awaited<ReturnType<typeof loadPreviousGeneration>>;
}> {
  const [messages, previous] = await Promise.all([
    prisma.conversationMessage.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 48,
      select: { id: true, role: true, content: true },
    }),
    loadPreviousGeneration(projectId),
  ]);
  const useful = messages.filter(usefulMessage).reverse();
  const recent = useful.slice(-12).map((message) => ({
    id: message.id,
    role: message.role as "user" | "assistant" | "tool" | "system",
    text: message.content,
  }));
  const fullUseful = useful.map((message) => ({
    id: message.id,
    role: message.role as "user" | "assistant" | "tool" | "system",
    text: message.content,
  }));
  const artifacts = previous
    ? DRAFT_ARTIFACT_TYPES.flatMap((type) => {
        const artifact = previous.artifacts.find((item) => item.type === type);
        return artifact
          ? [{ type, version: artifact.version, content: artifact.content }]
          : [];
      })
    : [];
  return {
    input: buildArtifactComposerInput(
      state,
      { recent, fullUseful },
      { version: previous?.generationNumber ?? null, artifacts },
    ),
    previous,
  };
}

export const DRAFT_GENERATION_BATCHES = [
  {
    id: "BRD_PRD",
    label: "Menyusun BRD & PRD",
    documentTypes: ["BRD", "PRD"],
  },
  {
    id: "ERD_USER_FLOWS",
    label: "Menyusun ERD & User Flows",
    documentTypes: ["ERD", "USER_FLOWS"],
  },
  {
    id: "SCREEN_MAP_DESIGN_BRIEF",
    label: "Menyusun Screen Map & Design Brief",
    documentTypes: ["SCREEN_MAP", "DESIGN_BRIEF"],
  },
] as const;

type DraftBatch = (typeof DRAFT_GENERATION_BATCHES)[number];
type DraftBatchStatus = "PENDING" | "RUNNING" | "COMPLETE" | "FAILED";
type DraftBatchState = {
  id: DraftBatch["id"];
  label: DraftBatch["label"];
  documentTypes: readonly DraftArtifactType[];
  status: DraftBatchStatus;
};

function initialBatchStates(status: DraftBatchStatus = "PENDING") {
  return DRAFT_GENERATION_BATCHES.map(
    (batch): DraftBatchState => ({
      id: batch.id,
      label: batch.label,
      documentTypes: batch.documentTypes,
      status,
    }),
  );
}

function metadataWithBatches(
  batches: DraftBatchState[],
  extra: Record<string, unknown> = {},
) {
  return JSON.stringify({
    source: "AI_ARTIFACT_COMPOSER",
    ...extra,
    batches,
  });
}

async function updateBatchState(
  generationId: string,
  batchId: DraftBatch["id"],
  status: DraftBatchStatus,
  extra: Record<string, unknown> = {},
) {
  await prisma.$transaction(async (transaction) => {
    const current = await transaction.draftGeneration.findUnique({
      where: { id: generationId },
      select: { composerMetadata: true },
    });
    const metadata = current?.composerMetadata
      ? JSON.parse(current.composerMetadata)
      : {};
    const batches = initialBatchStates("PENDING").map((batch) => {
      const existing = Array.isArray(metadata.batches)
        ? metadata.batches.find(
            (candidate: { id?: string }) => candidate.id === batch.id,
          )
        : undefined;
      return {
        ...batch,
        ...(existing || {}),
        ...(batch.id === batchId ? { status } : {}),
      };
    });
    await transaction.draftGeneration.update({
      where: { id: generationId },
      data: {
        composerMetadata: metadataWithBatches(batches, { ...metadata, ...extra }),
      },
    });
  });
}

export async function composeDraftArtifacts(
  projectId: string,
  canonicalVersion: number,
  state: ProjectState,
) {
  // Build the expensive, grounded context exactly once and share it with every batch.
  const { input, previous } = await composerInput(projectId, state);
  const generation = await prisma.$transaction(async (transaction) => {
    const latest = await transaction.draftGeneration.findFirst({
      where: { projectId },
      orderBy: { generationNumber: "desc" },
      select: { generationNumber: true },
    });
    return transaction.draftGeneration.create({
      data: {
        projectId,
        canonicalVersion,
        generationNumber: (latest?.generationNumber || 0) + 1,
        status: "RUNNING",
        sourceGenerationId: previous?.id || null,
        composerInput: JSON.stringify(input),
        composerMetadata: metadataWithBatches(initialBatchStates()),
      },
    });
  });
  const gateway = getAiGateway();

  const outcomes = await Promise.all(
    DRAFT_GENERATION_BATCHES.map(async (batch) => {
      await updateBatchState(generation.id, batch.id, "RUNNING");
      const batchInput = {
        ...input,
        requestedDocumentTypes: [...batch.documentTypes],
      } satisfies ArtifactComposerInput;
      let lastError: unknown;
      let malformedTypes: DraftArtifactType[] = [];
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const raw = await gateway.runArtifactComposer(batchInput);
          const normalized = normalizeArtifactComposerOutput(raw, batchInput);
          const quality = assessArtifactComposerQuality(normalized);
          malformedTypes = batch.documentTypes.filter((type) =>
            quality.malformedTypes.includes(type),
          );
          if (malformedTypes.length === 0) {
            await updateBatchState(generation.id, batch.id, "COMPLETE");
            return { batch, output: normalized } as const;
          }
          lastError = new Error(
            `Artifact quality gate rejected ${malformedTypes.join(", ")}.`,
          );
        } catch (error) {
          lastError = error;
          malformedTypes = [];
        }
      }
      const failedTypes = malformedTypes.length
        ? malformedTypes
        : [...batch.documentTypes];
      await updateBatchState(generation.id, batch.id, "FAILED", {
        failedDocumentTypes: failedTypes,
      });
      return { batch, error: lastError, failedTypes } as const;
    }),
  );

  const finalBatches = initialBatchStates("PENDING").map((batch) => {
    const outcome = outcomes.find((candidate) => candidate.batch.id === batch.id);
    return {
      ...batch,
      status: outcome && "output" in outcome ? "COMPLETE" : "FAILED",
    } as DraftBatchState;
  });
  const failed = outcomes.filter((outcome) => "error" in outcome);
  if (failed.length) {
    const failedTypes = failed.flatMap((outcome) => outcome.failedTypes);
    const error = new Error(
      `Artifact quality gate rejected incomplete Product Draft documents (${failedTypes.join(", ") || "provider failure"}).`,
    );
    await prisma.$transaction(async (transaction) => {
      await transaction.draftGeneration.update({
        where: { id: generation.id },
        data: {
          status: "FAILED",
          errorSummary: error.message,
          composerMetadata: metadataWithBatches(finalBatches, {
            failedDocumentTypes: failedTypes,
          }),
          completedAt: new Date(),
        },
      });
    });
    throw error;
  }
  const normalized = Object.fromEntries(
    outcomes.flatMap((outcome) =>
      "output" in outcome && outcome.output
        ? outcome.batch.documentTypes.map((type) => [type, outcome.output[type]])
        : [],
    ),
  ) as ArtifactComposerOutput;
  const finalQuality = assessArtifactComposerQuality(normalized);
  if (!finalQuality.meaningful) {
    const error = new Error(
      `Artifact quality gate rejected incomplete Product Draft documents (${finalQuality.malformedTypes.join(", ")}).`,
    );
    await prisma.$transaction(async (transaction) => {
      const current = await transaction.draftGeneration.findUnique({
        where: { id: generation.id },
        select: { composerMetadata: true },
      });
      const metadata = current?.composerMetadata
        ? JSON.parse(current.composerMetadata)
        : {};
      await transaction.draftGeneration.update({
        where: { id: generation.id },
        data: {
          status: "FAILED",
          errorSummary: error.message,
          composerMetadata: metadataWithBatches(
            Array.isArray(metadata.batches)
              ? metadata.batches
              : initialBatchStates("FAILED"),
            { ...metadata, malformedTypes: finalQuality.malformedTypes },
          ),
          completedAt: new Date(),
        },
      });
    });
    throw error;
  }
  const documents = formatComposedDocuments(normalized);
  const consistency = validateConsistency(state);
  const completed = await prisma.$transaction(async (transaction) => {
    const latestArtifact = await transaction.artifact.findFirst({
      where: { projectId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const artifactVersion = (latestArtifact?.version || 0) + 1;
    const created = await transaction.draftGeneration.update({
      where: { id: generation.id },
      data: {
        status: "COMPLETE",
        composerMetadata: metadataWithBatches(finalBatches),
        completedAt: new Date(),
      },
    });
    const artifacts = await Promise.all(
      DRAFT_ARTIFACT_TYPES.map((type) =>
        transaction.artifact.create({
          data: {
            projectId,
            draftGenerationId: created.id,
            canonicalVersion,
            type,
            status: "READY",
            content: documents[type],
            version: artifactVersion,
          },
        }),
      ),
    );
    return { generation: created, artifacts };
  });
  return { ...completed, documents, consistency, input };
}

export type DraftGenerationBatch = DraftBatchState;

export function parseDraftGenerationBatches(
  composerMetadata: string | null | undefined,
) {
  if (!composerMetadata) return [] as DraftGenerationBatch[];
  try {
    const parsed = JSON.parse(composerMetadata) as { batches?: unknown };
    if (!Array.isArray(parsed.batches)) return [] as DraftGenerationBatch[];
    return parsed.batches.filter(
      (batch): batch is DraftGenerationBatch =>
        batch !== null &&
        typeof batch === "object" &&
        typeof (batch as DraftGenerationBatch).id === "string" &&
        typeof (batch as DraftGenerationBatch).label === "string" &&
        Array.isArray((batch as DraftGenerationBatch).documentTypes) &&
        ["PENDING", "RUNNING", "COMPLETE", "FAILED"].includes(
          (batch as DraftGenerationBatch).status,
        ),
    );
  } catch {
    return [] as DraftGenerationBatch[];
  }
}

export async function currentDraftGeneration(projectId: string) {
  return prisma.draftGeneration.findFirst({
    where: { projectId, status: { in: ["RUNNING", "FAILED"] } },
    orderBy: { generationNumber: "desc" },
    select: {
      id: true,
      generationNumber: true,
      canonicalVersion: true,
      status: true,
      composerMetadata: true,
    },
  });
}
type DraftGenerationWithArtifacts = {
  id: string;
  canonicalVersion: number;
  generationNumber: number;
  status: string;
  artifacts: DraftArtifactRow[];
};

export function selectLatestCompleteDraftGeneration<
  T extends DraftGenerationWithArtifacts,
>(generations: T[], currentCanonicalVersion: number): T | null {
  const complete = generations.filter(
    (generation) =>
      generation.status === "COMPLETE" &&
      generation.canonicalVersion <= currentCanonicalVersion &&
      DRAFT_ARTIFACT_TYPES.every((type) =>
        generation.artifacts.some((artifact) => artifact.type === type),
      ),
  );
  complete.sort((left, right) => {
    const leftCurrent =
      left.canonicalVersion === currentCanonicalVersion ? 1 : 0;
    const rightCurrent =
      right.canonicalVersion === currentCanonicalVersion ? 1 : 0;
    return (
      rightCurrent - leftCurrent ||
      right.generationNumber - left.generationNumber
    );
  });
  return complete[0] || null;
}

export function selectLatestLegacyDraftArtifacts(
  artifacts: DraftArtifactRow[],
): DraftArtifactRow[] | null {
  const selected = selectCoherentDraftArtifacts(artifacts);
  if (!selected) return null;
  return DRAFT_BRIDGE_TYPES.map((type) => selected[type] as DraftArtifactRow);
}

export async function latestDraftArtifacts(
  projectId: string,
  canonicalVersion: number,
) {
  const generations = await prisma.draftGeneration.findMany({
    where: {
      projectId,
      status: "COMPLETE",
      canonicalVersion: { lte: canonicalVersion },
    },
    orderBy: { generationNumber: "desc" },
    include: { artifacts: true },
  });
  const generation = selectLatestCompleteDraftGeneration(
    generations,
    canonicalVersion,
  );
  if (generation) return { generation, artifacts: generation.artifacts };
  const legacy = await prisma.artifact.findMany({
    where: {
      projectId,
      type: { in: [...DRAFT_ARTIFACT_TYPES] },
      OR: [
        { canonicalVersion },
        { canonicalVersion: null, version: canonicalVersion },
      ],
    },
    orderBy: [{ version: "desc" }, { generatedAt: "desc" }],
  });
  const latest = selectLatestLegacyDraftArtifacts(legacy);
  return latest ? { generation: null, artifacts: latest } : null;
}

export function publicDraftArtifact(
  artifact: DraftArtifactRow,
  currentCanonicalVersion?: number,
) {
  const type = artifact.type as DraftArtifactType;
  return {
    id: artifact.id,
    type,
    fileName: DRAFT_ARTIFACT_FILES[type] || `${artifact.type}.md`,
    status: artifact.status,
    content: artifact.content,
    version: artifact.version,
    canonicalVersion: artifact.canonicalVersion,
    current:
      currentCanonicalVersion === undefined
        ? artifact.canonicalVersion === null
        : artifact.canonicalVersion === currentCanonicalVersion,
    generatedAt: artifact.generatedAt,
  };
}
