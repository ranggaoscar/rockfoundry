export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";
import { requireAuth, AuthError, jsonError } from "@/lib/auth-helpers";
import { QuestionEngine, RequirementsEngine, evaluateReadinessDirectly, detectContradictions } from "@rockfoundry/core";

// GET /api/projects/[id]/questions — get next question round
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    const { id } = await params;

    const member = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: session.user.id, projectId: id } },
    });
    if (!member) return jsonError("Project not found", 404);

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.deletedAt) return jsonError("Project not found", 404);

    const state = project.canonicalState as any;
    // Use a minimal set of requirement nodes for question generation
    const nodes = [
      { id: "req-auth-type", category: "USERS" as const, title: "Authentication", description: "How users identify themselves", appliesWhen: (s: any) => s.targetUsers?.length > 0, priority: 10, riskWeight: 8, status: "UNRESOLVED" as const, source: "SYSTEM" as const, dependencies: [], confidence: 0 },
      { id: "req-db-type", category: "DATA" as const, title: "Data relationships", description: "How data is connected", appliesWhen: (s: any) => s.entities?.length > 0, priority: 9, riskWeight: 9, status: "UNRESOLVED" as const, source: "SYSTEM" as const, dependencies: [], confidence: 0 },
    ];

    const engine = new RequirementsEngine(nodes);
    const graph = engine.evaluate(state);
    const qEngine = new QuestionEngine();
    const questions = qEngine.generateQuestions(state, graph.applicableNodes, 5);

    return Response.json({ questions, readiness: state.readiness });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    return jsonError("Internal error", 500);
  }
}

const AnswerSchema = {
  validate(body: any) {
    if (!body || !body.questionId) return { ok: false, error: "questionId required" };
    if (body.answer === undefined && body.value === undefined) return { ok: false, error: "answer or value required" };
    return { ok: true };
  },
};

// POST /api/projects/[id]/questions — submit an answer
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    const { id } = await params;

    const member = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: session.user.id, projectId: id } },
    });
    if (!member) return jsonError("Project not found", 404);

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.deletedAt) return jsonError("Project not found", 404);

    const body = await req.json();
    const validation = AnswerSchema.validate(body);
    if (!validation.ok) return jsonError(validation.error!, 400);

    const state = { ...(project.canonicalState as any) };
    const answer = body.answer || body.value;
    const questionId = body.questionId;

    // Apply answer to state based on question pattern
    if (questionId.startsWith("q-req-")) {
      // Requirement node answer — store as decision
      const decisionId = `dec-${questionId}-${Date.now()}`;
      state.decisions = [
        ...(state.decisions || []),
        {
          id: decisionId,
          title: questionId.replace("q-req-", "").replace(/-/g, " "),
          description: `Answer to contextual question: ${questionId}`,
          rationale: typeof answer === "string" ? answer : JSON.stringify(answer),
          status: "ACCEPTED" as const,
        },
      ];
    } else if (body.category === "targetUsers") {
      if (!state.targetUsers.includes(answer)) {
        state.targetUsers = [...(state.targetUsers || []), answer];
      }
    } else if (body.category === "entities") {
      if (!state.entities.includes(answer)) {
        state.entities = [...(state.entities || []), answer];
      }
    } else if (body.category === "features") {
      if (!state.features.includes(answer)) {
        state.features = [...(state.features || []), answer];
      }
    }

    // Remove the answered question from open questions
    state.openQuestions = (state.openQuestions || []).filter(
      (q: string) => !q.includes(questionId)
    );

    // Recalculate contradictions and readiness
    state.contradictions = detectContradictions(state);
    const readinessResult = evaluateReadinessDirectly(state);
    state.readiness = readinessResult.level as any;

    // Save
    const newVersion = project.version + 1;
    await prisma.project.update({
      where: { id },
      data: { canonicalState: state, version: newVersion },
    });

    await prisma.projectStateRevision.create({
      data: { projectId: id, version: newVersion, state },
    });

    return Response.json({ state, version: newVersion });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    console.error("Answer submission error:", e);
    return jsonError("Internal error", 500);
  }
}
