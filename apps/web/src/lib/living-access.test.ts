import assert from "node:assert/strict";
import test from "node:test";
import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/living/route";
import { OWNER_COOKIE } from "./owner-policy";

test("RF-003 actual living routes reject anonymous, non-owner, expired and cross-origin requests before DB access", async () => {
  const config = {
    NODE_ENV: "production",
    NEXTAUTH_SECRET: "rf003-test-secret-at-least-32-bytes-no-live-key",
    GOOGLE_CLIENT_ID: "fixture",
    GOOGLE_CLIENT_SECRET: "fixture",
    ROCKFOUNDRY_OWNER_EMAILS: "ranggaoscar@gmail.com",
    NEXTAUTH_URL: "https://foundry.rockbase.web.id",
  };
  const previous = { ...process.env };
  Object.assign(process.env, config);
  try {
    const request = (cookie?: string, method = "GET", origin?: string) =>
      new NextRequest("https://foundry.rockbase.web.id/api/living", {
        method,
        headers: {
          host: "foundry.rockbase.web.id",
          ...(cookie ? { cookie: `${OWNER_COOKIE}=${cookie}` } : {}),
          ...(origin ? { origin } : {}),
          "content-type": "application/json",
        },
        ...(method === "POST"
          ? {
              body: JSON.stringify({
                action: "capture",
                text: "MUST NOT SAVE",
                requestId: crypto.randomUUID(),
              }),
            }
          : {}),
      });
    assert.equal((await GET(request())).status, 401);
    assert.equal((await POST(request(undefined, "POST"))).status, 401);
    for (const identity of [
      { email: "outsider@example.com", offset: 600 },
      { email: "ranggaoscar@gmail.com", offset: -10 },
    ]) {
      const cookie = await encode({
        secret: config.NEXTAUTH_SECRET,
        maxAge: 28800,
        token: {
          email: identity.email,
          googleSub: "fixture",
          googleVerified: true,
          ownerProvider: "google",
          ownerUntil: Math.floor(Date.now() / 1000) + identity.offset,
        },
      });
      assert.equal((await GET(request(cookie))).status, 403);
      assert.equal((await POST(request(cookie, "POST"))).status, 403);
    }
    const owner = await encode({
      secret: config.NEXTAUTH_SECRET,
      maxAge: 28800,
      token: {
        email: "ranggaoscar@gmail.com",
        googleSub: "fixture",
        googleVerified: true,
        ownerProvider: "google",
        ownerUntil: Math.floor(Date.now() / 1000) + 600,
      },
    });
    assert.equal(
      (await POST(request(owner, "POST", "https://evil.invalid"))).status,
      403,
    );
  } finally {
    for (const key of Object.keys(config)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key]!;
    }
  }
});
