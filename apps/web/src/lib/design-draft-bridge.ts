import type { DesignScreen } from "@rockfoundry/core";

export const DRAFT_BRIDGE_TYPES = [
  "BRD",
  "PRD",
  "ERD",
  "USER_FLOWS",
  "SCREEN_MAP",
  "DESIGN_BRIEF",
] as const;

type DraftBridgeArtifact = {
  type: string;
  version: number;
  canonicalVersion: number | null;
  generatedAt: Date;
};

export function selectCoherentDraftArtifacts(
  artifacts: DraftBridgeArtifact[],
): Record<(typeof DRAFT_BRIDGE_TYPES)[number], DraftBridgeArtifact> | null {
  const groups = new Map<string, DraftBridgeArtifact[]>();
  for (const artifact of artifacts) {
    if (!DRAFT_BRIDGE_TYPES.includes(artifact.type as (typeof DRAFT_BRIDGE_TYPES)[number])) continue;
    const key = `${artifact.canonicalVersion ?? "legacy"}:${artifact.version}`;
    const group = groups.get(key) || [];
    group.push(artifact);
    groups.set(key, group);
  }
  const candidates = [...groups.values()]
    .filter((group) => DRAFT_BRIDGE_TYPES.every((type) => group.some((artifact) => artifact.type === type)))
    .sort((left, right) => {
      const leftCanonical = left[0]?.canonicalVersion ?? -1;
      const rightCanonical = right[0]?.canonicalVersion ?? -1;
      return rightCanonical - leftCanonical || (right[0]?.version || 0) - (left[0]?.version || 0);
    });
  const group = candidates[0];
  if (!group) return null;
  return Object.fromEntries(
    DRAFT_BRIDGE_TYPES.map((type) => [type, group.find((artifact) => artifact.type === type)!]),
  ) as Record<(typeof DRAFT_BRIDGE_TYPES)[number], DraftBridgeArtifact>;
}

function slug(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "screen";
}

function pushScreen(
  screens: DesignScreen[],
  name: string,
  route: string,
  purpose: string,
  actorIds: string[] = [],
) {
  if (!/^#\/[a-z0-9/-]*$/.test(route)) return;
  screens.push({
    id: slug(name),
    name,
    actorIds,
    purpose,
    route,
    status: "DRAFT",
    source: "INFERRED",
  });
}

export function parsePersistedScreenMap(markdown: string): DesignScreen[] {
  const screens: DesignScreen[] = [];
  const blocks = markdown.split(/\n(?=### \d+\. )/g).filter((block) => /^### \d+\. /m.test(block));
  for (const block of blocks) {
    const heading = block.match(/^### \d+\. (.+)$/m)?.[1]?.trim();
    const route = block.match(/^- Route: `([^`]+)`$/m)?.[1]?.trim();
    const purpose = block.match(/^- Purpose: (.+)$/m)?.[1]?.trim();
    if (!heading || !route || !purpose) continue;
    const actors = block.match(/^- Actor\(s\): (.+)$/m)?.[1]?.split(",").map((item) => item.trim()).filter(Boolean) || [];
    pushScreen(screens, heading, route, purpose, actors);
  }
  for (const match of markdown.matchAll(/- \*\*(?:CONFIRMED|ASSUMPTION|PROPOSAL|OPEN_QUESTION)\*\* (.+?) — Route: `([^`]+)` — Purpose: (.+)$/gm)) {
    pushScreen(screens, match[1], match[2], match[3]);
  }
  return screens;
}
