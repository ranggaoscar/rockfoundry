import { expect, test } from "@playwright/test";

test.describe("Package CTA dead-end regression", () => {
  test("shows the package CTA after the last decision and exposes handoff without a prototype", async ({
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

    const packageButton = page.getByRole("button", {
      name: /Buat paket produk|Build product package/i,
    });
    let finalDecision: { question: unknown; canBuildPackage: boolean } | null =
      null;

    for (let index = 0; index < 20; index += 1) {
      const option = page.locator(".rf-option").first();
      if (await option.isVisible({ timeout: 20_000 }).catch(() => false)) {
        const responsePromise = page.waitForResponse(
          (response) =>
            response.url().includes("/questions") &&
            response.request().method() === "POST",
        );
        await option.click();
        const response = await responsePromise;
        expect(response.status()).toBe(200);
        const body = await response.json();
        if (body.question === null) {
          finalDecision = body;
          break;
        }
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
      const response = await responsePromise;
      expect(response.status()).toBe(200);
      const body = await response.json();
      if (body.question === null) {
        finalDecision = body;
        break;
      }
    }

    expect(finalDecision).toMatchObject({
      question: null,
      canBuildPackage: true,
    });
    await expect(
      page.getByText(
        /No critical blockers remain\. The current decisions are enough/i,
      ),
    ).toBeVisible();
    await expect(page.getByText(/Keep describing the product/i)).toHaveCount(0);
    await expect(packageButton).toBeVisible({ timeout: 20_000 });

    await packageButton.click();
    await expect(
      page.getByRole("region", { name: "Package build status" }),
    ).toBeVisible({ timeout: 5_000 });

    const projectId = page.url().split("/").pop()!;
    await expect
      .poll(
        async () =>
          (
            await (
              await page.request.get(`/api/projects/${projectId}/package`)
            ).json()
          ).job?.status,
        { timeout: 30_000 },
      )
      .toBe("COMPLETED");

    await expect(
      page.getByText("PAKET PRODUK SIAP", { exact: true }),
    ).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("button", { name: "Download Handoff", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Lihat Product Map", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Buat prototype dengan AI",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator('iframe[title="Product prototype"]')).toHaveCount(
      0,
    );
  });
});
