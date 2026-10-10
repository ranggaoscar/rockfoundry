import assert from "node:assert/strict";
import test from "node:test";
import { isWorkOriginAllowed } from "./work-origin";
const req = (origin: string, host: string, site = "same-origin") => ({
  url: `http://${host}/api/work`,
  headers: new Headers({ origin, host, "sec-fetch-site": site }),
});
test("production HTTPS origin survives internal HTTP reverse proxy without trusting forwarded headers", () => {
  const configured = "https://foundry.rockbase.web.id";
  assert.equal(
    isWorkOriginAllowed(req(configured, "foundry.rockbase.web.id"), configured),
    true,
  );
  assert.equal(
    isWorkOriginAllowed(
      req("http://foundry.rockbase.web.id", "foundry.rockbase.web.id"),
      configured,
    ),
    false,
  );
  assert.equal(
    isWorkOriginAllowed(
      req("https://evil.invalid", "foundry.rockbase.web.id"),
      configured,
    ),
    false,
  );
  assert.equal(
    isWorkOriginAllowed(
      req(configured, "foundry.rockbase.web.id", "cross-site"),
      configured,
    ),
    false,
  );
  assert.equal(
    isWorkOriginAllowed(req("null", "foundry.rockbase.web.id"), configured),
    false,
  );
});
test("local origin and server callers preserve RF-001 behavior", () => {
  assert.equal(
    isWorkOriginAllowed(req("http://127.0.0.1:3000", "127.0.0.1:3000"), ""),
    true,
  );
  assert.equal(
    isWorkOriginAllowed(req("https://127.0.0.1:3000", "127.0.0.1:3000"), ""),
    false,
  );
  assert.equal(
    isWorkOriginAllowed(
      {
        url: "http://localhost:3000/api/work",
        headers: new Headers({
          host: "127.0.0.1:3000",
          origin: "http://127.0.0.1:3000",
        }),
      },
      "",
    ),
    true,
  );
  assert.equal(
    isWorkOriginAllowed(
      { url: "http://localhost:3000/api/work", headers: new Headers() },
      "",
    ),
    true,
  );
});
