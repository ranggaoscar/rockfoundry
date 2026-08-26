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
  type ProjectState,
} from "@rockfoundry/core";
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

export async function composeDraftArtifacts(
  projectId: string,
  canonicalVersion: number,
  state: ProjectState,
) {
  const { getAiGateway } = await import("./ai-provider");
  const { input, previous } = await composerInput(projectId, state);
  const gateway = getAiGateway();
  let normalized = normalizeArtifactComposerOutput(
    await gateway.runArtifactComposer(input),
    input,
  );
  let quality = assessArtifactComposerQuality(normalized);

  // Preserve the substantive first pass and spend one bounded repair only on bad documents.
  if (quality.repairable) {
    const repairInput = {
      ...input,
      requestedDocumentTypes: quality.malformedTypes,
      previousDraft: {
        ...input.previousDraft,
        artifacts: DRAFT_ARTIFACT_TYPES.map((type) => ({
          type,
          version: input.previousDraft.version || 0,
          content: formatComposedDocument(normalized[type]),
        })),
      },
    };
    const repaired = normalizeArtifactComposerOutput(
      await gateway.runArtifactComposer(repairInput),
      repairInput,
    );
    normalized = Object.fromEntries(
      DRAFT_ARTIFACT_TYPES.map((type) => [
        type,
        quality.malformedTypes.includes(type)
          ? repaired[type]
          : normalized[type],
      ]),
    ) as typeof normalized;
    quality = assessArtifactComposerQuality(normalized);
  }

  if (!quality.meaningful) {
    await prisma.$transaction(async (transaction) => {
      const latest = await transaction.draftGeneration.findFirst({
        where: { projectId },
        orderBy: { generationNumber: "desc" },
        select: { generationNumber: true },
      });
      await transaction.draftGeneration.create({
        data: {
          projectId,
          canonicalVersion,
          generationNumber: (latest?.generationNumber || 0) + 1,
          status: "FAILED",
          sourceGenerationId: previous?.id || null,
          composerInput: JSON.stringify(input),
          composerMetadata: JSON.stringify({
            source: "AI_ARTIFACT_COMPOSER",
            malformedTypes: quality.malformedTypes,
          }),
          errorSummary:
            "Artifact quality gate rejected incomplete Product Draft documents.",
          completedAt: new Date(),
        },
      });
    });
    throw new Error(
      "Artifact quality gate rejected incomplete Product Draft documents.",
    );
  }

  const documents = formatComposedDocuments(normalized);
  const consistency = validateConsistency(state);

  const generation = await prisma.$transaction(async (transaction) => {
    const latest = await transaction.draftGeneration.findFirst({
      where: { projectId },
      orderBy: { generationNumber: "desc" },
      select: { generationNumber: true },
    });
    const generationNumber = (latest?.generationNumber || 0) + 1;
    const latestArtifact = await transaction.artifact.findFirst({
      where: { projectId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const artifactVersion = (latestArtifact?.version || 0) + 1;
    const created = await transaction.draftGeneration.create({
      data: {
        projectId,
        canonicalVersion,
        generationNumber,
        status: "COMPLETE",
        sourceGenerationId: previous?.id || null,
        composerInput: JSON.stringify(input),
        composerMetadata: JSON.stringify({ source: "AI_ARTIFACT_COMPOSER" }),
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

  return { ...generation, documents, consistency, input };
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
