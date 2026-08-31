import { describe, expect, it } from "vitest";
import { designGenerationReady } from "./design-studio";

describe("DesignStudio generation readiness", () => {
  it("does not enqueue generation for an idea without a package or draft spec", () => {
    expect(
      designGenerationReady({
        packageReady: false,
        draftSpecReady: false,
        packageDesignReady: false,
      }),
    ).toBe(false);
  });

  it("enables generation for a draft-ready spec or final package", () => {
    expect(
      designGenerationReady({
        packageReady: false,
        draftSpecReady: true,
        packageDesignReady: false,
      }),
    ).toBe(true);
    expect(
      designGenerationReady({
        packageReady: true,
        draftSpecReady: false,
        packageDesignReady: false,
      }),
    ).toBe(true);
  });
});
