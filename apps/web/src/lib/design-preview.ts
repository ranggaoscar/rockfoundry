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
