import { auth } from "@/lib/auth";
import { NextRequest } from "next/server";

/**
 * Get the current session from a Next.js App Router request.
 * Returns null if not authenticated.
 */
export async function getSession(req: NextRequest) {
  const session = await auth.api.getSession({
    headers: req.headers as any,
  });
  return session;
}

/**
 * Require authentication; throw 401 if not authenticated.
 */
export async function requireAuth(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    throw new AuthError("Not authenticated", 401);
  }
  return session;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/**
 * Return a JSON error response.
 */
export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
