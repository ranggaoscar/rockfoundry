export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";
import { requireAuth, AuthError, jsonError } from "@/lib/auth-helpers";
import { safeExtractFromUrl, analyzeGitHubRepo, parseGitHubUrl } from "@rockfoundry/core";

// GET /api/projects/[id]/references — list references
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    const { id } = await params;

    const member = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: session.user.id, projectId: id } },
    });
    if (!member) return jsonError("Project not found", 404);

    const references = await prisma.reference.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ references });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    return jsonError("Internal error", 500);
  }
}

// POST /api/projects/[id]/references — add a new reference
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

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return jsonError("Invalid URL format", 400);
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return jsonError("Only HTTP/HTTPS URLs are supported", 400);
    }

    // Validate for GitHub repos
    if (type === "GITHUB_REPO") {
      if (parsedUrl.hostname !== "github.com") {
        return jsonError("GitHub references must point to github.com", 400);
      }
      const repoInfo = parseGitHubUrl(url);
      if (!repoInfo) {
        return jsonError("Invalid GitHub URL format. Use https://github.com/owner/repo", 400);
      }
    }

    const ref = await prisma.reference.create({
      data: {
        projectId: id,
        url,
        type,
        status: "processing",
      },
    });

    // Run analysis (synchronous for alpha)
    try {
      if (type === "GITHUB_REPO") {
        const repoInfo = parseGitHubUrl(url)!;
        const result = await analyzeGitHubRepo(repoInfo);

        if (result.success) {
          await prisma.reference.update({
            where: { id: ref.id },
            data: {
              status: "analyzed",
              metadata: result.data as any,
            },
          });
        } else {
          await prisma.reference.update({
            where: { id: ref.id },
            data: {
              status: "failed",
              metadata: { error: result.error },
            },
          });
          return jsonError(`Analysis failed: ${result.error}`, 422);
        }
      } else {
        // Website URL analysis using safe extraction
        const result = await safeExtractFromUrl(url);

        if (result.success) {
          await prisma.reference.update({
            where: { id: ref.id },
            data: {
              status: "analyzed",
              metadata: {
                title: result.title,
                headers: result.headers?.slice(0, 20),
                textPreview: result.text?.substring(0, 5000),
                summary: result.title || result.text?.substring(0, 200) || "Analyzed" ,
              },
            },
          });
        } else {
          await prisma.reference.update({
            where: { id: ref.id },
            data: {
              status: "failed",
              metadata: { error: result.error },
            },
          });
          return jsonError(`Analysis failed: ${result.error}`, 422);
        }
      }

      const updated = await prisma.reference.findUnique({ where: { id: ref.id } });
      return Response.json({ reference: updated });
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
