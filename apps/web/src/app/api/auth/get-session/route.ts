export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth-helpers";

// GET /api/auth/get-session
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return Response.json({ user: null }, { status: 401 });
  }
  return Response.json({ user: session.user });
}
