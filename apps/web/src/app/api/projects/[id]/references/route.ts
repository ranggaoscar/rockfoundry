export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";
import { requireAuth, AuthError, jsonError } from "@/lib/auth-helpers";
import { runJob } from "@/lib/jobs";
import { getSubscriptionInfo } from "@/lib/entitlements";
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
    const { info, service } = await getSubscriptionInfo(session.user.id);
    const entitlement = service.checkReferenceLimit(info);
    if (!entitlement.allowed) return jsonError(entitlement.reason || "Reference limit reached", 429);

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

    try {
      const jobType = type === "GITHUB_REPO" ? "github_reference_analysis" : "website_reference_analysis";
      await runJob(jobType, `reference:${ref.id}`, { referenceId: ref.id }, async () => {
        if (type === "GITHUB_REPO") {
          const analysis = await analyzeGitHubRepo(parseGitHubUrl(url)!);
          if (!analysis.success) throw new Error(analysis.error || "Reference analysis failed");
          return prisma.reference.update({ where: { id: ref.id }, data: { status: "analyzed", metadata: analysis.data as never } });
        }

        const analysis = await safeExtractFromUrl(url);
        if (!analysis.success) throw new Error(analysis.error || "Reference analysis failed");
        return prisma.reference.update({
          where: { id: ref.id },
          data: {
            status: "analyzed",
            metadata: {
              title: analysis.title,
              headers: analysis.headers?.slice(0, 20),
              textPreview: analysis.text?.substring(0, 5000),
              summary: analysis.title || analysis.text?.substring(0, 200) || "Analyzed",
            },
          },
        });
      });
      const updated = await prisma.reference.findUnique({ where: { id: ref.id } });
      return Response.json({ reference: updated });
    } catch (error) {
      await prisma.reference.update({
        where: { id: ref.id },
        data: { status: "failed", metadata: { error: error instanceof Error ? error.message : "Reference analysis failed" } },
      });
      return jsonError(error instanceof Error ? `Reference analysis failed: ${error.message}` : "Reference analysis failed", 422);
    }
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    console.error(e);
    return jsonError("Internal error", 500);
  }
}
