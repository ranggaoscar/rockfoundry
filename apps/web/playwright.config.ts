import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const port = Number(process.env.PLAYWRIGHT_PORT || 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;
const publicDemo = process.env.PLAYWRIGHT_PUBLIC_DEMO === "true";
const managedProvider = process.env.PLAYWRIGHT_MANAGED_PROVIDER === "true";
// Default on for deterministic agentic E2E. This flag is consumed only by
// Playwright's spawned local server; production runtime never sets it.
const mockSearch = process.env.PLAYWRIGHT_MOCK_SEARCH !== "false";
const plannerFailure = process.env.PLAYWRIGHT_PLANNER_FAILURE === "true";
const isolatedDataDir = process.env.PLAYWRIGHT_BASE_URL
  ? undefined
  : fs.mkdtempSync(path.join(os.tmpdir(), "rockfoundry-playwright-"));
if (isolatedDataDir) process.env.PLAYWRIGHT_ISOLATED_DATA_DIR = isolatedDataDir;
type PlaywrightEnvironment = Record<string, string | undefined>;

export function resolvePlaywrightProviderEnvironment(
  env: PlaywrightEnvironment = process.env,
) {
  if (env.PLAYWRIGHT_MANAGED_PROVIDER === "true")
    return {
      AI_PROVIDER_MODE: "openai-compatible",
      OPENAI_COMPATIBLE_BASE_URL: "https://api.openai.com/v1",
      OPENAI_COMPATIBLE_API_KEY: "test-demo-key",
      OPENAI_COMPATIBLE_MODEL: "demo-test-model",
    };
  if (env.PLAYWRIGHT_PLANNER_FAILURE === "true")
    return {
      AI_PROVIDER_MODE: "openai-compatible",
      OPENAI_COMPATIBLE_BASE_URL: "http://127.0.0.1:1/v1",
      OPENAI_COMPATIBLE_API_KEY: "fake-compatible-key",
      OPENAI_COMPATIBLE_MODEL: "fake-compatible-model",
    };
  return {
    AI_PROVIDER_MODE: "mock",
    OPENAI_COMPATIBLE_BASE_URL: "",
    OPENAI_COMPATIBLE_API_KEY: "",
    OPENAI_COMPATIBLE_MODEL: "",
  };
}

export function createPlaywrightWebServer(
  env: PlaywrightEnvironment = process.env,
) {
  const port = Number(env.PLAYWRIGHT_PORT || 3100);
  const publicDemo = env.PLAYWRIGHT_PUBLIC_DEMO === "true";
  const mockSearch = env.PLAYWRIGHT_MOCK_SEARCH !== "false";
  const parentEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  delete parentEnv.ROCKFOUNDRY_DATABASE_URL;
  const dataDir = env.ROCKFOUNDRY_DATA_DIR || isolatedDataDir;
  const childEnv: Record<string, string> = {
    ...parentEnv,
    ...(dataDir ? { ROCKFOUNDRY_DATA_DIR: dataDir } : {}),
    ...(dataDir ? { ROCKFOUNDRY_EXPORTS_DIR: path.join(dataDir, "exports") } : {}),
  };
  return {
    command: `pnpm --filter @rockfoundry/db exec prisma migrate deploy && pnpm exec next dev --hostname 127.0.0.1 --port ${port}`,
    url: env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...childEnv,
      ROCKFOUNDRY_PUBLIC_DEMO: publicDemo ? "true" : "false",
      PLAYWRIGHT_MOCK_SEARCH: mockSearch ? "true" : "false",
      ...resolvePlaywrightProviderEnvironment(env),
    },
  };
}

export default defineConfig({
  testDir: "./playwright",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  globalTeardown: "./playwright/global-teardown.ts",
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : createPlaywrightWebServer(),
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
