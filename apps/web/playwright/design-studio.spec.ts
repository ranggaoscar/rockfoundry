import { expect, test } from "@playwright/test";

test.describe("Design Studio", () => {
  test("generates an optional prototype after the package, revises it, and keeps product decisions separate", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .locator("#idea-composer")
      .fill("Saya mau bikin platform untuk mencari kerja.");
    await page
      .getByRole("button", { name: /Mulai discovery|Start discovery/i })
      .click();
    await expect(page).toHaveURL(/\/project\//, { timeout: 30_000 });
    const packageButton = page.getByRole("button", {
      name: /Buat paket produk|Build product package/i,
    });
    for (let index = 0; index < 20; index += 1) {
      if (await packageButton.isVisible().catch(() => false)) break;
      const option = page.locator(".rf-option").first();
      if (await option.isVisible({ timeout: 20_000 }).catch(() => false)) {
        const responsePromise = page.waitForResponse(
          (response) =>
            response.url().includes("/questions") &&
            response.request().method() === "POST",
        );
        await option.click();
        expect((await responsePromise).status()).toBe(200);
        continue;
      }

      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/conversation") &&
          response.request().method() === "POST",
      );
      await page
        .getByRole("textbox", { name: "Message RockFoundry" })
        .fill("Use the recommended operational default for this workflow.");
      await page.getByRole("button", { name: "Send message" }).click();
      expect((await responsePromise).status()).toBe(200);
    }

    await expect(packageButton).toBeVisible({ timeout: 20_000 });
    await packageButton.click();
    await expect(page.getByText(/Baseline DesignSpec/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("button", { name: /Buat prototype dengan AI|Generate Prototype with AI/i }),
    ).toBeEnabled({ timeout: 15_000 });
    await page
      .getByRole("button", { name: /Buat prototype dengan AI|Generate Prototype with AI/i })
      .click();
    await expect(page.getByText(/Job Discovery/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.locator('iframe[title="Product prototype"]'),
    ).toBeVisible();
    await page.getByRole("button", { name: "Mobile" }).click();
    await page
      .locator("#design-composer")
      .fill("Bikin dashboard employer lebih compact.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("v2 · DRAFT")).toBeVisible({ timeout: 20_000 });
    await page
      .locator("#design-composer")
      .fill("Satu perusahaan harus punya beberapa recruiter.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(/product decision/i)).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Approve Design" }).click();
    await expect(page.getByText(/APPROVED/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Handoff", exact: true }).click();
    await expect(page.getByText("BRD.md")).toBeVisible();
    await expect(page.getByText("design/DESIGN_SPEC.json")).toBeVisible();
  });
});
