import { expect, test } from "@playwright/test";

test.describe("Decision Debt discovery", () => {
  test("asks a contextual question, records two answer styles, and survives reload", async ({
    page,
  }) => {
    const idea =
      "Gua mau bikin CRM untuk 5 brand marmer. Setiap brand punya sales sendiri, tapi owner harus bisa lihat semuanya. Customer bisa datang dari WhatsApp, Instagram, dan website. Gua pengen ada follow-up dan quotation juga.";

    await page.goto("/");
    await page.locator("#idea-composer").fill(idea);
    await page.getByRole("button", { name: "Start project" }).click();
    await expect(page).toHaveURL(/\/project\//, { timeout: 30_000 });
    await expect(page.getByText("5-Brand Marble CRM").first()).toBeVisible({
      timeout: 15_000,
    });

    await expect(
      page.getByText(
        /customer yang sama masuk lewat dua brand|same customer contacts two brands/i,
      ),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/I have the starting idea/i)).toHaveCount(0);

    await page
      .getByRole("button", { name: /Satu customer lintas brand/i })
      .click();

    await expect(
      page.getByRole("button", {
        name: /Sales per brand, owner lihat semua|Brand-scoped sales, owner sees all/i,
      }),
    ).toBeVisible({ timeout: 20_000 });

    await page
      .locator("#project-composer")
      .fill("Sales per brand, owner melihat semuanya.");
    await page.locator("#project-composer").press("Enter");

    await expect(
      page.getByText(
        /Lead bisa datang dari WhatsApp|Leads can arrive from WhatsApp/i,
      ),
    ).toBeVisible({ timeout: 20_000 });

    const projectUrl = page.url();
    const projectId = projectUrl.split("/").pop();
    const reopened = await page.request.get(`/api/projects/${projectId}`);
    expect(reopened.ok()).toBeTruthy();
    const payload = await reopened.json();
    expect(payload.project.canonicalState.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topic: "customer_identity",
          decision: "company_wide",
        }),
        expect.objectContaining({
          topic: "sales_visibility",
          decision: "owner_all_sales_brand_scoped",
        }),
      ]),
    );
    expect(
      payload.project.canonicalState.discovery.importantDecisionsRemaining,
    ).toBe(3);

    await page.reload();
    await expect(
      page
        .getByText(/Satu customer lintas brand|One customer across brands/i)
        .first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(
        /Lead bisa datang dari WhatsApp|Leads can arrive from WhatsApp/i,
      ),
    ).toBeVisible();
    await expect(
      page.getByText(/high-risk decisions? still open|Debt/i),
    ).toBeVisible();

    await page.getByRole("button", { name: "Rename project" }).click();
    await page.locator("#project-name").fill("Marble CRM discovery");
    await page.locator("#project-name").press("Enter");
    await expect(
      page.getByRole("button", { name: "Rename project" }),
    ).toContainText("Marble CRM discovery");
    await page.reload();
    await expect(page.getByText("Marble CRM discovery").first()).toBeVisible();
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
