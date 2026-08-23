import { expect, test } from "@playwright/test";
import type { Question } from "@rockfoundry/core";

test.describe("free-form active discovery answers", () => {
  test("routes an explicit active free-form answer through canonical decision recording", async ({
    request,
  }) => {
    const created = await request.post("/api/projects", {
      data: {
        name: "Warehouse quantity",
        description:
          "Build an inventory workspace for marble slabs across warehouses with stock transfers and quantity reporting.",
      },
    });
    expect(created.status()).toBe(201);
    const { project } = await created.json();
    const projectId = project.id as string;

    let activeQuestion: Question | null = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const questions = await request.get(
        `/api/projects/${projectId}/questions`,
      );
      expect(questions.status(), await questions.text()).toBe(200);
      activeQuestion = (await questions.json()).questions[0] as Question;
      expect(activeQuestion).toBeTruthy();
      if (activeQuestion.answerType === "FREE_TEXT") break;

      const optionId = activeQuestion.options?.[0]?.id;
      expect(optionId).toBeTruthy();
      const answered = await request.post(
        `/api/projects/${projectId}/questions`,
        {
          data: {
            questionId: activeQuestion.id,
            answer: optionId,
          },
        },
      );
      expect(answered.status()).toBe(200);
    }

    if (!activeQuestion)
      throw new Error("Expected an active free-form question.");
    expect(activeQuestion.answerType).toBe("FREE_TEXT");
    const before = await request.get(`/api/projects/${projectId}`);
    const beforeProject = await before.json();

    const routed = await request.post(
      `/api/projects/${projectId}/conversation`,
      {
        data: {
          explicitQuestionId: activeQuestion.id,
          text: "4 warehouses",
        },
      },
    );
    expect(routed.status()).toBe(200);
    const handoff = await routed.json();
    expect(handoff).toEqual(
      expect.objectContaining({
        intent: "ACTIVE_DECISION_ANSWER",
        answer: "4 warehouses",
        questionId: activeQuestion.id,
        handoff: `/api/projects/${projectId}/questions`,
      }),
    );

    const answered = await request.post(handoff.handoff, {
      data: { questionId: handoff.questionId, answer: handoff.answer },
    });
    expect(answered.status()).toBe(200);
    const recorded = await answered.json();
    expect(recorded.version).toBeGreaterThan(beforeProject.project.version);

    const after = await request.get(`/api/projects/${projectId}`);
    const afterProject = await after.json();
    expect(afterProject.project.canonicalState.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ topic: activeQuestion.topic }),
      ]),
    );
    expect(
      afterProject.project.canonicalState.discovery.activeQuestionId,
    ).not.toBe(activeQuestion.id);
  });

  test("keeps an explicit option answer on the active decision path", async ({
    request,
  }) => {
    const created = await request.post("/api/projects", {
      data: { name: "Option routing", description: "Build a small CRM." },
    });
    expect(created.status()).toBe(201);
    const { project } = await created.json();
    const questions = await request.get(
      `/api/projects/${project.id}/questions`,
    );
    expect(questions.status()).toBe(200);
    const active = (await questions.json()).questions[0];
    expect(active.options[0].id).toBeTruthy();

    const response = await request.post(
      `/api/projects/${project.id}/conversation`,
      {
        data: {
          explicitQuestionId: active.id,
          explicitOptionId: active.options[0].id,
          text: active.options[0].label,
        },
      },
    );
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        intent: "ACTIVE_DECISION_ANSWER",
        answer: active.options[0].id,
        questionId: active.id,
      }),
    );
  });

  test("keeps an unsolicited message as new product context", async ({
    request,
  }) => {
    const created = await request.post("/api/projects", {
      data: { name: "Context routing", description: "Build a small CRM." },
    });
    const { project } = await created.json();
    const response = await request.post(
      `/api/projects/${project.id}/conversation`,
      {
        data: { text: "It also needs an audit log." },
      },
    );
    expect(response.status()).toBe(200);
    expect((await response.json()).intent).toBe("NEW_PRODUCT_CONTEXT");
  });

  test("rejects an explicit stale question id safely", async ({ request }) => {
    const created = await request.post("/api/projects", {
      data: { name: "Stale routing", description: "Build a small CRM." },
    });
    const { project } = await created.json();
    const response = await request.post(
      `/api/projects/${project.id}/conversation`,
      {
        data: {
          explicitQuestionId: "stale-question-id",
          text: "4 warehouses",
        },
      },
    );
    expect(response.status()).toBe(409);
  });
});
