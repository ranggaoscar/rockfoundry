import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";
import { withOwner } from "@/lib/owner-access";
import { isWorkOriginAllowed } from "@/lib/work-origin";
import { WorkError } from "@/lib/work-os";
import { applyLivingAction, livingSnapshot } from "@/lib/living-workspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
function errorResponse(error: unknown) {
  if (error instanceof WorkError)
    return Response.json({ error: error.message }, { status: error.status });
  return Response.json(
    {
      error:
        "Workspace data could not be loaded or saved. Your saved ideas remain intact; retry after checking migrations/connectivity.",
    },
    { status: 500 },
  );
}
async function GETHandler(req: NextRequest) {
  try {
    const threadId = req.nextUrl.searchParams.get("threadId") || undefined;
    if (threadId && threadId.length > 200)
      return Response.json(
        { error: "Invalid conversation identity." },
        { status: 400 },
      );
    return Response.json(await livingSnapshot(prisma, threadId));
  } catch (error) {
    return errorResponse(error);
  }
}
async function POSTHandler(req: NextRequest) {
  if (!isWorkOriginAllowed(req))
    return Response.json(
      { error: "Cross-origin workspace actions are forbidden." },
      { status: 403 },
    );
  if (!req.headers.get("content-type")?.includes("application/json"))
    return Response.json({ error: "JSON body required." }, { status: 415 });
  try {
    const text = await req.text();
    if (text.length > 50000)
      return Response.json(
        { error: "Workspace request too large." },
        { status: 413 },
      );
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    return Response.json(await applyLivingAction(prisma, body));
  } catch (error) {
    return errorResponse(error);
  }
}
export const GET = withOwner(GETHandler);
export const POST = withOwner(POSTHandler);
