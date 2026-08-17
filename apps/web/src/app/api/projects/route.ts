export const dynamic = "force-dynamic";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";
import { createInitialProjectState } from "@rockfoundry/core";
import { jsonError, publicProject } from "@/lib/local-project";
import { z } from "zod";

const CreateProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
});

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        description: true,
        canonicalState: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });
    return Response.json({ projects: projects.map(publicProject) });
  } catch {
    return jsonError("RockFoundry couldn't load local projects.");
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = CreateProjectSchema.safeParse(await req.json());
    if (!parsed.success)
      return jsonError("Project name and idea are required.", 400);
    const id = randomUUID();
    const state = createInitialProjectState({
      id,
      name: parsed.data.name,
      rawIdea: parsed.data.description || "",
    });
    const project = await prisma.project.create({
      data: {
        id,
        name: parsed.data.name,
        description: parsed.data.description || null,
        canonicalState: JSON.stringify(state),
        revisions: {
          create: {
            version: 1,
            state: JSON.stringify(state),
            reason: "project created",
          },
        },
        messages: parsed.data.description
          ? {
              create: {
                role: "user",
                content: parsed.data.description,
                metadata: JSON.stringify({ source: "USER" }),
              },
            }
          : undefined,
      },
      select: {
        id: true,
        name: true,
        description: true,
        canonicalState: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return Response.json({ project: publicProject(project) }, { status: 201 });
  } catch {
    return jsonError("RockFoundry couldn't create the local project.", 500);
  }
}
