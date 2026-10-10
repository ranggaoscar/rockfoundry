import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import {
  OWNER_COOKIE,
  isOwnerToken,
  ownerAuthReady,
  ownerDevFallbackAllowed,
} from "./owner-policy";
import { isWorkOriginAllowed } from "./work-origin";

export async function ownerAccessResponse(
  req: NextRequest,
): Promise<Response | null> {
  if (!ownerAuthReady())
    return ownerDevFallbackAllowed(req)
      ? null
      : Response.json(
          { error: "Owner Google authentication is not provisioned." },
          { status: 503 },
        );
  const headers = new Headers(req.headers);
  headers.delete("authorization"); // static/Bearer API secrets are never owner sessions
  const token = await getToken({
    req: {
      headers: Object.fromEntries(headers),
      cookies: req.cookies,
    } as never,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: OWNER_COOKIE,
    secureCookie: true,
  });
  if (!isOwnerToken(token))
    return Response.json(
      {
        error: token
          ? "This Google identity is not an authorized owner or its session expired."
          : "Owner Google sign-in required.",
      },
      { status: token ? 403 : 401, headers: { "Cache-Control": "no-store" } },
    );
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    !isWorkOriginAllowed(req, process.env.NEXTAUTH_URL)
  )
    return Response.json(
      { error: "Cross-origin private actions are forbidden." },
      { status: 403 },
    );
  return null;
}

// Preserve each existing handler's params contract; authorization runs before any handler/DB/tool.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withOwner<T extends (...args: any[]) => Promise<Response>>(
  handler: T,
): T {
  return (async (...args: Parameters<T>) => {
    const denied = await ownerAccessResponse(args[0] as NextRequest);
    if (denied) return denied;
    const response = await handler(...args);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }) as T;
}
