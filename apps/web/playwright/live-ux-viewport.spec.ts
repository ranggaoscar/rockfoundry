import { expect, test } from "@playwright/test";

const idea = "Gua mau bikin aplikasi sederhana buat catat uang masuk keluar.";

test.describe("V2 live UX viewport regression", () => {
  test("keeps first-turn chat usable at desktop width", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: /^Start$|^Mulai$/i })).toBeVisible();
    await expect(page.getByText(/Mulai discovery|Start discovery/i)).toHaveCount(0);
    await page.locator("#idea-composer").fill(idea);
    await page.getByRole("button", { name: /Mulai|Start/i }).click();
    await expect(page).toHaveURL(/\/project\//, { timeout: 30_000 });
    await expect(page.locator(".rf-message-agent").last()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Decision Debt:/i)).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("lang", /.+/);
    await page.screenshot({
      path: "test-results/v2-live-ux-1366x768.png",
      fullPage: true,
    });
  });

  test("keeps first-turn chat usable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.locator("#idea-composer").fill(idea);
    await page.getByRole("button", { name: /Mulai|Start/i }).click();
    await expect(page).toHaveURL(/\/project\//, { timeout: 30_000 });
    await expect(page.locator(".rf-message-agent").last()).toBeVisible({
      timeout: 30_000,
    });
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    await page.screenshot({
      path: "test-results/v2-live-ux-390x844.png",
      fullPage: true,
    });
  });
});
