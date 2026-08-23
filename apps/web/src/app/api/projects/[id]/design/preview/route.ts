export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import {
  getLocalProject,
  jsonError,
  parseProjectState,
} from "@/lib/local-project";

function previewDocument(files: Array<{ path: string; content: string }>) {
  const html = files.find((file) => file.path === "index.html")?.content || "";
  const css = files.find((file) => file.path === "styles.css")?.content || "";
  const js = files.find((file) => file.path === "app.js")?.content || "";
  return html
    .replace(
      `<link rel="stylesheet" href="styles.css">`,
      `<style>${css}</style>`,
    )
    .replace(`<script src="app.js"></script>`, `<script>${js}</script>`);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getLocalProject(id);
  if (!project) return jsonError("Project not found", 404);
  const pack = parseProjectState(project).generationMetadata.designPackage as
    | { files?: Array<{ path: string; content: string }> }
    | undefined;
  if (!pack?.files?.length) return jsonError("No prototype yet.", 404);
  return new Response(previewDocument(pack.files), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:;",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
