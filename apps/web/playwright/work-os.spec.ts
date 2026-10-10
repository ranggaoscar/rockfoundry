import { test, expect } from "@playwright/test";

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`RF-001 full persisted workflow at ${viewport.width}px`, async ({
    page,
    request,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    const name = `RF-001 ${viewport.width} ${Date.now()}`;
    await page.goto("/projects");
    await expect(
      page.getByRole("heading", { name: "Projects", exact: true }),
    ).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept(name));
    await page.getByRole("button", { name: "New", exact: true }).click();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await page.getByLabel("New goal title").fill("Daily foundation");
    await page.getByRole("button", { name: "Add goal", exact: true }).click();
    await page
      .getByLabel("New milestone title")
      .fill("First verified delivery");
    await page
      .getByRole("button", { name: "Add milestone", exact: true })
      .click();
    const form = page.locator("form.work-create-task");
    await form
      .getByLabel("Task title", { exact: true })
      .fill("Prepare a reviewable daily brief");
    await form
      .getByLabel("Acceptance criteria", { exact: true })
      .fill("Brief with evidence, reviewed by owner");
    await form
      .getByRole("combobox", { name: "Priority", exact: true })
      .selectOption("HIGH");
    await form
      .getByRole("combobox", { name: "Goal", exact: true })
      .selectOption({ label: "Daily foundation" });
    await form
      .getByRole("combobox", { name: "Milestone", exact: true })
      .selectOption({ label: "First verified delivery" });
    await form.getByRole("button", { name: "Add task", exact: true }).click();
    const task = page
      .locator("article.work-task")
      .filter({ hasText: "Prepare a reviewable daily brief" });
    await expect(task).toBeVisible();
    await task
      .getByRole("button", { name: "Execute with Agent", exact: true })
      .click();
    await expect(
      task.getByRole("button", { name: "Execute with Agent", exact: true }),
    ).toBeDisabled();
    await page.getByRole("link", { name: "Agent Runs", exact: true }).click();
    const run = page
      .locator("article.work-run")
      .filter({ hasText: "Prepare a reviewable daily brief" })
      .first();
    await expect(run.getByText("REVIEW REQUIRED", { exact: true })).toBeVisible(
      { timeout: 20000 },
    );
    await run.getByRole("button", { name: "Inspect", exact: true }).click();
    await expect(run.getByText(/MOCK EXECUTION — no real work/)).toBeVisible();
    await expect(run.getByText("Evidence (1)", { exact: true })).toBeVisible();
    const before = await (await request.get("/api/work")).json();
    const project = before.projects.find(
      (item: { name: string }) => item.name === name,
    );
    expect(project.tasks[0].status).toBe("REVIEW_REQUIRED");
    expect(project.tasks[0].goalId).toBe(project.goals[0].id);
    expect(project.tasks[0].milestoneId).toBe(project.milestones[0].id);
    await page.reload();
    await expect(
      run.getByText("REVIEW REQUIRED", { exact: true }),
    ).toBeVisible();
    page.once("dialog", (dialog) =>
      dialog.accept("Verified RF-001 development workflow"),
    );
    await run.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(run.getByText("COMPLETED", { exact: true })).toBeVisible();
    await run.getByRole("button", { name: "Inspect", exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath(`runs-${viewport.width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.goto(`/projects?project=${project.id}`);
    await expect(
      page.getByText("1 of 1 tasks complete", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("1 of 1 tasks complete", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`projects-${viewport.width}.png`),
      fullPage: true,
    });
    await expect(page.locator("body")).toHaveJSProperty(
      "scrollWidth",
      await page.locator("body").evaluate((body) => body.clientWidth),
    );
    await page.getByRole("link", { name: "Open Product Studio" }).click();
    await expect(
      page.getByRole("textbox", { name: "Message RockFoundry" }),
    ).toBeVisible();
    if (viewport.width < 1024)
      await page
        .getByRole("button", { name: "Open projects", exact: true })
        .click();
    await expect(
      page.getByRole("link", { name: "Today · Work OS" }),
    ).toBeVisible();
    expect(failures).toEqual([]);
  });
}

test("RF-001 Today uses real tasks and quick-add, editing, acceptance and deadlines persist", async ({
  page,
  request,
}) => {
  const action = async (body: Record<string, unknown>) => {
    const response = await request.post("/api/work", { data: body });
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  const { project } = await action({
    action: "create_project",
    name: `RF-001 Today ${Date.now()}`,
  });
  const today = new Date();
  const noon = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    12,
  );
  await action({
    action: "create_task",
    projectId: project.id,
    title: "Today urgent task",
    acceptanceCriteria: "Owner review",
    plannedDate: noon.toISOString(),
    priority: "URGENT",
  });
  await action({
    action: "create_task",
    projectId: project.id,
    title: "Overdue task",
    acceptanceCriteria: "Owner review",
    dueAt: new Date(noon.getTime() - 86400000).toISOString(),
  });
  await action({
    action: "create_task",
    projectId: project.id,
    title: "Upcoming task",
    acceptanceCriteria: "Owner review",
    dueAt: new Date(noon.getTime() + 86400000).toISOString(),
  });
  await page.goto(`/today?project=${project.id}`);
  await expect(
    page.locator("article.work-task").filter({ hasText: "Today urgent task" }),
  ).toBeVisible();
  await expect(
    page.locator("article.work-task").filter({ hasText: "Overdue task" }),
  ).toBeVisible();
  await expect(
    page.locator("article.work-task").filter({ hasText: "Upcoming task" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByText("Quick add task", { exact: true }).click();
  await page
    .getByLabel("Task title", { exact: true })
    .fill("Quick-added human task");
  await page
    .getByLabel("Acceptance criteria", { exact: true })
    .fill("Review note required");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.goto(`/projects?project=${project.id}`);
  const task = page
    .locator("article.work-task")
    .filter({ hasText: "Quick-added human task" });
  await task.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = page.locator("form.work-create-task").filter({
    has: page.getByRole("heading", { name: "Edit task", exact: true }),
  });
  await edit
    .getByLabel("Task title", { exact: true })
    .fill("Revised human task");
  await edit
    .getByRole("combobox", { name: "Priority", exact: true })
    .selectOption("HIGH");
  await edit.getByRole("button", { name: "Save task", exact: true }).click();
  const revised = page
    .locator("article.work-task")
    .filter({ hasText: "Revised human task" });
  page.once("dialog", (dialog) =>
    dialog.accept("Owner verified actual delivery"),
  );
  await revised.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(revised).toContainText("DONE");
  await page.reload();
  await expect(revised).toContainText("DONE");
});

test("RF-001 API rejects invalid/foreign-origin requests and does not silently fallback from Hermes", async ({
  request,
}) => {
  const created = await request.post("/api/work", {
    data: { action: "create_project", name: "RF-001 API safety" },
  });
  const { project } = await created.json();
  const taskResponse = await request.post("/api/work", {
    data: {
      action: "create_task",
      projectId: project.id,
      title: "Safety task",
      acceptanceCriteria: "Explicit review",
    },
  });
  const { task } = await taskResponse.json();
  const forbidden = await request.post("/api/work", {
    headers: { Origin: "https://untrusted.invalid" },
    data: { action: "complete_task", taskId: task.id, comment: "Bypass" },
  });
  expect(forbidden.status()).toBe(403);
  const invalid = await request.post("/api/work", {
    data: {
      action: "update_task",
      taskId: task.id,
      status: "DONE",
      workspaceId: "other",
    },
  });
  expect(invalid.status()).toBe(400);
  const unavailable = await request.post("/api/work", {
    data: {
      action: "execute",
      taskId: task.id,
      executorId: "hermes",
      requestId: crypto.randomUUID(),
    },
  });
  expect(unavailable.status()).toBe(503);
  const snapshot = await (await request.get("/api/work")).json();
  expect(
    snapshot.runs.filter((run: { taskId: string }) => run.taskId === task.id),
  ).toHaveLength(0);
});
