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

  test("deduplicates concurrent normal turns by request id", async ({ request }) => {
    const created = await request.post("/api/projects", {
      data: { description: "" },
    });
    expect(created.status()).toBe(201);
    const project = (await created.json()).project as { id: string };
    const requestId = `e2e-concurrent-${Date.now()}`;
    const headers = {
      "x-conversation-request-id": requestId,
    };
    const [first, second] = await Promise.all([
      request.post(`/api/projects/${project.id}/conversation`, {
        headers,
        data: { text: "Saya ingin aplikasi catat uang masuk keluar." },
      }),
      request.post(`/api/projects/${project.id}/conversation`, {
        headers,
        data: { text: "Saya ingin aplikasi catat uang masuk keluar." },
      }),
    ]);
    expect([first.status(), second.status()]).toEqual(
      expect.arrayContaining([200, 202]),
    );
    const completed = first.status() === 200 ? await first.json() : await second.json();
    expect(completed.turn).toMatchObject({ status: "COMPLETED", providerCalls: 1 });
    const detail = await request.get(`/api/projects/${project.id}`);
    const messages = (await detail.json()).messages as Array<{ role: string }>;
    expect(messages.filter((message) => message.role === "user")).toHaveLength(1);
    expect(messages.filter((message) => message.role === "assistant")).toHaveLength(1);
  });

  test("takes a finance idea through natural chat, draft spec, design, and handoff", async ({
    page,
    request,
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


    const projectId = new URL(page.url()).pathname.split("/").filter(Boolean).pop();
    if (!projectId) throw new Error("Project id was not present in the URL.");
    const detail = await request.get(`/api/projects/${projectId}`);
    expect(detail.ok()).toBeTruthy();
    const persisted = (await detail.json()).project as {
      version: number;
      canonicalState: Record<string, unknown>;
    };
    const matureState = {
      ...persisted.canonicalState,
      rawIdea: "A cashflow tracker",
      targetUsers: ["owner"],
      objectives: ["record cashflow"],
      workflows: ["record transactions"],
      constraints: ["MVP excludes approvals"],
      provenance: {
        "targetUsers.owner": {
          source: "USER",
          confidence: "EXPLICIT",
          evidence: "owner",
        },
        "objectives.record cashflow": {
          source: "USER",
          confidence: "EXPLICIT",
          evidence: "record cashflow",
        },
        "workflows.record transactions": {
          source: "USER",
          confidence: "EXPLICIT",
          evidence: "record transactions",
        },
        "constraints.MVP excludes approvals": {
          source: "USER",
          confidence: "EXPLICIT",
          evidence: "MVP excludes approvals",
        },
      },
      generationMetadata: {
        ...((persisted.canonicalState.generationMetadata || {}) as Record<string, unknown>),
        initialConversation: { status: "COMPLETED" },
      },
    };
    const patched = await request.patch(`/api/projects/${projectId}`, {
      data: { canonicalState: matureState, expectedVersion: persisted.version },
    });
    expect(patched.ok()).toBeTruthy();
    const patchedProject = (await patched.json()).project;
    expect(patchedProject.canonicalState.draftSpecReady).toBe(true);
    expect(patchedProject.canonicalState.readiness).not.toBe("BUILD_READY");

    await page.reload();
    await expect(page.locator("#project-composer")).toBeVisible();
    await page.getByRole("button", { name: "Spec", exact: true }).first().click();
    await expect(page.getByRole("complementary", { name: "Product workbench" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Product Overview" })).toBeVisible();
    await page.getByRole("button", { name: "Generate Handoff" }).click();
    await expect(page.getByText(/Draft Spec sudah dibuat\.|The draft spec is ready\./)).toBeVisible({ timeout: 15_000 });
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
  test("normal second turn preserves optimistic state and exact request payload", async ({
    page,
    request,
  }) => {
    const created = await request.post("/api/projects", { data: { description: "" } });
    expect(created.status()).toBe(201);
    const project = (await created.json()).project as {
      id: string;
      version: number;
      canonicalState: Record<string, unknown>;
    };
    const state = {
      ...project.canonicalState,
      rawIdea: "saya mau buat aplikasi becak online",
      generationMetadata: {
        ...(project.canonicalState.generationMetadata as Record<string, unknown>),
        initialConversation: { status: "COMPLETED" },
      },
    };
    const patched = await request.patch(`/api/projects/${project.id}`, {
      data: { canonicalState: state, expectedVersion: project.version },
    });
    expect(patched.ok()).toBeTruthy();

    const text = "mirip gojek, tapi cuma becak di satu kota dulu";
    await page.goto(`/project/${project.id}`);
    await expect(page.locator("#project-composer")).toBeVisible();
    const responsePromise = page.waitForResponse(
      (item) =>
        item.url().includes(`/api/projects/${project.id}/conversation`) &&
        item.request().method() === "POST",
    );
    const requestPromise = page.waitForRequest(
      (item) =>
        item.url().includes(`/api/projects/${project.id}/conversation`) &&
        item.method() === "POST",
    );
    await page.locator("#project-composer").fill(text);
    await page.locator("#project-composer").press("Enter");
    const observed = await requestPromise;
    expect(observed.postDataJSON()).toEqual({ text });
    expect(observed.headers()["x-conversation-request-id"]).toBeTruthy();
    await expect(page.getByText(text, { exact: true })).toBeVisible();
    await expect(page.locator("#project-composer")).toHaveValue("");
    await expect(page.getByText(/Gojek|satu kota/i)).toBeVisible({ timeout: 30_000 });
    expect((await responsePromise).status()).toBe(200);
    await page.reload();
    await expect(page.getByText(text, { exact: true })).toHaveCount(1);
    const detail = await request.get(`/api/projects/${project.id}`);
    const messages = (await detail.json()).messages as Array<{ role: string; text: string }>;
    expect(messages.filter((message) => message.role === "user" && message.text === text)).toHaveLength(1);
    expect(messages.filter((message) => message.role === "assistant")).toHaveLength(1);
  });

  test("shows the mature Draft Spec CTA before BUILD_READY and opens Product Spec", async ({
    page,
    request,
  }) => {
    const created = await request.post("/api/projects", { data: { description: "" } });
    expect(created.status()).toBe(201);
    const project = (await created.json()).project as {
      id: string;
      version: number;
      canonicalState: Record<string, unknown>;
    };
    const patched = await request.patch(`/api/projects/${project.id}`, {
      data: {
        expectedVersion: project.version,
        canonicalState: {
          ...project.canonicalState,
          rawIdea: "A cashflow tracker",
          targetUsers: ["owner"],
          objectives: ["record cashflow"],
          workflows: ["record transactions"],
          constraints: ["MVP excludes approvals"],
          provenance: {
            "targetUsers.owner": { source: "USER", confidence: "EXPLICIT", evidence: "owner" },
            "objectives.record cashflow": { source: "USER", confidence: "EXPLICIT", evidence: "record cashflow" },
            "workflows.record transactions": { source: "USER", confidence: "EXPLICIT", evidence: "record transactions" },
            "constraints.MVP excludes approvals": { source: "USER", confidence: "EXPLICIT", evidence: "MVP excludes approvals" },
          },
          generationMetadata: {
            ...(project.canonicalState.generationMetadata as Record<string, unknown>),
            initialConversation: { status: "COMPLETED" },
          },
        },
      },
    });
    expect(patched.ok()).toBeTruthy();
    const updated = (await patched.json()).project;
    expect(updated.canonicalState.draftSpecReady).toBe(true);
    expect(updated.canonicalState.readiness).not.toBe("BUILD_READY");

    await page.goto(`/project/${project.id}`);
    const cta = page.getByRole("button", { name: /Buat Draft Spec|Create Draft Spec/ });
    await expect(cta).toBeVisible();
    const specResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/projects/${project.id}/spec`) &&
        response.request().method() === "POST",
    );
    await cta.click();
    expect((await specResponse).status()).toBe(200);
    await expect(page.getByRole("complementary", { name: "Product workbench" })).toBeVisible();
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
  });

  test("progresses becak HTTP turns into grounded mature state", async ({ page, request }) => {
    const firstText = "saya mau buat aplikasi becak online";
    const cityQuestion = "Untuk awal, layanan ini dibatasi di satu kota atau langsung lintas kota?";
    const driverQuestion = "Driver-nya berasal dari pangkalan becak terdaftar atau pendaftaran terbuka?";
    const created = await request.post("/api/projects", { data: { description: firstText } });
    expect(created.status()).toBe(201);
    const project = (await created.json()).project as { id: string };
    async function turn(text: string, index: number) {
      return request.post(`/api/projects/${project.id}/conversation`, {
        headers: { "x-conversation-request-id": `becak-acceptance-${index}` },
        data: { text },
      });
    }
    const initial = await request.post(`/api/projects/${project.id}/extract`, { data: { rawIdea: firstText } });
    expect(initial.status()).toBe(200);
    const second = await turn("mirip gojek, penumpang booking perjalanan dengan booking becak online cuma di satu kota dulu", 2);
    expect(second.status()).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.state.openQuestions).not.toEqual(expect.arrayContaining([driverQuestion]));
    expect(secondBody.state.targetUsers).toEqual(expect.arrayContaining(["penumpang"]));
    expect(secondBody.state.workflows).toEqual(expect.arrayContaining(["penumpang booking perjalanan"]));
    const third = await turn("driver nya driver becak dari pangkalan becak yang sudah terdaftar; MVP boundary satu kota dulu; objective booking perjalanan", 3);
    expect(third.status()).toBe(200);
    const thirdBody = await third.json();
    expect(thirdBody.state.targetUsers).toEqual(expect.arrayContaining(["penumpang"]));
    expect(thirdBody.state.workflows).toEqual(expect.arrayContaining(["penumpang booking perjalanan"]));
    expect(thirdBody.state.features).toEqual(expect.arrayContaining(["booking becak online"]));
    expect(thirdBody.state.constraints).toEqual(expect.arrayContaining(["satu kota dulu"]));
    expect(thirdBody.state.roles).toEqual(expect.arrayContaining(["driver becak"]));
    expect(thirdBody.state.entities).toEqual(expect.arrayContaining(["pangkalan becak"]));
    expect(thirdBody.state.readinessScore).toBeGreaterThan(0);
    expect(thirdBody.state.openQuestions).not.toEqual(expect.arrayContaining([cityQuestion, driverQuestion]));
    expect(thirdBody.state.draftSpecReady).toBe(true);
    const persisted = await request.get(`/api/projects/${project.id}`);
    expect(persisted.status()).toBe(200);
    const persistedState = (await persisted.json()).project.canonicalState;
    expect(persistedState.targetUsers).toEqual(expect.arrayContaining(["penumpang"]));
    expect(persistedState.workflows).toEqual(expect.arrayContaining(["penumpang booking perjalanan"]));
    expect(persistedState.readinessScore).toBeGreaterThan(0);
    const spec = await request.post(`/api/projects/${project.id}/spec`);
    expect(spec.status()).toBe(200);
    expect((await spec.json()).spec.documents).toEqual(expect.arrayContaining(["PRODUCT_SPEC.md"]));

    await page.goto(`/project/${project.id}`);
    await expect(page.getByRole("button", { name: /Buat Draft Spec|Create Draft Spec/ })).toBeVisible();
  });
  test("blocks handoff generation and download when canonical product truth is absent", async ({ request }) => {
    const created = await request.post("/api/projects", { data: { description: "" } });
    expect(created.status()).toBe(201);
    const project = (await created.json()).project as { id: string };

    const spec = await request.post(`/api/projects/${project.id}/spec`);
    expect(spec.status()).toBe(422);
    expect(await spec.json()).toMatchObject({ code: "HANDOFF_BLOCKED" });
    const generated = await request.post(`/api/projects/${project.id}/export`);
    expect(generated.status()).toBe(422);
    expect(await generated.json()).toMatchObject({ code: "HANDOFF_BLOCKED" });
    const download = await request.get(`/api/projects/${project.id}/export`);
    expect(download.status()).toBe(422);
    expect(await download.json()).toMatchObject({ code: "HANDOFF_BLOCKED" });
  });


  test("retry after refresh is covered when deterministic provider failure is enabled", async ({ page, request }) => {
    test.skip(
      process.env.PLAYWRIGHT_PLANNER_FAILURE !== "true",
      "Requires PLAYWRIGHT_PLANNER_FAILURE=true; this environment cannot force a durable provider failure without it.",
    );
    const created = await request.post("/api/projects", { data: { description: "" } });
    expect(created.status()).toBe(201);
    const project = (await created.json()).project as { id: string };
    await page.goto(`/project/${project.id}`);
    const text = "Saya ingin aplikasi booking becak.";
    await page.locator("#project-composer").fill(text);
    await page.locator("#project-composer").press("Enter");
    await expect(page.getByText(/^(?:RockFoundry couldn't reach the configured AI provider\.|RockFoundry received an invalid AI response\. Try again\.)$/, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(page.getByRole("button", { name: /Retry|Coba lagi/i }).last()).toBeVisible();
    await request.put("/api/provider", { data: { mode: "mock" } });
    await page.getByRole("button", { name: /Retry|Coba lagi/i }).last().click();
    await expect(page.locator(".rf-message-agent")).toHaveCount(1, { timeout: 30_000 });
    const detail = await request.get(`/api/projects/${project.id}`);
    const messages = (await detail.json()).messages as Array<{ role: string }>;
    expect(messages.filter((message) => message.role === "user")).toHaveLength(1);
    expect(messages.filter((message) => message.role === "assistant")).toHaveLength(1);
  });
});
