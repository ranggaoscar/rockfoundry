import { expect, test } from "@playwright/test";

test.describe("V2 Conversation Agent product flow", () => {
  test("automatically answers the first idea once and reuses it after refresh", async ({
    page,
  }) => {
    const idea = "Gua mau bikin aplikasi sederhana buat catat uang masuk keluar.";
    await page.goto("/");
    await page.locator("#idea-composer").fill(idea);
    await page.getByRole("button", { name: /Mulai|Start/i }).click();
    await expect(page).toHaveURL(/\/project\//, { timeout: 30_000 });
    await expect(page.getByText(idea)).toBeVisible();
    await expect(
      page
        .locator(".rf-message-agent")
        .filter({ hasText: /RockFoundry|transaksi|kas|uang/i })
        .last(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".rf-message-agent")).toHaveCount(1);

    await page.reload();
    await expect(
      page
        .locator(".rf-message-agent")
        .filter({ hasText: /transaksi|kas|uang/i })
        .last(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".rf-message-agent")).toHaveCount(1);
  });

  test("first-turn API persists one Conversation Agent response and exposes no QuestionEngine", async ({
    request,
  }) => {
    const idea = "Gua mau bikin aplikasi sederhana buat catat uang masuk keluar.";
    const created = await request.post("/api/projects", {
      data: { description: idea },
    });
    expect(created.status()).toBe(201);
    const project = (await created.json()).project as { id: string };

    const before = await request.get(`/api/projects/${project.id}`);
    expect((await before.json()).messages).toHaveLength(1);

    const first = await request.post(`/api/projects/${project.id}/extract`, {
      data: { rawIdea: idea },
    });
    expect(first.status()).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.discoveryPath).toBe("conversation_agent_v2");
    expect(firstBody.providerCalls).toBe(1);
    expect(firstBody.question).toBeNull();
    expect(firstBody.message).toMatch(/transaksi|kas|uang/i);

    const after = await request.get(`/api/projects/${project.id}`);
    const messages = (await after.json()).messages as Array<{
      role: string;
      text: string;
    }>;
    expect(messages.filter((message) => message.role === "assistant")).toHaveLength(1);
    expect(messages.find((message) => message.role === "assistant")?.text).toBe(
      firstBody.message,
    );

    const repeated = await request.post(`/api/projects/${project.id}/extract`, {
      data: { rawIdea: idea },
    });
    expect(repeated.status()).toBe(200);
    expect(await repeated.json()).toMatchObject({
      status: "COMPLETED",
      reused: true,
      providerCalls: 0,
    });
    const reopened = await request.get(`/api/projects/${project.id}`);
    expect(
      (await reopened.json()).messages.filter(
        (message: { role: string }) => message.role === "assistant",
      ),
    ).toHaveLength(1);
  });

  test("takes a finance idea through natural chat, draft spec, design, and handoff", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("#idea-composer").fill(
      "Gua mau bikin aplikasi sederhana buat catat uang masuk keluar.",
    );
    await page.getByRole("button", { name: /Mulai|Start/i }).click();
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
    await expect(page.getByText("PRODUCT_SPEC.md")).toBeVisible();
    await expect(page.getByText("AGENT_HANDOFF.md")).toBeVisible();
  });
});
