export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { DRAFT_ARTIFACT_TYPES, persistDraftArtifacts } from "@/lib/artifacts";
import {
  getLocalProject,
  jsonError,
  parseProjectState,
} from "@/lib/local-project";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await getLocalProject(id);
    if (!project) return jsonError("Project not found", 404);
    const state = parseProjectState(project);
    if (!state.rawIdea.trim() && !state.normalizedSummary?.trim()) {
      return jsonError(
        "Add a product idea before generating a Product Draft.",
        422,
        { code: "DRAFT_INPUT_REQUIRED" },
      );
    }
    const generated = await persistDraftArtifacts(id, project.version, state);
    return Response.json({
      spec: {
        status: generated.consistency.status,
        unresolvedQuestions: state.openQuestions,
        assumptions: state.assumptions,
        documents: DRAFT_ARTIFACT_TYPES.map((type) => `${type}.md`),
      },
      version: project.version,
      consistency: generated.consistency,
      documents: generated.artifacts,
    });
  } catch {
    return jsonError("RockFoundry couldn't create the draft spec.", 422);
  }
}
