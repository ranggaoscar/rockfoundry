export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";
import {
  detectContradictions,
  mergeExtraction,
  evaluateReadinessDirectly,
} from "@rockfoundry/core";
import {
  getLocalProject,
  jsonError,
  parseProjectState,
  saveProjectState,
} from "@/lib/local-project";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getLocalProject(id);
  if (!project) return jsonError("Project not found", 404);
  const body = await req.json().catch(() => ({}));
  const rawIdea =
    typeof body.rawIdea === "string"
      ? body.rawIdea.trim()
      : (project.description || "").trim();
  if (!rawIdea)
    return jsonError(
      "Describe the product idea before asking RockFoundry to inspect it.",
      400,
    );

  const run = await prisma.agentRun.create({
    data: {
      projectId: id,
      goal: "Understand the product idea and identify the next important decision",
      status: "RUNNING",
      actionType: "UPDATE_REQUIREMENT",
      startedAt: new Date(),
    },
  });
  try {
    const { aiGateway } = await import("@/lib/ai-provider");
    const aiResult = await aiGateway.runInitialExtraction(rawIdea);
    const current = parseProjectState(project);
    const merged = mergeExtraction(
      { ...current, rawIdea },
      aiResult.extraction,
    );
    merged.state.contradictions = detectContradictions(merged.state);
    const readiness = evaluateReadinessDirectly(merged.state);
    const saved = await saveProjectState(
      id,
      merged.state,
      project.version,
      rawIdea,
    );
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await prisma.conversationMessage.create({
      data: {
        projectId: id,
        role: "user",
        content: rawIdea,
        metadata: JSON.stringify({ source: "USER" }),
      },
    });
    await prisma.conversationMessage.create({
      data: {
        projectId: id,
        role: "assistant",
        content:
          "I updated the project understanding and checked the next unresolved decision.",
        metadata: JSON.stringify({
          source: "SYSTEM",
          readiness: readiness.level,
        }),
      },
    });
    return Response.json({
      ...saved,
      extraction: aiResult.extraction,
      merge: {
        appliedChanges: merged.appliedChanges,
        skippedChanges: merged.skippedChanges,
        assumptionsCreated: merged.assumptionsCreated,
        questionsCreated: merged.questionsCreated,
        conflictsDetected: merged.conflictsDetected,
      },
      runId: run.id,
    });
  } catch {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        failureReason:
          "The configured AI provider could not complete this discovery step.",
      },
    });
    return jsonError(
      "RockFoundry couldn't reach the configured AI provider. Retry or open Provider Settings.",
      422,
      { retryable: true },
    );
  }
}
