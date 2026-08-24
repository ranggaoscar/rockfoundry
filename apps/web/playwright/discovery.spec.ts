import { expect, test } from "@playwright/test";

test.describe("V2 conversation workspace", () => {
  test("answers CRM context naturally and survives reload without questionnaire calls", async ({
    page,
  }) => {
    const idea =
      "Gua mau bikin CRM untuk 5 brand marmer. Setiap brand punya sales sendiri, tapi owner harus bisa lihat semuanya. Customer bisa datang dari WhatsApp, Instagram, dan website. Gua pengen ada follow-up dan quotation juga.";

    await page.goto("/");
    await page.locator("#idea-composer").fill(idea);
    await page.getByRole("button", { name: /Mulai discovery|Start discovery/i }).click();
    await expect(page).toHaveURL(/\/project\//, { timeout: 30_000 });
    await expect(page.getByText(/CRM untuk 5 brand|CRM for 5 brand/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator(".rf-option")).toHaveCount(0);

    const questionRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/questions")) questionRequests.push(request.url());
    });
    await page.locator("#project-composer").fill(
      "Untuk MVP fokus ke owner dan sales, tapi jangan pakai approval dulu.",
    );
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/conversation") &&
        response.request().method() === "POST",
    );
    await page.locator("#project-composer").press("Enter");
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(payload.question).toBeNull();
    expect(payload.message).toMatch(/CRM|brand|owner|sales/i);
    expect(questionRequests).toEqual([]);

    await page.reload();
    await expect(page.getByText(/fokus ke owner dan sales|CRM|brand/i).last()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("settings opens as a drawer and never 404s", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(
      page.getByRole("dialog", { name: /AI provider|settings/i }),
    ).toBeVisible();
    await expect(page.getByText(/Current mode|Mock/i).first()).toBeVisible();
    await expect(page.getByLabel("Base URL")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Test connection" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Discover models" }),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/\/settings$/);

    await page.goto("/settings");
    await expect(page).not.toHaveURL(/\/settings$/);
    await expect(
      page.getByRole("dialog", { name: /AI provider|settings/i }),
    ).toBeVisible();
  });

  test("keeps provider settings usable on a narrow viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Open projects" }).click();
    await page.getByRole("button", { name: "Settings" }).click();
    const drawer = page.getByRole("dialog", { name: /AI provider|settings/i });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByLabel("API key")).toBeVisible();
    await expect(
      drawer.getByRole("button", { name: "Save provider" }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/provider-settings-mobile.png",
    });
  });
});
