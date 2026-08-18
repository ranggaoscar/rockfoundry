export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { runInitialDiscovery } from "@/lib/discovery";
import { getLocalProject, jsonError } from "@/lib/local-project";

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

  try {
    const result = await runInitialDiscovery(id, rawIdea, project.version);
    return Response.json(result);
  } catch {
    return jsonError(
      "RockFoundry couldn't reach the configured AI provider. Retry or open Provider Settings.",
      422,
      { retryable: true },
    );
  }
}
