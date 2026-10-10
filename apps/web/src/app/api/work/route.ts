import { withOwner } from "@/lib/owner-access";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";
import { applyWorkAction, workSnapshot, WorkError } from "@/lib/work-os";
import { isWorkOriginAllowed } from "@/lib/work-origin";

function errorResponse(cause: unknown) {
  if (cause instanceof WorkError)
    return Response.json({ error: cause.message }, { status: cause.status });
  return Response.json(
    {
      error:
        "Work data could not be loaded or saved. Check local migrations and retry.",
    },
    { status: 500 },
  );
}
async function GETHandler(req: NextRequest) {
  // Request is consumed by withOwner (owner session + origin checks) before this runs.
  void req;
  try {
    return Response.json(await workSnapshot(prisma), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    return errorResponse(cause);
  }
}
async function POSTHandler(req: NextRequest) {
  if (!isWorkOriginAllowed(req))
    return Response.json(
      { error: "Cross-origin work mutations are not allowed." },
      { status: 403 },
    );
  if (!req.headers.get("content-type")?.includes("application/json"))
    return Response.json({ error: "JSON body required." }, { status: 415 });
  try {
    const text = await req.text();
    if (text.length > 50000)
      return Response.json(
        { error: "Work request is too large." },
        { status: 413 },
      );
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    return Response.json(await applyWorkAction(prisma, body));
  } catch (cause) {
    return errorResponse(cause);
  }
}
export const GET = withOwner(GETHandler);
export const POST = withOwner(POSTHandler);
