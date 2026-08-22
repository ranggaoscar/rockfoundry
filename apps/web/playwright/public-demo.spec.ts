import { expect, test } from "@playwright/test";

test.skip(
  process.env.PLAYWRIGHT_PUBLIC_DEMO !== "true",
  "Public demo coverage runs with the public-demo server environment.",
);

test.describe("public demo provider authority", () => {
  test("shows managed read-only settings and rejects provider mutation routes", async ({
    page,
    request,
  }) => {
    const status = await request.get("/api/provider");
    expect(status.ok()).toBeTruthy();
    const payload = await status.json();
    expect(payload.publicDemo).toBe(true);
    expect(payload.managed).toBe(true);
    expect(payload.configured).toBe(true);
    expect(payload.model).toBe("demo-test-model");
    expect(JSON.stringify(payload)).not.toContain("apiKey");
    expect(payload.endpoint).toBeNull();

    const save = await request.put("/api/provider", {
      data: {
        mode: "openai-compatible",
        baseUrl: "https://example.test",
        apiKey: "visitor-key",
      },
    });
    expect(save.status()).toBe(403);
    const clear = await request.delete("/api/provider");
    expect(clear.status()).toBe(403);
    const models = await request.get("/api/provider/models");
    expect(models.status()).toBe(403);
    const connection = await request.post("/api/provider/test", {
      data: { baseUrl: "https://example.test", apiKey: "visitor-key" },
    });
    expect(connection.status()).toBe(403);

    await page.goto("/");
    await expect(
      page.getByRole("button", { name: /Public demo/i }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Settings" }).click();
    const drawer = page.getByRole("dialog", { name: /AI provider/i });
    await expect(drawer.getByText("Managed by demo host")).toBeVisible();
    await expect(drawer.getByLabel("API key")).toHaveCount(0);
    await expect(
      drawer.getByRole("button", {
        name: /Save|Clear|Test connection|Discover models/i,
      }),
    ).toHaveCount(0);
  });

  test("keeps managed provider settings usable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Open projects" }).click();
    await page.getByRole("button", { name: "Settings" }).click();
    const drawer = page.getByRole("dialog", { name: /AI provider/i });
    await expect(drawer.getByText("Managed by demo host")).toBeVisible();
    await expect(
      drawer.getByText(/shared demo uses a provider/i),
    ).toBeVisible();
  });
});
