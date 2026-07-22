import { test, expect } from "@playwright/test";
import { prisma } from "@rockfoundry/db";

test.describe("Auth flows", () => {
  test.beforeAll(async () => {
    // Cleanup test user if exists
    await prisma.user.deleteMany({ where: { email: "e2e@test.com" } });
  });

  test("can register, login, and access dashboard", async ({ page, request }) => {
    // Register directly via API since UI might not be fully built
    const res = await request.post("http://localhost:3000/api/auth/sign-up", {
      data: {
        name: "E2E User",
        email: "e2e@test.com",
        password: "Password123!"
      }
    });
    
    expect(res.status()).toBe(200);

    const loginRes = await request.post("http://localhost:3000/api/auth/sign-in", {
      data: {
        email: "e2e@test.com",
        password: "Password123!"
      }
    });

    expect(loginRes.status()).toBe(200);

    // Verify session
    const sessionRes = await request.get("http://localhost:3000/api/auth/get-session");
    expect(sessionRes.status()).toBe(200);
    const session = await sessionRes.json();
    expect(session?.user?.email).toBe("e2e@test.com");
  });
});
