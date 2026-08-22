import { describe, expect, it } from "vitest";
import { isPublicDemo } from "../public-demo";

describe("public demo flag", () => {
  it.each([
    [undefined, false],
    ["", false],
    ["false", false],
    ["TRUE", false],
    ["true", true],
    ["1", true],
  ])("treats %j as %s", (value, expected) => {
    expect(isPublicDemo({ ROCKFOUNDRY_PUBLIC_DEMO: value })).toBe(expected);
  });
});
