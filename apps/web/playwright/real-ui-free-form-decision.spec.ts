import { expect, test, type APIRequestContext } from "@playwright/test";
import type { Question } from "@rockfoundry/core";

async function createInventoryProject(request: APIRequestContext) {
  const created = await request.post("/api/projects", {
    data: {
      name: "Real UI warehouse count",
      description:
        "Build an inventory workspace for marble slabs across warehouses with stock transfers and quantity reporting.",
    },
  });
  expect(created.status()).toBe(201);
  return (await created.json()).project as { id: string; version: number };
}

async function reachFreeFormQuestion(
  request: APIRequestContext,
  projectId: string,
) {
  let active: Question | null = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await request.get(`/api/projects/${projectId}/questions`);
    expect(response.status()).toBe(200);
    active = (await response.json()).questions[0] as Question;
    if (active.answerType === "FREE_TEXT") return active;
    const optionId = active.options?.[0]?.id;
    expect(optionId).toBeTruthy();
    const answered = await request.post(
      `/api/projects/${projectId}/questions`,
      {
        data: { questionId: active.id, answer: optionId },
      },
    );
    expect(answered.status()).toBe(200);
  }
  throw new Error("Expected a free-form active question.");
}

test.describe("real browser free-form discovery answer", () => {
  test("composer targets and records the active free-form question", async ({
    page,
  }) => {
    const project = await createInventoryProject(page.request);
    const active = await reachFreeFormQuestion(page.request, project.id);
    const before = await page.request.get(`/api/projects/${project.id}`);
    const beforeProject = await before.json();

    await page.goto(`/project/${project.id}`);
    await expect(page.getByText(active.text)).toBeVisible({ timeout: 20_000 });

    const conversationRequest = page.waitForRequest(
      (request) =>
        request.url().includes(`/api/projects/${project.id}/conversation`) &&
        request.method() === "POST",
    );
    const questionsResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/projects/${project.id}/questions`) &&
        response.request().method() === "POST",
    );
    await page.locator("#project-composer").fill("4 warehouses");
    await page.locator("#project-composer").press("Enter");

    const composerRequest = await conversationRequest;
    expect(composerRequest.postDataJSON()).toEqual({
      text: "4 warehouses",
      explicitQuestionId: active.id,
    });
    const decisionResponse = await questionsResponse;
    expect(decisionResponse.status()).toBe(200);
    expect(await decisionResponse.json()).toEqual(
      expect.objectContaining({
        decision: expect.objectContaining({ topic: active.topic }),
      }),
    );
    await expect(page.getByText("4 warehouses").last()).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText(/Enter a valid message|couldn't save that decision/i),
    ).toHaveCount(0);

    const after = await page.request.get(`/api/projects/${project.id}`);
    const afterProject = await after.json();
    const decisions = afterProject.project.canonicalState.decisions.filter(
      (decision: { topic: string }) => decision.topic === active.topic,
    );
    expect(decisions).toHaveLength(1);
    expect(afterProject.project.version).toBeGreaterThan(
      beforeProject.project.version,
    );
    expect(
      afterProject.project.canonicalState.discovery.activeQuestionId,
    ).not.toBe(active.id);
  });
});

test.describe("conversation optional IDs", () => {
  test("accepts null optional IDs but rejects an empty explicit ID", async ({
    request,
  }) => {
    const project = await createInventoryProject(request);
    const nullFields = await request.post(
      `/api/projects/${project.id}/conversation`,
      {
        data: {
          text: "It also needs audit history.",
          explicitQuestionId: null,
          explicitOptionId: null,
        },
      },
    );
    expect(nullFields.status()).toBe(200);
    expect((await nullFields.json()).intent).toBe("NEW_PRODUCT_CONTEXT");

    const emptyId = await request.post(
      `/api/projects/${project.id}/conversation`,
      {
        data: { text: "hello", explicitQuestionId: "" },
      },
    );
    expect(emptyId.status()).toBe(400);
  });
});
