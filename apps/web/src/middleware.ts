import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import {
  OWNER_COOKIE,
  isOwnerToken,
  ownerAuthReady,
  ownerDevFallbackAllowed,
} from "./lib/owner-policy";

/** Personal owner boundary for private pages/APIs; the public landing page stays open. */
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isApi = path.startsWith("/api/") && !path.startsWith("/api/auth/");
  const isPrivatePage = [
    "/today",
    "/projects",
    "/runs",
    "/project",
    "/settings",
  ].some((prefix) => path === prefix || path.startsWith(prefix + "/"));
  if (!isApi && !isPrivatePage) return NextResponse.next();
  if (!ownerAuthReady()) {
    if (ownerDevFallbackAllowed(req)) return NextResponse.next();
    if (isApi)
      return NextResponse.json(
        { error: "Owner OAuth is not provisioned." },
        { status: 503 },
      );
    return NextResponse.redirect(
      new URL("/login?error=Configuration", req.url),
    );
  }
  const headers = new Headers(req.headers);
  headers.delete("authorization"); // static API secrets are never owner sessions
  const token = await getToken({
    req: { headers, cookies: req.cookies } as never,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: OWNER_COOKIE,
    secureCookie: true,
  });
  if (!isOwnerToken(token)) {
    if (isApi)
      return NextResponse.json(
        { error: "Owner Google session required." },
        { status: token ? 403 : 401 },
      );
    const login = new URL("/login", req.url);
    login.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(login);
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/).*)"],
};
