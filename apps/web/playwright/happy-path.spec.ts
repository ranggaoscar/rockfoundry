import { expect, test } from "@playwright/test";

test.describe("Normal user happy path", () => {
  test("takes one rough idea to package, preview, approval, and one handoff download", async ({
    page,
  }) => {
    const idea =
      "Saya mau bikin CRM untuk 5 brand marmer. Setiap brand punya sales sendiri, owner lihat semua, lead datang dari WhatsApp Instagram dan website, ada follow-up dan quotation.";

    await page.goto("/");
    await page.locator("#idea-composer").fill(idea);
    await page
      .getByRole("button", { name: /Mulai discovery|Start discovery/i })
      .click();
    await expect(page).toHaveURL(/\/project\//, { timeout: 30_000 });

    for (let index = 0; index < 5; index += 1) {
      await expect(page.locator(".rf-option").first()).toBeVisible({
        timeout: 20_000,
      });
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/questions") &&
          response.request().method() === "POST",
      );
      await page.locator(".rf-option").first().click();
      const response = await responsePromise;
      expect(response.status()).toBe(200);
    }

    await expect(
      page.getByRole("button", { name: "Build product package" }),
    ).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Build product package" }).click();
    await expect(page.locator('iframe[title="Product prototype"]')).toBeVisible(
      {
        timeout: 30_000,
      },
    );
    await expect(page.getByText(/v1 · DRAFT/i)).toBeVisible({
      timeout: 15_000,
    });

    await page.locator("#design-composer").fill("make dashboard more compact");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("v2 · DRAFT")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Approve Design" }).click();
    await expect(
      page.getByRole("button", { name: "Download Handoff" }),
    ).toBeVisible({
      timeout: 15_000,
    });

    const projectId = page.url().split("/").pop()!;
    const download = await page.request.get(
      `/api/projects/${projectId}/export`,
    );
    expect(download.ok()).toBeTruthy();
    expect(download.headers()["content-type"]).toContain("application/zip");
    expect((await download.body()).byteLength).toBeGreaterThan(1000);
  });
});
