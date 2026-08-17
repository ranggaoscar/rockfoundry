export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import {
  QuestionEngine,
  RequirementsEngine,
  detectContradictions,
  evaluateReadinessDirectly,
  type ProjectState,
} from "@rockfoundry/core";
import {
  jsonError,
  getLocalProject,
  parseProjectState,
  saveProjectState,
} from "@/lib/local-project";
import { prisma } from "@rockfoundry/db";
import { z } from "zod";

const AnswerSchema = z
  .object({
    questionId: z.string().min(1),
    answer: z.union([z.string(), z.array(z.string())]).optional(),
    value: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .refine(
    (body) => body.answer !== undefined || body.value !== undefined,
    "answer or value is required",
  );

function nodesFor(state: ProjectState) {
  return [
    {
      id: "req-auth-type",
      category: "USERS" as const,
      title: "Access and identity",
      description: `How ${state.targetUsers.slice(0, 2).join(" and ") || "the people using this product"} should identify themselves`,
      appliesWhen: (current: ProjectState) => current.targetUsers.length > 0,
      priority: 10,
      riskWeight: 8,
      status: "UNRESOLVED" as const,
      source: "SYSTEM" as const,
      dependencies: [],
      confidence: 0,
    },
    {
      id: "req-data-relationships",
      category: "DATA" as const,
      title: "Data relationships",
      description: `How ${state.entities.slice(0, 3).join(", ") || "the records"} should stay connected`,
      appliesWhen: (current: ProjectState) => current.entities.length > 0,
      priority: 9,
      riskWeight: 9,
      status: "UNRESOLVED" as const,
      source: "SYSTEM" as const,
      dependencies: [],
      confidence: 0,
    },
    {
      id: "req-permissions",
      category: "PERMISSIONS" as const,
      title: "Role permissions",
      description: `What each role can see and change in ${state.name}`,
      appliesWhen: (current: ProjectState) =>
        current.targetUsers.length > 1 || current.roles.length > 1,
      priority: 10,
      riskWeight: 10,
      status: "UNRESOLVED" as const,
      source: "SYSTEM" as const,
      dependencies: [],
      confidence: 0,
    },
  ];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await getLocalProject(id);
    if (!project) return jsonError("Project not found", 404);
    const state = parseProjectState(project);
    const graph = new RequirementsEngine(nodesFor(state)).evaluate(state);
    const questions = new QuestionEngine().generateQuestions(
      state,
      graph.topUnresolved,
      3,
    );
    return Response.json({
      questions,
      readiness: {
        level: state.readiness,
        score: state.readinessScore,
        breakdown: state.readinessBreakdown,
      },
      blockers: evaluateReadinessDirectly(state).blocking,
    });
  } catch {
    return jsonError("RockFoundry couldn't prepare the next question.");
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await getLocalProject(id);
    if (!project) return jsonError("Project not found", 404);
    const body = AnswerSchema.parse(await req.json());
    const answer = body.answer ?? body.value!;
    const current = parseProjectState(project);
    const processed = new QuestionEngine().processAnswer(
      current,
      body.questionId,
      answer,
    );
    processed.updatedState.contradictions = detectContradictions(
      processed.updatedState,
    );
    const saved = await saveProjectState(
      id,
      processed.updatedState,
      project.version,
    );
    await prisma.conversationMessage.create({
      data: {
        projectId: id,
        role: "user",
        content: Array.isArray(answer) ? answer.join(", ") : answer,
        metadata: JSON.stringify({
          questionId: body.questionId,
          source: "USER",
        }),
      },
    });
    return Response.json({ state: saved.state, version: saved.version });
  } catch (error) {
    if (error instanceof Error && error.message === "PROJECT_VERSION_CONFLICT")
      return jsonError(
        "Project changed while you were answering. Refresh and retry.",
        409,
      );
    return jsonError("RockFoundry couldn't record that decision.", 422);
  }
}
