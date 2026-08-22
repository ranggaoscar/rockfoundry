import { test, expect } from "@playwright/test";

test.describe("Agentic V1 local flow", () => {
  test("lists provider presets and never returns provider credentials", async ({
    request,
  }) => {
    const presets = await request.get("/api/provider/presets");
    expect(presets.status()).toBe(200);
    const presetsPayload = await presets.json();
    expect(presetsPayload.presets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "openai",
          baseUrl: expect.stringContaining("/v1"),
        }),
      ]),
    );

    const status = await request.get("/api/provider");
    expect(status.status()).toBe(200);
    const payload = await status.json();
    expect(JSON.stringify(payload).toLowerCase()).not.toContain("api_key");
    expect(payload).not.toHaveProperty("apiKey");
  });

  test("creates and reopens a project without an account", async ({
    request,
  }) => {
    const created = await request.post("/api/projects", {
      data: {
        name: "E2E local project",
        description: "Build inventory for three warehouses",
      },
    });
    expect(created.status()).toBe(201);
    const payload = await created.json();
    expect(payload.project.id).toBeTruthy();

    const reopened = await request.get(`/api/projects/${payload.project.id}`);
    expect(reopened.status()).toBe(200);
    const project = await reopened.json();
    expect(project.project.name).toBe("E2E local project");
    expect(project.project.canonicalState.rawIdea).toContain(
      "three warehouses",
    );
  });
});
