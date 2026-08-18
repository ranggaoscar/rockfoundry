export const dynamic = "force-dynamic";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";
import {
  createInitialProjectState,
  deriveProjectTitle,
} from "@rockfoundry/core";
import { runInitialDiscovery } from "@/lib/discovery";
import { jsonError, publicProject } from "@/lib/local-project";
import { z } from "zod";

const CreateProjectSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
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
    if (!parsed.success) return jsonError("A project idea is required.", 400);
    const description = parsed.data.description?.trim() || "";
    const id = randomUUID();
    const name = parsed.data.name?.trim() || deriveProjectTitle(description);
    const state = createInitialProjectState({
      id,
      name,
      rawIdea: description,
    });
    const project = await prisma.project.create({
      data: {
        id,
        name,
        description: description || null,
        canonicalState: JSON.stringify(state),
        revisions: {
          create: {
            version: 1,
            state: JSON.stringify(state),
            reason: "project created",
          },
        },
        messages: description
          ? {
              create: {
                role: "user",
                content: description,
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
    try {
      await runInitialDiscovery(id, description, project.version);
    } catch {
      // The raw idea remains available for a contextual fallback question.
    }
    const updated = await prisma.project.findUnique({
      where: { id },
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
    return Response.json(
      { project: publicProject(updated || project) },
      { status: 201 },
    );
  } catch {
    return jsonError("RockFoundry couldn't create the local project.", 500);
  }
}
