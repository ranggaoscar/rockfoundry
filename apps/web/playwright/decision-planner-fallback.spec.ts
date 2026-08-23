import { expect, test } from "@playwright/test";

test.skip(
  process.env.PLAYWRIGHT_PLANNER_FAILURE !== "true",
  "Planner-failure coverage runs against the fake-compatible provider mode.",
);

test.describe("decision recording survives planner failure", () => {
  test("persists valid canonical answers and continues deterministically", async ({
    request,
  }) => {
    const created = await request.post("/api/projects", {
      data: {
        name: "Planner fallback CRM",
        description:
          "Build a CRM for five brands with sales users, owner visibility, leads, follow-up, and quotations.",
      },
    });
    expect(created.status()).toBe(201);
    const { project } = await created.json();
    const projectId = project.id as string;

    const initialState = project.canonicalState;
    const initialVersion = project.version as number;
    const firstQuestions = await request.get(
      `/api/projects/${projectId}/questions`,
    );
    expect(firstQuestions.status()).toBe(200);
    const firstQuestion = (await firstQuestions.json()).questions[0];
    expect(firstQuestion.id).toBeTruthy();
    expect(firstQuestion.options?.[0]?.id).toBeTruthy();

    const firstAnswer = await request.post(
      `/api/projects/${projectId}/questions`,
      {
        data: {
          questionId: firstQuestion.id,
          answer: firstQuestion.options[0].id,
        },
      },
    );
    expect(firstAnswer.status()).toBe(200);
    const firstPayload = await firstAnswer.json();
    expect(firstPayload.decision).toEqual(
      expect.objectContaining({ topic: firstQuestion.topic }),
    );
    expect(firstPayload.question).toEqual(
      expect.objectContaining({ id: expect.any(String) }),
    );
    expect(firstPayload.version).toBeGreaterThan(initialVersion);

    const persistedAfterFirst = await request.get(`/api/projects/${projectId}`);
    const afterFirst = await persistedAfterFirst.json();
    const firstDecisions = afterFirst.project.canonicalState.decisions.filter(
      (decision: { topic: string }) => decision.topic === firstQuestion.topic,
    );
    expect(firstDecisions).toHaveLength(1);
    expect(afterFirst.project.canonicalState.discovery.activeQuestionId).toBe(
      firstPayload.question.id,
    );

    const secondAnswer = await request.post(
      `/api/projects/${projectId}/questions`,
      {
        data: {
          questionId: firstPayload.question.id,
          answer: firstPayload.question.options[0].id,
        },
      },
    );
    expect(secondAnswer.status()).toBe(200);
    const secondPayload = await secondAnswer.json();
    expect(secondPayload.version).toBeGreaterThan(firstPayload.version);

    const persistedAfterSecond = await request.get(
      `/api/projects/${projectId}`,
    );
    const afterSecond = await persistedAfterSecond.json();
    expect(afterSecond.project.canonicalState.decisions).toHaveLength(2);
    expect(afterSecond.project.canonicalState.rawIdea).toBe(
      initialState.rawIdea,
    );
  });
});
