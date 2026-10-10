import assert from "node:assert/strict";
import test from "node:test";
import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/work/route";
import { ownerAccessResponse } from "./owner-access";
import {
  OWNER_COOKIE,
  OWNER_SESSION_SECONDS,
  isOwnerIdentity,
  isOwnerToken,
  ownerAuthReady,
  ownerDevFallbackAllowed,
} from "./owner-policy";

const secret = "fixture-owner-session-secret-at-least-32-chars";
const base = {
  NODE_ENV: "production",
  NEXTAUTH_SECRET: secret,
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "secret",
  ROCKFOUNDRY_OWNER_EMAILS: "ranggaoscar@gmail.com",
  NEXTAUTH_URL: "https://foundry.rockbase.web.id",
};
async function cookieFor(token: Record<string, unknown>, env = base) {
  return encode({
    token,
    secret: env.NEXTAUTH_SECRET!,
    maxAge: OWNER_SESSION_SECONDS,
  });
}
function request(auth?: string, host = "foundry.rockbase.web.id") {
  const headers: Record<string, string> = { host };
  if (auth) headers.authorization = auth;
  return new NextRequest("https://foundry.rockbase.web.id/api/work", {
    headers,
  });
}
async function withEnv<T>(env: Record<string, string>, run: () => Promise<T>) {
  const before = { ...process.env };
  Object.assign(process.env, env);
  try {
    return await run();
  } finally {
    for (const key of Object.keys(env))
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key]!;
  }
}

test("owner identity allowlist denies by default and requires a verified Google identity", () => {
  const env = { ROCKFOUNDRY_OWNER_EMAILS: "ranggaoscar@gmail.com" };
  assert.equal(
    isOwnerIdentity(
      {
        provider: "google",
        email: "ranggaoscar@gmail.com",
        verified: true,
        sub: "1",
      },
      env,
    ),
    true,
  );
  assert.equal(
    isOwnerIdentity(
      {
        provider: "google",
        email: "RANGGAOSCAR@gmail.com",
        verified: true,
        sub: "1",
      },
      env,
    ),
    true,
  );
  for (const identity of [
    { provider: "google", email: "someone@else.com", verified: true, sub: "2" },
    {
      provider: "google",
      email: "ranggaoscar@gmail.com",
      verified: false,
      sub: "1",
    },
    { provider: "google", email: "ranggaoscar@gmail.com", verified: true },
    {
      provider: "github",
      email: "ranggaoscar@gmail.com",
      verified: true,
      sub: "1",
    },
  ])
    assert.equal(isOwnerIdentity(identity, env), false);
  assert.equal(
    isOwnerIdentity(
      { provider: "google", email: "a@b.com", verified: true, sub: "9" },
      {
        ROCKFOUNDRY_OWNER_EMAILS: "a@b.com",
        ROCKFOUNDRY_OWNER_GOOGLE_SUBS: "1,2",
      },
    ),
    false,
  );
  assert.equal(
    isOwnerIdentity(
      { provider: "google", email: "a@b.com", verified: true, sub: "1" },
      {
        ROCKFOUNDRY_OWNER_EMAILS: "a@b.com",
        ROCKFOUNDRY_OWNER_GOOGLE_SUBS: "1,2",
      },
    ),
    true,
  );
});

test("owner session tokens must be unexpired, allow-listed and Google-bound", () => {
  const env = { ROCKFOUNDRY_OWNER_EMAILS: "ranggaoscar@gmail.com" };
  const valid = {
    email: "ranggaoscar@gmail.com",
    googleSub: "1",
    googleVerified: true,
    ownerProvider: "google",
    exp: Math.floor(Date.now() / 1000) + 600,
    ownerUntil: Math.floor(Date.now() / 1000) + 600,
  };
  assert.equal(isOwnerToken(valid, env), true);
  assert.equal(
    isOwnerToken({ ...valid, exp: Math.floor(Date.now() / 1000) - 5 }, env),
    false,
  );
  assert.equal(
    isOwnerToken(
      { ...valid, ownerUntil: Math.floor(Date.now() / 1000) - 5 },
      env,
    ),
    false,
  );
  assert.equal(isOwnerToken({ ...valid, email: "other@else.com" }, env), false);
  assert.equal(isOwnerToken({ ...valid, ownerProvider: "github" }, env), false);
  assert.equal(isOwnerToken(null, env), false);
});

