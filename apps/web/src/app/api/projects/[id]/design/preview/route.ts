export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";
import {
  getLocalProject,
  jsonError,
  parseProjectState,
} from "@/lib/local-project";
import {
  DESIGN_PREVIEW_ARTIFACT_TYPES,
  renderPrototypePreviewDocument,
  selectCoherentPrototypeSet,
} from "@/lib/design-preview";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getLocalProject(id);
  if (!project) return jsonError("Project not found", 404);
  const artifacts = await prisma.artifact.findMany({
    where: {
      projectId: id,
      type: { in: [...DESIGN_PREVIEW_ARTIFACT_TYPES, "DESIGN_MANIFEST"] },
    },
    orderBy: [{ version: "desc" }, { generatedAt: "desc" }],
  });
  const selected = selectCoherentPrototypeSet(artifacts, project.version);
  if (selected) {
    return new Response(
      renderPrototypePreviewDocument([
        { path: "index.html", content: selected.html.content },
        { path: "styles.css", content: selected.css.content },
        { path: "app.js", content: selected.js.content },
      ]),
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:;",
          "X-Frame-Options": "SAMEORIGIN",
        },
      },
    );
  }
  const pack = parseProjectState(project).generationMetadata.designPackage as
    | { files?: Array<{ path: string; content: string }> }
    | undefined;
  if (!pack?.files?.length) return jsonError("No prototype yet.", 404);
  return new Response(renderPrototypePreviewDocument(pack.files), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:;",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
