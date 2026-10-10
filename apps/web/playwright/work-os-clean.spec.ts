import { test, expect } from "@playwright/test";

test("RF-002G clean Today, separate legacy access, operational creation and refresh", async ({
  page,
  request,
}) => {
  const legacyResponse = await request.post("/api/projects", {
    data: {
      name: "Legacy pilot prototype",
      description: "Historical product experiment",
    },
  });
  expect(legacyResponse.status()).toBe(201);
  const { project: legacy } = await legacyResponse.json();
  const empty = await (await request.get("/api/work")).json();
  expect(empty.projects).toEqual([]);
  expect(empty.runs).toEqual([]);
  expect(empty.activity).toEqual([]);
  expect(
    empty.executors.some((item: { id: string }) => item.id === "hermes"),
  ).toBe(true);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/today");
    await expect(
      page.getByRole("heading", { name: "Your Work OS starts here" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Create Project", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: "Create Task · choose a project first",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator("article.work-task")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Your Work OS starts here" }),
    ).toBeVisible();
  }
  await page
    .getByRole("link", { name: "Legacy Projects · Product Studio" })
    .click();
  await expect(
    page.getByRole("button", { name: "Open projects", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open projects", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Legacy pilot prototype/ }),
  ).toBeVisible();
  await page.goto(`/project/${legacy.id}`);
  await expect(
    page.getByRole("textbox", { name: "Message RockFoundry" }),
  ).toBeVisible();
  const preserved = await (
    await request.get(`/api/projects/${legacy.id}`)
  ).json();
  expect(JSON.stringify(preserved)).toContain("Historical product experiment");
  await page.goto("/projects");
  page.once("dialog", (dialog) => dialog.accept("Real operational work"));
  await page.getByRole("button", { name: "New", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Real operational work", exact: true }),
  ).toBeVisible();
  const form = page.locator("form.work-create-task");
  await form.getByLabel("Task title", { exact: true }).fill("Owner daily task");
  await form
    .getByLabel("Acceptance criteria", { exact: true })
    .fill("Owner verifies output");
  await form.getByRole("button", { name: "Add task", exact: true }).click();
  const task = page
    .locator("article.work-task")
    .filter({ hasText: "Owner daily task" });
  await expect(task).toBeVisible();
  await task.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = page
    .locator("form.work-create-task")
    .filter({
      has: page.getByRole("heading", { name: "Edit task", exact: true }),
    });
  await edit
    .getByLabel("Task title", { exact: true })
    .fill("Updated operational task");
  await edit.getByRole("button", { name: "Save task", exact: true }).click();
  await expect(
    page
      .locator("article.work-task")
      .filter({ hasText: "Updated operational task" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .locator("article.work-task")
      .filter({ hasText: "Updated operational task" }),
  ).toBeVisible();
  const snapshot = await (await request.get("/api/work")).json();
  expect(snapshot.projects).toHaveLength(1);
  expect(snapshot.projects[0].name).toBe("Real operational work");
  expect(snapshot.projects[0].tasks[0].title).toBe("Updated operational task");
  expect(
    snapshot.projects.some((item: { id: string }) => item.id === legacy.id),
  ).toBe(false);
  expect((await request.get(`/api/projects/${legacy.id}`)).status()).toBe(200);
});
