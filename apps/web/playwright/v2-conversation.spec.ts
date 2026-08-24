import { expect, test } from "@playwright/test";

test.describe("V2 Conversation Agent product flow", () => {
  test("takes a finance idea through natural chat, draft spec, design, and handoff", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("#idea-composer").fill(
      "Gua mau bikin aplikasi sederhana buat catat uang masuk keluar.",
    );
    await page.getByRole("button", { name: /Mulai discovery|Start discovery/i }).click();
    await expect(page).toHaveURL(/\/project\//, { timeout: 30_000 });
    await expect(page.locator("#project-composer")).toBeVisible();
    await expect(page.locator(".rf-option")).toHaveCount(0);

    await page.locator("#project-composer").fill(
      "Buat usaha kecil. Kayak warung. Yang make owner sendiri.",
    );
    const conversation = page.waitForResponse(
      (response) =>
        response.url().includes("/conversation") &&
        response.request().method() === "POST",
    );
    await page.locator("#project-composer").press("Enter");
    const conversationResponse = await conversation;
    expect(conversationResponse.status()).toBe(200);
    const conversationBody = await conversationResponse.json();
    expect(conversationBody.question).toBeNull();
    expect(conversationBody.message).toMatch(/owner|transaksi|kas/i);
    await expect(page.locator(".rf-option")).toHaveCount(0);

    await page.getByRole("button", { name: "Spec", exact: true }).first().click();
    await expect(page.getByRole("complementary", { name: "Product workbench" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Product Overview" })).toBeVisible();
    await page.getByRole("button", { name: "Generate Handoff" }).click();
    await expect(page.getByText("Draft Spec sudah dibuat.")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Close workbench" }).click();
    await page.getByRole("button", { name: "Design", exact: true }).first().click();
    await expect(page.getByRole("complementary", { name: "Product workbench" })).toBeVisible();
    const prototypeButton = page.getByRole("button", {
      name: /Buat prototype dengan AI|Generate Prototype with AI/i,
    });
    await expect(prototypeButton).toBeEnabled({ timeout: 15_000 });
    await prototypeButton.click();
    await expect(page.locator('iframe[title="Product prototype"]')).toBeVisible({
      timeout: 30_000,
    });

    await page.locator("#design-composer").fill("Bikin alur pencatatan lebih ringkas.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText(/v2 ·/i)).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Handoff", exact: true }).click();
    await expect(page.getByText("BRD.md")).toBeVisible();
    await expect(page.getByText("design/DESIGN_SPEC.json")).toBeVisible();
  });
});
