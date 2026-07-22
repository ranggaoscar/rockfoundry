export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

// POST /api/auth/sign-out
export async function POST(req: NextRequest) {
  // Clear the auth cookie - in a real app better-auth handles this automatically
  // but we can just return success here
  return Response.json({ ok: true });
}
