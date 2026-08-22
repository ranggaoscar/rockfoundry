export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { ProjectStateSchema } from "@rockfoundry/core";
import {
  jsonError,
  getLocalProject,
  parseProjectState,
  publicProject,
  saveProjectState,
  getProjectMessages,
  getProjectActivity,
} from "@/lib/local-project";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await getLocalProject(id);
    if (!project) return jsonError("Project not found", 404);
    const [messages, activity] = await Promise.all([
      getProjectMessages(id),
      getProjectActivity(id),
    ]);
    return Response.json({
      project: publicProject(project),
      messages,
      activity,
    });
  } catch {
    return jsonError("RockFoundry couldn't load this project.");
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await getLocalProject(id);
    if (!project) return jsonError("Project not found", 404);
    const body = await req.json();
    const baseState = body.canonicalState
      ? ProjectStateSchema.parse(body.canonicalState)
      : parseProjectState(project);
    const state =
      typeof body.name === "string" && body.name.trim()
        ? ProjectStateSchema.parse({
            ...baseState,
            name: body.name.trim(),
          })
        : baseState;
    const saved = body.canonicalState
      ? await saveProjectState(
          id,
          state,
          body.expectedVersion,
          body.description,
          body.name,
        )
      : null;
    if (
      !body.canonicalState &&
      (body.description !== undefined || body.name !== undefined)
    ) {
      await saveProjectState(
        id,
        state,
        body.expectedVersion,
        body.description,
        body.name,
      );
    }
    const updated = await getLocalProject(id);
    return Response.json({
      project: publicProject(updated!),
      state: saved?.state || parseProjectState(updated!),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PROJECT_VERSION_CONFLICT")
      return jsonError(
        "Project changed while you were editing. Refresh and retry.",
        409,
      );
    if (error instanceof Error && error.message === "PROJECT_NOT_FOUND")
      return jsonError("Project not found", 404);
    return jsonError("RockFoundry couldn't save this project.", 422);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await getLocalProject(id);
    if (!project) return jsonError("Project not found", 404);
    await import("@rockfoundry/db").then(({ prisma }) =>
      prisma.project.update({ where: { id }, data: { deletedAt: new Date() } }),
    );
    return Response.json({ ok: true });
  } catch {
    return jsonError("RockFoundry couldn't archive this project.", 500);
  }
}