test("production configuration is required and must be the owner HTTPS origin", () => {
  assert.equal(ownerAuthReady(base), true);
  assert.equal(ownerAuthReady({ ...base, GOOGLE_CLIENT_ID: undefined }), false);
  assert.equal(ownerAuthReady({ ...base, NEXTAUTH_SECRET: "short" }), false);
  assert.equal(
    ownerAuthReady({ ...base, ROCKFOUNDRY_OWNER_EMAILS: "" }),
    false,
  );
  assert.equal(
    ownerAuthReady({ ...base, NEXTAUTH_URL: "http://evil.invalid" }),
    false,
  );
});

test("actual Work routes deny anonymous, unauthorized and static-Bearer access; owner session passes", async () => {
  await withEnv(base, async () => {
    assert.equal((await GET(request())).status, 401);
    const mutation = new NextRequest(
      "https://foundry.rockbase.web.id/api/work",
      {
        method: "POST",
        headers: {
          host: "foundry.rockbase.web.id",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "create_project",
          name: "MUST NOT CREATE",
        }),
      },
    );
    assert.equal((await POST(mutation)).status, 401);
    assert.equal((await GET(request("Bearer any-static-secret"))).status, 401);
    // Authenticated Google identity that is NOT on the owner allowlist: default deny.
    const outsider = await cookieFor(
      {
        email: "intruder@example.com",
        googleSub: "1",
        googleVerified: true,
        ownerProvider: "google",
        ownerUntil: Math.floor(Date.now() / 1000) + 600,
      },
      base,
    );
    const denied = await ownerAccessResponse(
      new NextRequest("https://foundry.rockbase.web.id/api/work", {
        headers: {
          host: "foundry.rockbase.web.id",
          cookie: `${OWNER_COOKIE}=${outsider}`,
        },
      }),
    );
    assert.ok(denied);
    assert.equal(denied.status, 403);
    assert.equal(
      (
        await GET(
          new NextRequest("https://foundry.rockbase.web.id/api/work", {
            headers: {
              host: "foundry.rockbase.web.id",
              cookie: `${OWNER_COOKIE}=${outsider}`,
            },
          }),
        )
      ).status,
      403,
    );
    const expired = await cookieFor({
      email: "ranggaoscar@gmail.com",
      googleSub: "1",
      googleVerified: true,
      ownerProvider: "google",
      ownerUntil: Math.floor(Date.now() / 1000) - 1,
    });
    const expiredDenied = await ownerAccessResponse(
      new NextRequest("https://foundry.rockbase.web.id/api/work", {
        headers: {
          host: "foundry.rockbase.web.id",
          cookie: `${OWNER_COOKIE}=${expired}`,
        },
      }),
    );
    assert.ok(expiredDenied);
    const owner = await cookieFor({
      email: "ranggaoscar@gmail.com",
      googleSub: "1",
      googleVerified: true,
      ownerProvider: "google",
      ownerUntil: Math.floor(Date.now() / 1000) + 600,
    });
    assert.equal(
      await ownerAccessResponse(
        new NextRequest("https://foundry.rockbase.web.id/api/work", {
          headers: {
            host: "foundry.rockbase.web.id",
            cookie: `${OWNER_COOKIE}=${owner}`,
          },
        }),
      ),
      null,
    );
  });
});

test("local-first development fallback is loopback-only and never applies in production", () => {
  assert.equal(
    ownerDevFallbackAllowed(
      { headers: new Headers({ host: "127.0.0.1:3100" }) },
      { NODE_ENV: "development" },
    ),
    true,
  );
  assert.equal(
    ownerDevFallbackAllowed(
      { headers: new Headers({ host: "public.invalid" }) },
      { NODE_ENV: "development" },
    ),
    false,
  );
  assert.equal(
    ownerDevFallbackAllowed(
      { headers: new Headers({ host: "127.0.0.1:3100" }) },
      { NODE_ENV: "production" },
    ),
    false,
  );
  assert.equal(
    ownerDevFallbackAllowed(
      { headers: new Headers({ host: "127.0.0.1:3100" }) },
      base,
    ),
    false,
  );
});
