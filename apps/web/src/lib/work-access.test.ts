import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { workAccessResponse } from "./work-access";

test("supported development launcher binds loopback; Host is not a remote-peer authorization claim", () => {
  const manifest = JSON.parse(
    fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  );
  assert.match(manifest.scripts.dev, /--hostname 127\.0\.0\.1/);
});
const secret = "fixture-owner-access-key-not-a-real-secret";
const request = (auth = "", host = "foundry.rockbase.web.id") => ({
  headers: new Headers({ host, authorization: auth }),
});
const basic = (password: string) =>
  "Basic " + Buffer.from("rockfoundry:" + password).toString("base64");
test("production/live access fails closed before database reads and mutations", () => {
  for (const env of [
    { NODE_ENV: "production" },
    { HERMES_EXECUTOR_ENABLED: "true" },
    { ROCKFOUNDRY_WORK_ORIGIN: "https://foundry.rockbase.web.id" },
  ])
    assert.equal(workAccessResponse(request(), env)?.status, 503);
  assert.equal(
    workAccessResponse(request(), {
      NODE_ENV: "production",
      ROCKFOUNDRY_WORK_ACCESS_KEY: secret,
    })?.status,
    401,
  );
  assert.equal(
    workAccessResponse(request(basic("wrong")), {
      NODE_ENV: "production",
      ROCKFOUNDRY_WORK_ACCESS_KEY: secret,
    })?.status,
    401,
  );
  assert.equal(
    workAccessResponse(request(basic(secret)), {
      NODE_ENV: "production",
      ROCKFOUNDRY_WORK_ACCESS_KEY: secret,
    }),
    null,
  );
  assert.equal(
    workAccessResponse(request(basic(secret)), {
      ROCKFOUNDRY_PUBLIC_DEMO: "true",
      ROCKFOUNDRY_WORK_ACCESS_KEY: secret,
    })?.status,
    403,
  );
});
test("unprovisioned local development only works on loopback; no Origin is not an auth bypass", () => {
  assert.equal(
    workAccessResponse(request("", "127.0.0.1:3100"), {
      NODE_ENV: "development",
    }),
    null,
  );
  assert.equal(
    workAccessResponse(request("", "public.invalid"), {
      NODE_ENV: "development",
    })?.status,
    503,
  );
  assert.equal(
    workAccessResponse(request("", "127.0.0.1:3100"), {
      NODE_ENV: "production",
      ROCKFOUNDRY_WORK_ACCESS_KEY: secret,
    })?.status,
    401,
  );
});
