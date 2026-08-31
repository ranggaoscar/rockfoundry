import {
  DesignScreenSchema,
  type ArtifactComposerDocument,
  type ArtifactComposerItem,
  type DesignScreen,
} from "@rockfoundry/core";

export const DRAFT_BRIDGE_TYPES = [
  "BRD",
  "PRD",
  "ERD",
  "USER_FLOWS",
  "SCREEN_MAP",
  "DESIGN_BRIEF",
] as const;

const CANONICAL_SCREEN_MAP_FENCE = "rockfoundry-screen-map";

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
    if (
      !DRAFT_BRIDGE_TYPES.includes(
        artifact.type as (typeof DRAFT_BRIDGE_TYPES)[number],
      )
    )
      continue;
    const key = `${artifact.canonicalVersion ?? "legacy"}:${artifact.version}`;
    const group = groups.get(key) || [];
    group.push(artifact);
    groups.set(key, group);
  }
  const candidates = [...groups.values()]
    .filter((group) =>
      DRAFT_BRIDGE_TYPES.every((type) =>
        group.some((artifact) => artifact.type === type),
      ),
    )
    .sort((left, right) => {
      const leftCanonical = left[0]?.canonicalVersion ?? -1;
      const rightCanonical = right[0]?.canonicalVersion ?? -1;
      return (
        rightCanonical - leftCanonical ||
        (right[0]?.version || 0) - (left[0]?.version || 0)
      );
    });
  const group = candidates[0];
  if (!group) return null;
  return Object.fromEntries(
    DRAFT_BRIDGE_TYPES.map((type) => [
      type,
      group.find((artifact) => artifact.type === type)!,
    ]),
  ) as Record<(typeof DRAFT_BRIDGE_TYPES)[number], DraftBridgeArtifact>;
}

function slug(value: string) {
  return (
    value
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "screen"
  );
}

function defaultRoute(name: string) {
  const normalized = slug(name);
  if (normalized === "dashboard") return "#/";
  if (normalized === "add-transaction") return "#/transactions/new";
  if (normalized === "history") return "#/history";
  return `#/${normalized}`;
}

function defaultPurpose(name: string) {
  const normalized = slug(name);
  if (normalized === "dashboard")
    return "Review the current balance and recent money movement.";
  if (normalized === "add-transaction") return "Record income or expense.";
  if (normalized === "history") return "Review recorded income and expenses.";
  return `Complete the confirmed ${name.toLocaleLowerCase()} task.`;
}

function sourceFor(
  label?: ArtifactComposerItem["label"],
): DesignScreen["source"] {
  if (label === "CONFIRMED") return "CONFIRMED";
  if (label === "ASSUMPTION") return "ASSUMPTION";
  return "INFERRED";
}

function createScreen(
  name: string,
  route: string,
  purpose: string,
  label?: ArtifactComposerItem["label"],
  actorIds: string[] = [],
): DesignScreen | null {
  const parsed = DesignScreenSchema.safeParse({
    id: slug(name),
    name: name.trim(),
    actorIds,
    purpose: purpose.trim(),
    route: route.trim(),
    status: "DRAFT",
    source: sourceFor(label),
  });
  return parsed.success ? parsed.data : null;
}

function addScreen(screens: DesignScreen[], screen: DesignScreen | null) {
  if (
    !screen ||
    screens.some((item) => item.id === screen.id || item.route === screen.route)
  )
    return;
  screens.push(screen);
}

function screenNamesFromText(text: string) {
  const match = text.match(
    /(?:^|\b)([A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)*(?:\s*,\s*[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)*)*(?:\s*,?\s*(?:and|dan)\s+[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)*)?)\s+screens?\b/,
  );
  if (!match?.[1]) return [];
  return match[1]
    .split(/\s*,\s*|\s+(?:and|dan)\s+/i)
    .map((name) => name.replace(/^(?:and|dan)\s+/i, "").trim())
    .filter(Boolean);
}

function screensFromText(text: string, label?: ArtifactComposerItem["label"]) {
  const screens: DesignScreen[] = [];
  const routeMatch = text.match(
    /^(.+?)\s+—\s+Route:\s*`([^`]+)`\s+—\s+Purpose:\s*(.+)$/i,
  );
  if (routeMatch) {
    addScreen(
      screens,
      createScreen(routeMatch[1], routeMatch[2], routeMatch[3], label),
    );
    return screens;
  }
  for (const name of screenNamesFromText(text)) {
    addScreen(
      screens,
      createScreen(name, defaultRoute(name), defaultPurpose(name), label),
    );
  }
  return screens;
}

export function screenMapFromComposedDocument(
  document: ArtifactComposerDocument,
) {
  const screens: DesignScreen[] = [];
  for (const section of document.sections) {
    for (const text of section.paragraphs) {
      for (const screen of screensFromText(text)) addScreen(screens, screen);
    }
    for (const item of section.items) {
      for (const screen of screensFromText(item.text, item.label))
        addScreen(screens, screen);
    }
  }
  return screens;
}

export function formatCanonicalScreenMap(document: ArtifactComposerDocument) {
  return `\`\`\`${CANONICAL_SCREEN_MAP_FENCE}\n${JSON.stringify(screenMapFromComposedDocument(document), null, 2)}\n\`\`\``;
}

function parseCanonicalScreenMap(markdown: string) {
  const marker = `\`\`\`${CANONICAL_SCREEN_MAP_FENCE}`;
  const start = markdown.indexOf(marker);
  if (start < 0) return [];
  const contentStart = markdown.indexOf("\n", start) + 1;
  const end = markdown.indexOf("\`\`\`", contentStart);
  if (contentStart === 0 || end < 0) return [];
  try {
    const parsed = DesignScreenSchema.array().safeParse(
      JSON.parse(markdown.slice(contentStart, end)),
    );
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function parsePersistedScreenMap(markdown: string): DesignScreen[] {
  const canonical = parseCanonicalScreenMap(markdown);
  if (canonical.length) return canonical;
  const screens: DesignScreen[] = [];
  const blocks = markdown
    .split(/\n(?=### \d+\. )/g)
    .filter((block) => /^### \d+\. /m.test(block));
  for (const block of blocks) {
    const heading = block.match(/^### \d+\. (.+)$/m)?.[1]?.trim();
    const route = block.match(/^- Route: `([^`]+)`$/m)?.[1]?.trim();
    const purpose = block.match(/^- Purpose: (.+)$/m)?.[1]?.trim();
    if (!heading || !route || !purpose) continue;
    const actors =
      block
        .match(/^- Actor\(s\): (.+)$/m)?.[1]
        ?.split(",")
        .map((item) => item.trim())
        .filter(Boolean) || [];
    addScreen(
      screens,
      createScreen(heading, route, purpose, undefined, actors),
    );
  }
  for (const match of markdown.matchAll(
    /- \*\*(CONFIRMED|ASSUMPTION|PROPOSAL|OPEN_QUESTION)\*\* (.+)$/gm,
  )) {
    const label = match[1] as ArtifactComposerItem["label"];
    for (const screen of screensFromText(match[2], label))
      addScreen(screens, screen);
  }
  for (const line of markdown.split(/\r?\n/)) {
    if (!/^\s*-\s+/.test(line)) continue;
    const content = line
      .replace(
        /^\s*-\s+(?:\*\*(?:CONFIRMED|ASSUMPTION|PROPOSAL|OPEN_QUESTION)\*\*\s+)?/i,
        "",
      )
      .trim();
    for (const screen of screensFromText(content)) addScreen(screens, screen);
  }
  return screens;
}
