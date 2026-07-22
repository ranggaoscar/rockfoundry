export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";
import { requireAuth, AuthError, jsonError } from "@/lib/auth-helpers";
import { mergeExtraction, ProjectStateSchema, detectContradictions, evaluateReadinessDirectly } from "@rockfoundry/core";
import { z } from "zod";

// POST /api/projects/[id]/extract — run initial idea extraction
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    const { id } = await params;

    // Verify ownership
    const member = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: session.user.id, projectId: id } },
    });
    if (!member) return jsonError("Project not found", 404);

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.deletedAt) return jsonError("Project not found", 404);

    const body = await req.json();
    const rawIdea = body.rawIdea || project.description || "";
    if (!rawIdea.trim()) return jsonError("No raw idea provided", 400);

    // Create AI run record
    const run = await prisma.aiRun.create({
      data: {
        projectId: id,
        taskType: "initial_idea_extraction",
        provider: process.env.NINE_ROUTER_PROVIDER || "openai",
        model: process.env.NINE_ROUTER_DEFAULT_MODEL || "gpt-4o-mini",
        promptVersion: "v1.0.0",
        status: "running",
        startedAt: new Date(),
      },
    });

    // Call AI gateway
    const aiResult = await callAiExtraction(rawIdea, run.id);

    // Update run status
    await prisma.aiRun.update({
      where: { id: run.id },
      data: {
        status: aiResult.success ? "completed" : "failed",
        completedAt: new Date(),
        tokenUsage: aiResult.usage || 0,
        latencyMs: aiResult.latency || 0,
        failureReason: aiResult.error || null,
      },
    });

    if (!aiResult.success) {
      return jsonError(`AI extraction failed: ${aiResult.error}`, 500);
    }

    // Merge extraction into canonical state
    const currentState = project.canonicalState as any;
    const merged = mergeExtraction(currentState, aiResult.draft!);

    // Recalculate readiness
    const readinessResult = evaluateReadinessDirectly(merged.state);
    merged.state.readiness = readinessResult.level as any;

    merged.state.generationMetadata = {
      ...merged.state.generationMetadata,
      lastExtractionAt: new Date().toISOString(),
      lastExtractionRunId: run.id,
      lastReadinessScore: readinessResult.score,
    };

    // Save updated state
    const newVersion = project.version + 1;
    await prisma.project.update({
      where: { id },
      data: {
        canonicalState: merged.state as any,
        version: newVersion,
        description: rawIdea,
      },
    });

    // Create revision
    await prisma.projectStateRevision.create({
      data: {
        projectId: id,
        version: newVersion,
        state: merged.state as any,
      },
    });

    return Response.json({
      extraction: aiResult.draft,
      merge: {
        appliedChanges: merged.appliedChanges,
        skippedChanges: merged.skippedChanges,
        assumptionsCreated: merged.assumptionsCreated,
        questionsCreated: merged.questionsCreated,
        conflictsDetected: merged.conflictsDetected,
      },
      state: merged.state,
      runId: run.id,
      version: newVersion,
    });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    console.error("Extraction error:", e);
    return jsonError("Internal error", 500);
  }
}

// Call AI extraction through the gateway
async function callAiExtraction(rawIdea: string, runId: string) {
  const startTime = Date.now();

  try {
    const { aiGateway } = await import("@/lib/ai-provider");
    const result = await aiGateway.runInitialExtraction(rawIdea);
    return {
      success: true,
      draft: result,
      usage: 0,
      latency: Date.now() - startTime,
    };
  } catch (e: any) {
    return {
      success: false,
      draft: null,
      usage: 0,
      latency: Date.now() - startTime,
      error: e.message || "Unknown AI error",
    };
  }
}
