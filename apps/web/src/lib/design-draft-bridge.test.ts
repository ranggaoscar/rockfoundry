import { describe, expect, it } from "vitest";
import { parsePersistedScreenMap, selectCoherentDraftArtifacts } from "./design-draft-bridge";

describe("persisted Product Draft design bridge", () => {
  it("uses persisted Screen Map routes, actors, purposes, and labels", () => {
    const screenMap = parsePersistedScreenMap(`# Screen Map

## SCREENS

### 1. Order board

- Route: \`#/orders\`
- Actor(s): owner, karyawan
- Purpose: Review laundry orders
- Status: PROPOSAL
- Source: PROPOSAL
`);
    expect(screenMap).toEqual([
      expect.objectContaining({
        id: "order-board",
        route: "#/orders",
        actorIds: ["owner", "karyawan"],
        purpose: "Review laundry orders",
        status: "DRAFT",
        source: "INFERRED",
      }),
    ]);
  });

  it("parses formatter item text with route and purpose", () => {
    const screenMap = parsePersistedScreenMap(
      "# Screen Map\n\n## Starting screens\n\n- **PROPOSAL** Order board — Route: `#/orders` — Purpose: Review laundry orders",
    );
    expect(screenMap).toEqual([
      expect.objectContaining({ id: "order-board", route: "#/orders", purpose: "Review laundry orders" }),
    ]);
  });
});

describe("legacy draft artifact selection", () => {
  it("does not mix legacy artifacts from different versions", () => {
    const selected = selectCoherentDraftArtifacts([
      { type: "BRD", version: 2, canonicalVersion: null, generatedAt: new Date("2026-01-02") },
      { type: "PRD", version: 2, canonicalVersion: null, generatedAt: new Date("2026-01-02") },
      { type: "ERD", version: 2, canonicalVersion: null, generatedAt: new Date("2026-01-02") },
      { type: "USER_FLOWS", version: 1, canonicalVersion: null, generatedAt: new Date("2026-01-01") },
      { type: "SCREEN_MAP", version: 1, canonicalVersion: null, generatedAt: new Date("2026-01-01") },
      { type: "DESIGN_BRIEF", version: 1, canonicalVersion: null, generatedAt: new Date("2026-01-01") },
    ]);
    expect(selected).toBeNull();
  });
});
