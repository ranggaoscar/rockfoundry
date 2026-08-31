export const DESIGN_PREVIEW_ARTIFACT_TYPES = [
  "PROTOTYPE_HTML",
  "PROTOTYPE_CSS",
  "PROTOTYPE_JS",
] as const;

export const DESIGN_MANIFEST_ARTIFACT = "DESIGN_MANIFEST" as const;
export const DESIGN_PREVIEW_STATUSES = [
  "READY",
  "IN_REVIEW",
  "APPROVED",
] as const;

type PrototypePreviewFile = { path: string; content: string };

const CSS_ASSET_TAG = /<link\b(?=[^>]*\brel\s*=\s*(?:"stylesheet"|'stylesheet'|stylesheet\b))(?=[^>]*\bhref\s*=\s*(?:"styles\.css"|'styles\.css'|styles\.css\b))[^>]*>|<style\b(?=[^>]*\bdata-rf-prototype-asset\s*=\s*(?:"styles\.css"|'styles\.css'|styles\.css\b))[^>]*>[\s\S]*?<\/style\s*>/gi;
const JS_ASSET_TAG = /<script\b(?=[^>]*\bsrc\s*=\s*(?:"app\.js"|'app\.js'|app\.js\b))[^>]*>[\s\S]*?<\/script\s*>|<script\b(?=[^>]*\bdata-rf-prototype-asset\s*=\s*(?:"app\.js"|'app\.js'|app\.js\b))[^>]*>[\s\S]*?<\/script\s*>/gi;

function escapeInlineAsset(content: string, tagName: "style" | "script") {
  return content.replace(new RegExp(`</${tagName}`, "gi"), `<\\/${tagName}`);
}

function replaceAssetReferences(document: string, pattern: RegExp, asset: string) {
  let inserted = false;
  const rendered = document.replace(pattern, () => {
    if (inserted) return "";
    inserted = true;
    return asset;
  });
  return { document: rendered, inserted };
}

function insertStyle(document: string, style: string) {
  if (/<\/head\s*>/i.test(document)) return document.replace(/<\/head\s*>/i, `${style}</head>`);
  if (/<html\b[^>]*>/i.test(document))
    return document.replace(/<html\b[^>]*>/i, (html) => `${html}<head>${style}</head>`);
  return `<head>${style}</head>${document}`;
}

function insertScript(document: string, script: string) {
  if (/<\/body\s*>/i.test(document)) return document.replace(/<\/body\s*>/i, `${script}</body>`);
  return `${document}${script}`;
}

export function renderPrototypePreviewDocument(files: PrototypePreviewFile[]) {
  const html = files.find((file) => file.path === "index.html")?.content || "";
  const css = files.find((file) => file.path === "styles.css")?.content || "";
  const js = files.find((file) => file.path === "app.js")?.content || "";
  const style = `<style data-rf-prototype-asset="styles.css">${escapeInlineAsset(css, "style")}</style>`;
  const script = `<script data-rf-prototype-asset="app.js">${escapeInlineAsset(js, "script")}</script>`;
  const cssResult = replaceAssetReferences(html, CSS_ASSET_TAG, style);
  const withCss = cssResult.inserted
    ? cssResult.document
    : insertStyle(cssResult.document, style);
  const jsResult = replaceAssetReferences(withCss, JS_ASSET_TAG, script);
  return jsResult.inserted ? jsResult.document : insertScript(jsResult.document, script);
}

type PersistedDesignArtifact = {
  type: string;
  version: number;
  canonicalVersion: number | null;
  status: string;
  content: string;
};

export type CoherentPrototypeSet = {
  html: PersistedDesignArtifact;
  css: PersistedDesignArtifact;
  js: PersistedDesignArtifact;
  manifest?: PersistedDesignArtifact;
};

export function selectCoherentPrototypeSet(
  artifacts: PersistedDesignArtifact[],
  currentCanonicalVersion: number,
): CoherentPrototypeSet | null {
  const candidates = new Map<string, PersistedDesignArtifact[]>();
  for (const artifact of artifacts) {
    if (
      ![
        ...DESIGN_PREVIEW_ARTIFACT_TYPES,
        DESIGN_MANIFEST_ARTIFACT,
      ].includes(artifact.type as (typeof DESIGN_PREVIEW_ARTIFACT_TYPES)[number] | typeof DESIGN_MANIFEST_ARTIFACT)
    )
      continue;
    if (!DESIGN_PREVIEW_STATUSES.includes(artifact.status as (typeof DESIGN_PREVIEW_STATUSES)[number]))
      continue;
    if (
      artifact.canonicalVersion === null ||
      artifact.canonicalVersion > currentCanonicalVersion
    )
      continue;
    const key = `${artifact.canonicalVersion}:${artifact.version}`;
    const group = candidates.get(key) || [];
    group.push(artifact);
    candidates.set(key, group);
  }

  const complete: CoherentPrototypeSet[] = [];
  for (const group of candidates.values()) {
    const html = group.find((artifact) => artifact.type === "PROTOTYPE_HTML");
    const css = group.find((artifact) => artifact.type === "PROTOTYPE_CSS");
    const js = group.find((artifact) => artifact.type === "PROTOTYPE_JS");
    if (!html || !css || !js) continue;
    complete.push({
      html,
      css,
      js,
      manifest: group.find((artifact) => artifact.type === DESIGN_MANIFEST_ARTIFACT),
    });
  }
  complete.sort((left, right) => {
    const leftCanonical = left.html.canonicalVersion || 0;
    const rightCanonical = right.html.canonicalVersion || 0;
    if (leftCanonical !== rightCanonical) return rightCanonical - leftCanonical;
    return right.html.version - left.html.version;
  });
  return complete[0] || null;
}
