import { describe, expect, it, vi } from "vitest";

vi.mock("./ai-provider", () => ({
  getAiGateway: vi.fn(),
}));

import {
  artifactComposerErrorPayload,
  publicDraftArtifact,
  selectLatestLegacyDraftArtifacts,
} from "./artifact-composer";

describe("Artifact Composer error boundary", () => {
  it("never exposes provider, schema, or database error text", () => {
    const payload = artifactComposerErrorPayload(
      new Error("Prisma password=secret provider payload invalid JSON"),
    );
    expect(payload.error).toBe("RockFoundry couldn't generate the Product Draft.");
    expect(JSON.stringify(payload)).not.toContain("Prisma");
    expect(JSON.stringify(payload)).not.toContain("secret");
    expect(JSON.stringify(payload)).not.toContain("invalid JSON");
  });
});

describe("Product Draft artifact current state", () => {
  const artifact = {
    id: "artifact-1",
    type: "PRD",
    status: "READY",
    content: "# PRD",
    version: 3,
    canonicalVersion: 8,
    generatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  it("marks matching canonical versions current and mismatches stale", () => {
    expect(publicDraftArtifact(artifact, 8).current).toBe(true);
    expect(publicDraftArtifact(artifact, 9).current).toBe(false);
  });
});

describe("legacy Product Draft accessor coherence", () => {
  const types = ["BRD", "PRD", "ERD", "USER_FLOWS", "SCREEN_MAP", "DESIGN_BRIEF"];
  const rows = (version: number) => types.map((type) => ({
    id: `${type}-${version}`,
    type,
    status: "READY",
    content: `${type}-${version}`,
    version,
    canonicalVersion: null,
    generatedAt: new Date("2026-01-01T00:00:00.000Z"),
  }));

  it("rejects mixed legacy versions and selects a coherent set", () => {
    const mixed = [
      ...rows(1).slice(0, 3),
      ...rows(2).slice(3),
    ];
    expect(selectLatestLegacyDraftArtifacts(mixed)).toBeNull();
    const selected = selectLatestLegacyDraftArtifacts(rows(2));
    expect(selected?.every((row) => row.version === 2)).toBe(true);
  });
});
