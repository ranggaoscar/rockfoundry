export const dynamic = "force-dynamic";
import { toNodeHandler } from "better-auth/node";
import { auth } from "@/lib/auth";

export const GET = toNodeHandler(auth) as any;
export const POST = toNodeHandler(auth) as any;

// Better Auth expects raw node req/res; Next.js App Router wraps them.
// The toNodeHandler adapter bridges the gap.
export const runtime = "nodejs";
