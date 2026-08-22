export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";
import { z } from "zod";
import {
  getLocalProject,
  jsonError,
  parseProjectState,
  saveProjectState,
} from "@/lib/local-project";
import { isSearchConfigured, searchWeb } from "@/lib/search-provider";

const SearchInput = z.object({ query: z.string().trim().min(3).max(300) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getLocalProject(id);
  if (!project) return jsonError("Project not found", 404);
  if (!isSearchConfigured())
    return jsonError(
      "Web research is not configured for this RockFoundry runtime.",
      503,
    );

  let query: string;
  try {
    query = SearchInput.parse(await request.json()).query;
  } catch {
    return jsonError("Enter a short research query.", 400);
  }

  const toolRun = await prisma.toolRun.create({
    data: {
      projectId: id,
      toolName: "web_search",
      status: "RUNNING",
      inputSummary: query,
      startedAt: new Date(),
    },
  });
  try {
    const results = await searchWeb(query);
    const references = await Promise.all(
      results.map((result) =>
        prisma.reference.create({
          data: {
            projectId: id,
            type: "WEB_SEARCH",
            url: result.url,
            status: "ANALYZED",
            untrusted: true,
            metadata: JSON.stringify({
              title: result.title,
              summary: result.snippet,
              query,
            }),
          },
        }),
      ),
    );
    const state = parseProjectState(project);
    for (const reference of references) {
      if (!state.references.some((item) => item.url === reference.url)) {
        state.references.push({
          id: reference.id,
          type: "URL",
          url: reference.url,
          status: "ANALYZED",
          metadata: JSON.parse(reference.metadata || "{}"),
          source: "TOOL",
          untrusted: true,
        });
      }
    }
    const saved = await saveProjectState(id, state, project.version);
    await prisma.toolRun.update({
      where: { id: toolRun.id },
      data: {
        status: "COMPLETED",
        outputSummary: `Found ${results.length} public references as untrusted evidence.`,
        completedAt: new Date(),
      },
    });
    return Response.json({
      query,
      results: results.map((result) => ({
        title: result.title,
        url: result.url,
        snippet: result.snippet,
      })),
      state: saved.state,
      version: saved.version,
    });
  } catch {
    await prisma.toolRun.update({
      where: { id: toolRun.id },
      data: {
        status: "FAILED",
        failureReason: "Web search failed",
        completedAt: new Date(),
      },
    });
    return jsonError(
      "RockFoundry couldn't complete that web research request.",
      502,
    );
  }
}
