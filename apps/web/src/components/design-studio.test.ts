import { describe, expect, it } from "vitest";
import { designGenerationReady } from "./design-studio";

describe("DesignStudio generation readiness", () => {
  it("blocks raw idea, package state, and stale drafts unless server reports a current Product Draft", () => {
    expect(designGenerationReady({ currentProductDraftReady: false })).toBe(
      false,
    );
  });

  it("enables generation only for a complete current Product Draft", () => {
    expect(designGenerationReady({ currentProductDraftReady: true })).toBe(
      true,
    );
  });
});
