import { describe, expect, it } from "vitest";
import { hasCompleteCurrentProductDraft } from "./current-product-draft";

const types = ["BRD", "PRD", "ERD", "USER_FLOWS", "SCREEN_MAP", "DESIGN_BRIEF"];

function draft(version = 3) {
  return {
    generation: { canonicalVersion: version },
    artifacts: types.map((type) => ({
      type,
      content: `# ${type}`,
      canonicalVersion: version,
    })),
  };
}

describe("current Product Draft invariant", () => {
  it("blocks raw idea only because there is no persisted draft", () => {
    expect(hasCompleteCurrentProductDraft(null, 3, true)).toBe(false);
  });

  it("blocks a partial Product Draft", () => {
    const partial = draft();
    partial.artifacts.pop();
    expect(hasCompleteCurrentProductDraft(partial, 3, true)).toBe(false);
  });

  it("blocks a stale Product Draft version", () => {
    expect(hasCompleteCurrentProductDraft(draft(2), 3, false)).toBe(false);
  });

  it("allows exactly one complete current Product Draft", () => {
    expect(hasCompleteCurrentProductDraft(draft(), 3, true)).toBe(true);
  });

  it("blocks duplicate or empty current artifacts", () => {
    const duplicate = draft();
    duplicate.artifacts[5] = { ...duplicate.artifacts[0] };
    expect(hasCompleteCurrentProductDraft(duplicate, 3, true)).toBe(false);
    const empty = draft();
    empty.artifacts[0].content = " ";
    expect(hasCompleteCurrentProductDraft(empty, 3, true)).toBe(false);
  });
});
