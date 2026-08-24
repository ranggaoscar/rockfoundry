import { expect, test } from "@playwright/test";

test.describe("Normal user happy path", () => {
  test("takes one rough idea to package, optional prototype, approval, and one handoff download", async ({
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
    await expect(
      page.getByRole("region", { name: "Package build status" }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByText(/Paket produk sedang (disiapkan|dibuat)/i),
    ).toBeVisible({ timeout: 5_000 });

    const projectId = page.url().split("/").pop()!;
    await expect.poll(
      async () =>
        (await (await page.request.get(`/api/projects/${projectId}/package`)).json()).job?.status,
      { timeout: 30_000 },
    ).toBe("COMPLETED");
    await expect(page.getByText("Baseline DesignSpec", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('iframe[title="Product prototype"]')).toHaveCount(0);
    await page
      .getByRole("button", { name: /Buat prototype dengan AI|Generate Prototype with AI/i })
      .click();
    await expect(page.locator('iframe[title="Product prototype"]')).toBeVisible(
      {
        timeout: 30_000,
      },
    );
    await expect(page.getByText(/v1 · (DRAFT|IN_REVIEW)/i)).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "Approve Design" }).click();
    await expect(
      page.getByRole("button", { name: "Download Handoff" }),
    ).toBeVisible({
      timeout: 15_000,
    });

    const download = await page.request.get(
      `/api/projects/${projectId}/export`,
    );
    expect(download.ok()).toBeTruthy();
    expect(download.headers()["content-type"]).toContain("application/zip");
    expect((await download.body()).byteLength).toBeGreaterThan(1000);
  });
});
