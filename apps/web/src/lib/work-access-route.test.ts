import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/work/route";

test("actual Work route blocks anonymous reads/mutations and public-demo reads before storage", async () => {
  const before = { ...process.env };
  try {
    process.env.ROCKFOUNDRY_WORK_ORIGIN = "https://foundry.rockbase.web.id";
    process.env.ROCKFOUNDRY_WORK_ACCESS_KEY =
      "fixture-route-owner-access-key-not-real";
    process.env.ROCKFOUNDRY_PUBLIC_DEMO = "false";
    const request = new NextRequest("http://foundry.rockbase.web.id/api/work", {
      headers: { host: "foundry.rockbase.web.id" },
    });
    assert.equal((await GET(request)).status, 401);
    const mutation = new NextRequest(
      "http://foundry.rockbase.web.id/api/work",
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
    process.env.ROCKFOUNDRY_PUBLIC_DEMO = "true";
    assert.equal((await GET(request)).status, 403);
    process.env.ROCKFOUNDRY_PUBLIC_DEMO = "false";
    delete process.env.ROCKFOUNDRY_WORK_ACCESS_KEY;
    assert.equal((await GET(request)).status, 503);
  } finally {
    for (const key of [
      "ROCKFOUNDRY_WORK_ORIGIN",
      "ROCKFOUNDRY_WORK_ACCESS_KEY",
      "ROCKFOUNDRY_PUBLIC_DEMO",
    ]) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
});
