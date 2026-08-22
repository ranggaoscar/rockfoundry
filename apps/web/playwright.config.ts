import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT || 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;
const publicDemo = process.env.PLAYWRIGHT_PUBLIC_DEMO === "true";
const managedProvider = process.env.PLAYWRIGHT_MANAGED_PROVIDER === "true";
const providerEnvironment = managedProvider
  ? "set AI_PROVIDER_MODE=openai-compatible&& set OPENAI_COMPATIBLE_BASE_URL=https://api.openai.com/v1&& set OPENAI_COMPATIBLE_API_KEY=test-demo-key&& set OPENAI_COMPATIBLE_MODEL=demo-test-model&& "
  : "set AI_PROVIDER_MODE=mock&& set OPENAI_COMPATIBLE_BASE_URL=&& set OPENAI_COMPATIBLE_API_KEY=&& set OPENAI_COMPATIBLE_MODEL=&& ";

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
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `cmd.exe /c "set ROCKFOUNDRY_PUBLIC_DEMO=${publicDemo ? "true" : "false"}&& ${providerEnvironment}pnpm exec next dev --hostname 127.0.0.1 --port ${port}"`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
