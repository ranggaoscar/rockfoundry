import { expect, test } from "@playwright/test";

test.describe("Agentic job-search conversation", () => {
  test("keeps canonical question identity and routes natural research through ToolRegistry", async ({
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

    const initial = await page.request.get(page.url());
    expect(initial.ok()).toBeTruthy();
    const renderedQuestion = page.locator("[data-question-id]").first();
    const renderedId = await renderedQuestion.getAttribute("data-question-id");
    expect(renderedId).toBeTruthy();

    const projectId = page.url().split("/").pop()!;
    const projectBefore = await page.request.get(`/api/projects/${projectId}`);
    const beforePayload = await projectBefore.json();
    expect(
      beforePayload.project.canonicalState.discovery.activeQuestionId,
    ).toBe(renderedId);

    await page
      .locator("#project-composer")
      .fill(
        "Cari dulu contoh bagaimana platform besar memisahkan profil perusahaan dan kandidat.",
      );
    const conversationResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/projects/${projectId}/conversation`) &&
        response.request().method() === "POST",
    );
    await page.locator("#project-composer").press("Enter");
    const response = await conversationResponse;
    expect(response.status()).toBe(200);
    const conversation = await response.json();
    expect(conversation.intent).toBe("RESEARCH_REQUEST");
    expect(conversation.activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "CALL_TOOL",
          toolName: "web_search",
        }),
      ]),
    );

    const after = await page.request.get(`/api/projects/${projectId}`);
    const payload = await after.json();
    expect(payload.project.canonicalState.decisions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          decision: expect.stringMatching(/Cari dulu contoh/i),
        }),
      ]),
    );
    expect(payload.project.canonicalState.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "RESEARCH", untrusted: true }),
      ]),
    );

    await page.getByRole("button", { name: "Product Map" }).click();
    await expect(page.getByText("RESEARCH").first()).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: /Close/i }).click();
    await page.getByRole("button", { name: /Handoff/i }).click();
    await expect(page.getByText("BRD").first()).toBeVisible();
    await expect(page.getByText("PRD").first()).toBeVisible();
    await expect(page.getByText("ERD").first()).toBeVisible();
  });
});
