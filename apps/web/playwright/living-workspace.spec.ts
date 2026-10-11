import { test, expect } from "@playwright/test";

test("RF-003 mobile idea → persisted conversation → reviewed task → Today", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await request.post("/api/work", {
    data: { action: "create_project", name: "Magrade daily workspace" },
  });
  expect(response.ok()).toBe(true);
  const { project } = await response.json();
  const thought = "Gua ingin improve visualisasi kitchen Magrade minggu depan.";
  await page.goto("/today");
  await page
    .getByRole("textbox", { name: "Quick Capture", exact: true })
    .fill(thought);
  await page.getByRole("button", { name: "Capture idea", exact: true }).click();
  await expect
    .poll(async () =>
      (await (await request.get("/api/living")).json()).ideas.some(
        (idea: { originalText: string }) => idea.originalText === thought,
      ),
    )
    .toBe(true);
  await page.reload();
  await page.goto("/inbox");
  await expect(page.getByText(thought, { exact: true })).toBeVisible();
  const before = await (await request.get("/api/work")).json();
  expect(
    before.projects.find((item: { id: string }) => item.id === project.id)
      .tasks,
  ).toHaveLength(0);
  await page.goto("/ask");
  await page
    .getByRole("combobox", { name: "Conversation executor", exact: true })
    .selectOption("mock");
  await page
    .getByRole("textbox", { name: "Message Rock", exact: true })
    .fill(
      "Diskusikan ide Magrade dari Inbox dan usulkan satu task untuk hari ini.",
    );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const proposal = page.locator("article.living-proposal").first();
  await expect(proposal).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(proposal).toBeVisible();
  const unapproved = await (await request.get("/api/work")).json();
  expect(
    unapproved.projects.find((item: { id: string }) => item.id === project.id)
      .tasks,
  ).toHaveLength(0);
  const proposedState = await (await request.get("/api/living")).json();
  const pending = proposedState.turns.flatMap(
    (turn: { proposals: Array<{ payload: Record<string, unknown> }> }) =>
      turn.proposals,
  )[0];
  await proposal.getByRole("textbox", { name: /Edit proposal/ }).fill(
    JSON.stringify({
      ...pending.payload,
      plannedDate: new Date().toISOString(),
    }),
  );
  await proposal.getByRole("button", { name: "Approve", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/work")).json()).projects.find(
          (item: { id: string }) => item.id === project.id,
        ).tasks.length,
    )
    .toBe(1);
  const approved = await (await request.get("/api/work")).json();
  const task = approved.projects.find(
    (item: { id: string }) => item.id === project.id,
  ).tasks[0];
  await page.goto("/today");
  await expect(
    page.locator("article.work-task").filter({ hasText: task.title }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/ask");
  await expect(
    page
      .locator(".living-message-user")
      .getByText(
        "Diskusikan ide Magrade dari Inbox dan usulkan satu task untuk hari ini.",
        { exact: true },
      ),
  ).toBeVisible();
  const persisted = await (await request.get("/api/living")).json();
  expect(
    persisted.messages.some(
      (item: { role: string }) => item.role === "ASSISTANT",
    ),
  ).toBe(true);
  expect(
    persisted.turns.some((turn: { proposals: Array<{ status: string }> }) =>
      turn.proposals.some((item) => item.status === "APPROVED"),
    ),
  ).toBe(true);
  expect(
    persisted.ideas.find(
      (item: { originalText: string }) => item.originalText === thought,
    ).originalText,
  ).toBe(thought);
  await page.screenshot({
    path: "C:/Users/rangg/AppData/Local/hermes/cache/scratch/rf003-ask-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/today");
  await expect(
    page.getByRole("textbox", { name: "Quick Capture", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "C:/Users/rangg/AppData/Local/hermes/cache/scratch/rf003-today-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("RF-003 Inbox conversion, unavailable Hermes persistence and new thread recovery", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const capture = await request.post("/api/living", {
    data: {
      action: "capture",
      requestId: crypto.randomUUID(),
      text: "Persistent conversion idea",
    },
  });
  expect(capture.ok()).toBe(true);
  const { idea } = await capture.json();
  await page.goto("/inbox");
  const card = page
    .locator("article.living-idea")
    .filter({ hasText: "Persistent conversion idea" });
  await card
    .getByRole("combobox", { name: `Convert idea ${idea.id} to` })
    .selectOption("project");
  await card
    .getByRole("textbox", { name: `Title for idea ${idea.id}` })
    .fill("Owner converted project");
  await card
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(card).toContainText("Converted to project");
  await page.reload();
  await expect(card).toContainText("Converted to project");
  await page.goto("/ask");
  await page
    .getByRole("combobox", { name: "Conversation history" })
    .selectOption("");
  await page
    .getByRole("textbox", { name: "Message Rock" })
    .fill("Persist this even when Hermes is offline");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".living-message-user")).toContainText(
    "Persist this even when Hermes is offline",
  );
  await expect(
    page.getByRole("button", { name: "Retry this turn" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".living-message-user")).toContainText(
    "Persist this even when Hermes is offline",
  );
  const saved = await (await request.get("/api/living")).json();
  expect(saved.turns.at(-1).status).toBe("BLOCKED");
  expect(
    saved.ideas.find((item: { id: string }) => item.id === idea.id)
      .originalText,
  ).toBe("Persistent conversion idea");
});
