import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Agentic V1 is local-first. The OS account and local process are the access boundary. */
export function middleware(req: NextRequest) {
  void req;
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"],
};
