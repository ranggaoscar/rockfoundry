export const dynamic = "force-dynamic";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";
import { requireAuth, AuthError, jsonError } from "@/lib/auth-helpers";
import { runJob } from "@/lib/jobs";
import { mergeExtraction, evaluateReadinessDirectly } from "@rockfoundry/core";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    const { id } = await params;
    const member = await prisma.projectMember.findUnique({ where: { userId_projectId: { userId: session.user.id, projectId: id } } });
    if (!member) return jsonError("Project not found", 404);

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.deletedAt) return jsonError("Project not found", 404);

    const body = await req.json();
    const rawIdea = body.rawIdea || project.description || "";
    if (!rawIdea.trim()) return jsonError("No raw idea provided", 400);

    const key = `extract:${id}:${createHash("sha256").update(rawIdea).digest("hex")}`;
    const job = await runJob("initial_idea_extraction", key, { projectId: id }, async () => {
      const run = await prisma.aiRun.create({
        data: {
          projectId: id,
          taskType: "initial_idea_extraction",
          provider: process.env.NINE_ROUTER_PROVIDER || "mock",
          model: process.env.NINE_ROUTER_DEFAULT_MODEL || "mock",
          promptVersion: "v1.0.0",
          status: "running",
          startedAt: new Date(),
        },
      });

      const startedAt = Date.now();
      try {
        const { aiGateway } = await import("@/lib/ai-provider");
        const aiResult = await aiGateway.runInitialExtraction(rawIdea);
        const currentProject = await prisma.project.findUniqueOrThrow({ where: { id } });
        const merged = mergeExtraction(currentProject.canonicalState as any, aiResult.extraction);
        const readiness = evaluateReadinessDirectly(merged.state);
        merged.state.readiness = readiness.level as typeof merged.state.readiness;
        merged.state.generationMetadata = {
          ...merged.state.generationMetadata,
          lastExtractionAt: new Date().toISOString(),
          lastExtractionRunId: run.id,
          lastReadinessScore: readiness.score,
        };
        const version = currentProject.version + 1;

        // Canonical state changes only after extraction and schema validation succeed.
        await prisma.$transaction([
          prisma.project.update({ where: { id }, data: { canonicalState: merged.state, version, description: rawIdea } }),
          prisma.projectStateRevision.create({ data: { projectId: id, version, state: merged.state } }),
          prisma.aiRun.update({
            where: { id: run.id },
            data: { status: "completed", completedAt: new Date(), tokenUsage: aiResult.tokenUsage || 0, latencyMs: Date.now() - startedAt },
          }),
        ]);

        return {
          extraction: aiResult.extraction,
          merge: {
            appliedChanges: merged.appliedChanges,
            skippedChanges: merged.skippedChanges,
            assumptionsCreated: merged.assumptionsCreated,
            questionsCreated: merged.questionsCreated,
            conflictsDetected: merged.conflictsDetected,
          },
          state: merged.state,
          runId: run.id,
          version,
        };
      } catch (error) {
        await prisma.aiRun.update({
          where: { id: run.id },
          data: { status: "failed", completedAt: new Date(), latencyMs: Date.now() - startedAt, failureReason: error instanceof Error ? error.message : "Unknown AI error" },
        });
        throw error;
      }
    });

    return Response.json({ ...job.result, duplicate: job.duplicate });
  } catch (error) {
    if (error instanceof AuthError) return jsonError(error.message, error.status);
    return jsonError(error instanceof Error ? `AI extraction failed: ${error.message}` : "AI extraction failed", 422);
  }
}
