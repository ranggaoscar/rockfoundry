export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";
import { requireAuth, AuthError, jsonError } from "@/lib/auth-helpers";
import { ProjectStateSchema } from "@rockfoundry/core";
import { getSubscriptionInfo } from "@/lib/entitlements";
import { z } from "zod";

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
});

// GET /api/projects — list user's projects
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);

    const projects = await prisma.project.findMany({
      where: {
        members: { some: { userId: session.user.id } },
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    return Response.json({ projects });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    return jsonError("Internal error", 500);
  }
}

// POST /api/projects — create a new project
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const body = await req.json();

    const { info, service } = await getSubscriptionInfo(session.user.id);
    const entitlement = service.checkProjectLimit(info);
    if (!entitlement.allowed) return jsonError(entitlement.reason || "Project limit reached", 429);

    const parsed = CreateProjectSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid input: " + parsed.error.issues.map(i => i.message).join(", "), 400);
    }

    // Create project with initial canonical state
    const initialState = ProjectStateSchema.parse({
      id: "", // Will be set to project.id after creation
      name: parsed.data.name,
      rawIdea: parsed.data.description || "",
    });

    const project = await prisma.project.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description || null,
        canonicalState: initialState as any,
        members: {
          create: { userId: session.user.id, role: "owner" },
        },
        revisions: {
          create: { version: 1, state: initialState as any },
        },
      },
      select: { id: true, name: true, version: true, createdAt: true },
    });

    // Update the state id to match the project id
    initialState.id = project.id;
    await prisma.project.update({
      where: { id: project.id },
      data: { canonicalState: initialState as any },
    });

    return Response.json({ project }, { status: 201 });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    console.error("Create project error:", e);
    return jsonError("Internal error", 500);
  }
}
