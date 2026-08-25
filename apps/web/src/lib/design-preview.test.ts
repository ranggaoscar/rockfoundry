import { describe, expect, it } from "vitest";
import { selectCoherentPrototypeSet } from "./design-preview";

const artifact = (type: string, version: number, canonicalVersion = 3) => ({
  type,
  version,
  canonicalVersion,
  status: "READY",
  content: `${type}-${version}`,
});

describe("persisted design preview selection", () => {
  it("selects one complete common-version set instead of mixing files", () => {
    const selected = selectCoherentPrototypeSet(
      [
        artifact("PROTOTYPE_HTML", 2),
        artifact("PROTOTYPE_CSS", 2),
        artifact("PROTOTYPE_JS", 1),
        artifact("PROTOTYPE_HTML", 1),
        artifact("PROTOTYPE_CSS", 1),
        artifact("PROTOTYPE_JS", 1),
      ],
      3,
    );
    expect(selected?.html.content).toBe("PROTOTYPE_HTML-1");
    expect(selected?.css.content).toBe("PROTOTYPE_CSS-1");
    expect(selected?.js.content).toBe("PROTOTYPE_JS-1");
  });

  it("rejects null-canonical legacy files", () => {
    const selected = selectCoherentPrototypeSet(
      [
        artifact("PROTOTYPE_HTML", 1, null as unknown as number),
        artifact("PROTOTYPE_CSS", 1, null as unknown as number),
        artifact("PROTOTYPE_JS", 1, null as unknown as number),
      ],
      3,
    );
    expect(selected).toBeNull();
  });
});
