import { expect, test } from "@playwright/test";

test.describe("Design Studio", () => {
  test("generates a live prototype, revises it, and keeps product decisions separate", async ({
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
    await page.getByRole("button", { name: "Design" }).click();
    await expect(page.getByText(/Design Readiness/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Generate Product Design" }),
    ).toBeEnabled({ timeout: 15_000 });
    await page.getByRole("button", { name: "Generate Product Design" }).click();
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
