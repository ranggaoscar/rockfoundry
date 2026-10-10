import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { ownerAuthOptions } from "@/lib/owner-auth";
import { ownerAuthReady } from "@/lib/owner-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handler = NextAuth(ownerAuthOptions);
async function authHandler(
  req: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  if (!ownerAuthReady())
    return Response.json(
      { error: "Owner OAuth configuration is missing." },
      { status: 503 },
    );
  return handler(req, context);
}
export { authHandler as GET, authHandler as POST };
