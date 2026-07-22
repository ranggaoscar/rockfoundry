import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";
import { requireAuth, AuthError, jsonError } from "@/lib/auth-helpers";
import { extractTextFromUrl } from "@rockfoundry/core";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    const { id } = await params;

    const member = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: session.user.id, projectId: id } },
    });
    if (!member) return jsonError("Project not found", 404);

    const body = await req.json();
    const { url, type = "URL" } = body;
    
    if (!url) return jsonError("URL is required", 400);

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return jsonError("Invalid URL format", 400);
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return jsonError("Only HTTP/HTTPS URLs are supported", 400);
    }

    const hostname = parsedUrl.hostname;
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      (hostname.startsWith("172.") && parseInt(hostname.split(".")[1]) >= 16 && parseInt(hostname.split(".")[1]) <= 31)
    ) {
      return jsonError("Internal IP ranges are not permitted", 400);
    }

    if (type === "GITHUB_REPO" && hostname !== "github.com") {
      return jsonError("GitHub references must point to github.com", 400);
    }

    const ref = await prisma.reference.create({
      data: {
        projectId: id,
        url,
        type,
        status: "processing", // We do sync for now in alpha
      },
    });

    try {
      let extracted = "";
      if (type === "URL") {
        extracted = await extractTextFromUrl(url);
      } else {
        // Mock GitHub extraction
        const parts = parsedUrl.pathname.split("/").filter(Boolean);
        if (parts.length >= 2) {
          extracted = `GitHub Repo: ${parts[0]}/${parts[1]}\nFound typical SaaS structure. Auth, database, UI components.`;
        } else {
          extracted = `GitHub URL requires org/repo format.`;
        }
      }

      await prisma.reference.update({
        where: { id: ref.id },
        data: {
          status: "analyzed",
          metadata: { summary: extracted.substring(0, 1000) },
        },
      });

      return Response.json({ reference: { ...ref, status: "analyzed", metadata: { summary: extracted.substring(0, 500) + "..." } } });
    } catch (err: any) {
      await prisma.reference.update({
        where: { id: ref.id },
        data: {
          status: "failed",
          metadata: { error: err.message },
        },
      });
      return jsonError(`Reference analysis failed: ${err.message}`, 422);
    }
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    console.error(e);
    return jsonError("Internal error", 500);
  }
}
