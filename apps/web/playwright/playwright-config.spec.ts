import { expect, test } from "@playwright/test";
import {
  createPlaywrightWebServer,
  resolvePlaywrightProviderEnvironment,
} from "../playwright.config";

test.describe("Playwright webServer configuration", () => {
  test("uses a portable command and mock environment by default", () => {
    const provider = resolvePlaywrightProviderEnvironment({});
    const webServer = createPlaywrightWebServer({
      PLAYWRIGHT_PORT: "3100",
      ROCKFOUNDRY_PUBLIC_DEMO: "false",
      PLAYWRIGHT_MOCK_SEARCH: "true",
    });

    expect(provider).toMatchObject({
      AI_PROVIDER_MODE: "mock",
      OPENAI_COMPATIBLE_BASE_URL: "",
      OPENAI_COMPATIBLE_API_KEY: "",
      OPENAI_COMPATIBLE_MODEL: "",
    });
    expect(webServer.command).toBe(
      "pnpm --filter @rockfoundry/db exec prisma migrate deploy && pnpm exec next dev --hostname 127.0.0.1 --port 3100",
    );
    expect(webServer.command).not.toContain("cmd.exe");
    expect(webServer.command).not.toContain(" set ");
  });

  test("preserves managed-provider and planner-failure environments", () => {
    expect(
      resolvePlaywrightProviderEnvironment({
        PLAYWRIGHT_MANAGED_PROVIDER: "true",
      }),
    ).toMatchObject({
      AI_PROVIDER_MODE: "openai-compatible",
      OPENAI_COMPATIBLE_BASE_URL: "https://api.openai.com/v1",
      OPENAI_COMPATIBLE_API_KEY: "test-demo-key",
      OPENAI_COMPATIBLE_MODEL: "demo-test-model",
    });
    expect(
      resolvePlaywrightProviderEnvironment({
        PLAYWRIGHT_PLANNER_FAILURE: "true",
      }),
    ).toMatchObject({
      AI_PROVIDER_MODE: "openai-compatible",
      OPENAI_COMPATIBLE_BASE_URL: "http://127.0.0.1:1/v1",
      OPENAI_COMPATIBLE_API_KEY: "fake-compatible-key",
      OPENAI_COMPATIBLE_MODEL: "fake-compatible-model",
    });
  });
});
