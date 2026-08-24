import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ApiError } from "@rockfoundry/ai";
import {
  DesignGenerationError,
  logDesignGenerationFailure,
} from "./design";
import { buildPackageFailureMetadata } from "./package-jobs";

describe("safe PackageJob failure metadata", () => {
  it("persists only safe design failure fields", () => {
    const secretBody = "raw provider body api_key=secret-value prompt=private";
    const metadata = buildPackageFailureMetadata(
      new DesignGenerationError(
        "design_architecture",
        new ApiError("provider request failed", 502, secretBody),
      ),
      "DESIGN_ARCHITECTURE",
      { designArchitectureMs: 120_000, totalMs: null },
    );

    expect(metadata).toEqual({
      stage: "DESIGN_ARCHITECTURE",
      task: "design_architecture",
      category: "PROVIDER_5XX",
      statusCode: 502,
      timings: { designArchitectureMs: 120_000, totalMs: null },
    });
    expect(JSON.stringify(metadata)).not.toContain(secretBody);
  });
  it("logs only safe final diagnostics", () => {
    const errorOutput: unknown[][] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errorOutput.push(args);
    });
    const secretBody = "raw provider body api_key=secret-value prompt=private";
    const diagnostics = logDesignGenerationFailure(
      new DesignGenerationError(
        "design_architecture",
        new ApiError("provider request failed", 502, secretBody),
      ),
    );

    expect(diagnostics).toMatchObject({
      task: "design_architecture",
      category: "PROVIDER_5XX",
      statusCode: 502,
    });
    expect(JSON.stringify(errorOutput)).toContain("category=PROVIDER_5XX");
    expect(JSON.stringify(errorOutput)).not.toContain(secretBody);
    errorSpy.mockRestore();
  });
});

it("maps timeout diagnostics to the user-safe design message", () => {
  const metadata = buildPackageFailureMetadata(
    new DesignGenerationError(
      "design_architecture",
      Object.assign(new Error("AI request timed out after 120000ms"), {
        name: "TimeoutError",
        timeoutMs: 120_000,
      }),
    ),
    "DESIGN_ARCHITECTURE",
    {},
  );

  expect(metadata).toMatchObject({
    stage: "DESIGN_ARCHITECTURE",
    task: "design_architecture",
    category: "TIMEOUT",
    timeoutMs: 120_000,
  });
});
