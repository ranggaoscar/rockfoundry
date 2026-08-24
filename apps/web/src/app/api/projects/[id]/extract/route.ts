export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import {
  getInitialConversationState,
  runInitialConversation,
} from "@/lib/discovery";
import { getLocalProject, jsonError } from "@/lib/local-project";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const status = await getInitialConversationState(id);
  if (!status) return jsonError("Project not found", 404);
  return Response.json(status);
}

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
    const result = await runInitialConversation(id, rawIdea, project.version);
    return Response.json(result);
  } catch (error) {
    const typed = error as Error & {
      retryable?: boolean;
      state?: unknown;
      version?: number;
    };
    return jsonError(
      error instanceof Error
        ? error.message
        : "RockFoundry couldn't reach the configured AI provider. Retry or open Provider Settings.",
      422,
      {
        retryable: typed.retryable === true,
        status: "FAILED",
        ...(typed.state && typeof typed.version === "number"
          ? { state: typed.state, version: typed.version }
          : {}),
      },
    );
  }
}
