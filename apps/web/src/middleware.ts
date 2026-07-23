import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/register",
  "/pricing",
];

const PUBLIC_API_ROUTES = [
  "/api/auth/",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow static assets
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/public")
  ) {
    return NextResponse.next();
  }

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + "?"))) {
    return NextResponse.next();
  }

  // Allow public API auth routes (these have their own auth logic)
  if (PUBLIC_API_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Check authentication for protected routes
  // Better Auth uses a session cookie; check for any better-auth cookie
  const hasAuthCookie = Array.from(req.cookies.getAll())
    .some((c) => c.name.startsWith("better-auth"));

  if (!hasAuthCookie) {
    // API routes handle their own auth via requireAuth()
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    // Page routes: redirect to login
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
};
