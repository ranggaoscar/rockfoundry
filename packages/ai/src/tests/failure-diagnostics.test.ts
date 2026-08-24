import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, OpenAICompatibleGateway } from "../gateway";
import {
  classifyDesignFailure,
  formatDesignFailureDiagnostics,
  toPackageFailureMetadata,
} from "../failure";

describe("safe design failure diagnostics", () => {
  it("classifies aborts and preserves the available timeout", () => {
    const result = classifyDesignFailure(
      Object.assign(new DOMException("aborted", "AbortError"), {
        timeoutMs: 120_000,
      }),
      { task: "design_architecture" },
    );
    expect(result).toMatchObject({
      task: "design_architecture",
      category: "TIMEOUT",
      timeoutMs: 120_000,
    });
  });

  it("classifies provider 4xx and 5xx without exposing the response body", () => {
    const secretBody = "api_key=secret-value prompt=private idea=hidden";
    const client = classifyDesignFailure(
      new ApiError("provider request failed", 400, secretBody),
      { task: "design_architecture" },
    );
    const server = classifyDesignFailure(
      new ApiError("provider request failed", 502, secretBody),
      { task: "prototype_generation" },
    );
    expect(client).toMatchObject({ category: "PROVIDER_4XX", statusCode: 400 });
    expect(server).toMatchObject({ category: "PROVIDER_5XX", statusCode: 502 });
    expect(JSON.stringify(client)).not.toContain(secretBody);
    expect(formatDesignFailureDiagnostics(server)).not.toContain(secretBody);
  });

  it("classifies JSON, schema, empty, and unknown failures", () => {
    const schema = z.object({ required: z.string() }).safeParse({});
    if (schema.success) throw new Error("Expected schema fixture to fail");

    expect(
      classifyDesignFailure(new Error("Failed to parse JSON response from AI provider"), {
        task: "prototype_generation",
      }).category,
    ).toBe("JSON_PARSE");
    expect(
      classifyDesignFailure(schema.error, { task: "quality_review" }).category,
    ).toBe("SCHEMA_VALIDATION");
    expect(
      classifyDesignFailure(new Error("No content returned from AI provider"), {
        task: "prototype_generation",
      }).category,
    ).toBe("EMPTY_RESPONSE");
    expect(
      classifyDesignFailure(new Error("unexpected provider failure"), {
        task: "prototype_repair",
      }).category,
    ).toBe("UNKNOWN");
    expect(classifyDesignFailure(schema.error, { task: "quality_review" }).schemaIssues).toEqual([
      { path: "required", code: "invalid_type" },
    ]);
  });

  it("converts diagnostics into safe package metadata", () => {
    const failure = classifyDesignFailure(new ApiError("private body", 502, "raw secret"), {
      task: "design_architecture",
    });
    expect(toPackageFailureMetadata(failure, "PROTOTYPE_GENERATION")).toEqual({
      stage: "DESIGN_ARCHITECTURE",
      task: "design_architecture",
      category: "PROVIDER_5XX",
      statusCode: 502,
    });
    expect(JSON.stringify(toPackageFailureMetadata(failure, "PROTOTYPE_GENERATION"))).not.toContain("raw secret");
  });

  it("formats only safe retry fields", () => {
    expect(
      formatDesignFailureDiagnostics(
        classifyDesignFailure(new Error("AI request timed out after 120000ms"), {
          task: "design_architecture",
          attempt: 1,
          maxAttempts: 2,
        }),
      ),
    ).toBe(
      "task=design_architecture attempt=1/2 category=TIMEOUT timeoutMs=120000",
    );
  });

  it("logs structured retry cause without logging raw provider content", async () => {
    vi.useFakeTimers();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const secretBody = "raw provider body api_key=secret-value";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        text: async () => secretBody,
      })),
    );
    const gateway = new OpenAICompatibleGateway(
      "https://provider.example/v1",
      "test-key",
      "selected-model",
    );
    const promise = gateway.complete({
      taskType: "design_architecture",
      messages: [{ role: "user", content: "private prompt" }],
      responseFormat: "json",
      maxRetries: 1,
    });
    const rejection = expect(promise).rejects.toBeInstanceOf(ApiError);
    await vi.runAllTimersAsync();
    await rejection;

    const line = warning.mock.calls[0]?.[0];
    expect(line).toContain("task=design_architecture");
    expect(line).toContain("attempt=1/2");
    expect(line).toContain("category=PROVIDER_5XX");
    expect(line).toContain("status=502");
    expect(line).toContain("retryInMs=1000");
    expect(line).not.toContain(secretBody);
    expect(line).not.toContain("private prompt");
    warning.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
