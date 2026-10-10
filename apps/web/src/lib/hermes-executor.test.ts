import assert from "node:assert/strict";
import { createServer, type ServerResponse } from "node:http";
import test from "node:test";
import { HermesExecutor, resolveHermesEnvironment } from "./hermes-executor";
import { ExecutorError } from "./executor-error";
import type { ExecutionInput } from "./executor-adapter";

async function fixture() {
  let submissions = 0;
  let submissionsAdmitted = 0;
  let status = "running";
  let durable = true;
  let missing = false;
  let dropNext = false;
  const identities = new Map<string, { payload: string; runId: string }>();
  const auth: string[] = [];
  const server = createServer(async (request, response) => {
    auth.push(request.headers.authorization || "");
    const send = (
      body: unknown,
      code = 200,
      res: ServerResponse = response,
    ) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (request.headers.authorization !== "Bearer test-only-executor-key") {
      send({ error: "unauthorized" }, 401);
      return;
    }
    if (request.url === "/health") {
      send({ status: "ok" });
      return;
    }
    if (request.url === "/v1/capabilities") {
      send({
        platform: "hermes-agent",
        auth: { type: "bearer", required: true },
        features: {
          run_submission: true,
          run_status: true,
          runs_idempotency: {
            supported: true,
            durable,
            retention_seconds: 86400,
          },
        },
      });
      return;
    }
    if (request.url === "/v1/runs" && request.method === "POST") {
      submissions++;
      let payload = "";
      for await (const chunk of request) payload += chunk;
      const key = String(request.headers["idempotency-key"] || "");
      const prior = identities.get(key);
      if (!key) {
        send({ error: "missing identity" }, 400);
        return;
      }
      if (prior && prior.payload !== payload) {
        send({ error: { code: "idempotency_key_conflict" } }, 409);
        return;
      }
      if (!prior) {
        submissionsAdmitted++;
        identities.set(key, { payload, runId: `run_${submissionsAdmitted}` });
      }
      if (dropNext) {
        dropNext = false;
        request.socket.destroy();
        return;
      }
      send({ run_id: identities.get(key)!.runId, status: "started" }, 202);
      return;
    }
    if (request.url?.startsWith("/v1/runs/") && request.method === "GET") {
      if (missing) {
        send({ error: { code: "run_not_found" } }, 404);
        return;
      }
      send({
        object: "hermes.run",
        run_id: request.url.split("/").at(-1),
        status,
        ...(status === "completed"
          ? {
              output: "Real HTTP fixture deliverable",
              session_id: "fixture-session",
            }
          : {}),
      });
      return;
    }
    send({ error: "not found" }, 404);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Fixture not listening");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const adapter = new HermesExecutor({
    enabled: true,
    baseUrl,
    key: "test-only-executor-key",
    model: "rockfoundry",
  });
  const input: ExecutionInput = {
    taskId: "t-http",
    title: "HTTP fixture task",
    description: null,
    acceptanceCriteria: "Reviewable result",
    createdAt: new Date().toISOString(),
    executorBinding: adapter.bindingId,
  };
  return {
    adapter,
    input,
    baseUrl,
    auth,
    identities,
    submissions: () => submissions,
    admitted: () => submissionsAdmitted,
    setStatus: (next: string) => {
      status = next;
    },
    setDurable: (next: boolean) => {
      durable = next;
    },
    setMissing: () => {
      missing = true;
    },
    dropNext: () => {
      dropNext = true;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

test("Hermes adapter uses authenticated official Runs API and stable payload/key; polling yields receipt", async () => {
  const f = await fixture();
  try {
    assert.equal(f.adapter.availability().available, true);
    const identity = crypto.randomUUID();
    const first = await f.adapter.submit(f.input, identity);
    const second = await f.adapter.submit(f.input, identity);
    assert.equal(first.externalId, second.externalId);
    assert.equal(f.admitted(), 1);
    assert.ok(
      f.auth.every((value) => value === "Bearer test-only-executor-key"),
    );
    const payload = JSON.parse(f.identities.get(identity)!.payload);
    assert.equal(JSON.parse(payload.input).taskId, f.input.taskId);
    assert.equal(payload.model, "rockfoundry");
    assert.match(payload.instructions, /Do not send external messages/);
    assert.doesNotMatch(
      f.identities.get(identity)!.payload,
      /test-only-executor-key/,
    );
    assert.equal(
      (await f.adapter.read(first.externalId, f.input)).status,
      "RUNNING",
    );
    f.setStatus("waiting_for_approval");
    assert.match(
      (await f.adapter.read(first.externalId, f.input)).error!,
      /does not auto-approve/,
    );
    f.setStatus("completed");
    const completed = await f.adapter.read(first.externalId, f.input);
    assert.equal(completed.status, "COMPLETED");
    assert.equal(completed.output, "Real HTTP fixture deliverable");
    assert.equal(completed.evidence![0].kind, "EXECUTION_RECEIPT");
    assert.equal(
      JSON.parse(completed.evidence![0].content).run_id,
      first.externalId,
    );
  } finally {
    await f.close();
  }
});

test("Hermes ambiguous admission retries with same key; terminal failure/missing run never causes a new POST", async () => {
  const f = await fixture();
  try {
    const identity = crypto.randomUUID();
    f.dropNext();
    await assert.rejects(f.adapter.submit(f.input, identity));
    const retried = await f.adapter.submit(f.input, identity);
    assert.equal(f.admitted(), 1);
    assert.equal(retried.externalId, "run_1");
    for (const status of ["failed", "cancelled", "interrupted"]) {
      f.setStatus(status);
      assert.equal(
        (await f.adapter.read(retried.externalId, f.input)).status,
        "FAILED",
      );
    }
    const count = f.submissions();
    f.setMissing();
    await assert.rejects(f.adapter.read(retried.externalId, f.input));
    assert.equal(f.submissions(), count);
  } finally {
    await f.close();
  }
});

test("Hermes capability durability, retry horizon and credential binding are fail-closed", async () => {
  const f = await fixture();
  try {
    f.setDurable(false);
    await assert.rejects(f.adapter.submit(f.input, crypto.randomUUID()));
    assert.equal(f.submissions(), 0);
    f.setDurable(true);
    await assert.rejects(
      f.adapter.submit(
        { ...f.input, createdAt: "2020-01-01T00:00:00.000Z" },
        crypto.randomUUID(),
      ),
    );
    await assert.rejects(
      f.adapter.submit(
        { ...f.input, executorBinding: "different-binding" },
        crypto.randomUUID(),
      ),
    );
    assert.equal(f.submissions(), 0);
    const changed = new HermesExecutor({
      enabled: true,
      baseUrl: f.baseUrl,
      key: "different-test-key",
    });
    assert.notEqual(changed.bindingId, f.adapter.bindingId);
    await assert.rejects(changed.submit(f.input, crypto.randomUUID()));
    const identity = crypto.randomUUID();
    await f.adapter.submit(f.input, identity);
    await assert.rejects(
      f.adapter.submit(
        { ...f.input, title: "Changed immutable task" },
        identity,
      ),
    );
    assert.equal(f.admitted(), 1);
  } finally {
    await f.close();
  }
});

test("Hermes config rejects insecure remote transports and remains unavailable without explicit enablement", () => {
  for (const options of [
    { enabled: false },
    {},
    { enabled: true, baseUrl: "http://remote.invalid", key: "test" },
    {
      enabled: true,
      baseUrl: "https://user:secret@example.invalid",
      key: "test",
    },
  ])
    assert.equal(new HermesExecutor(options).availability().available, false);
});

test("RF-002C protected env names map server-side and preserve explicit enablement", () => {
  const config = resolveHermesEnvironment({
    HERMES_EXECUTOR_ENABLED: "true",
    HERMES_RUNS_BASE_URL: "http://192.168.16.1:8643",
    HERMES_API_KEY: "fixture-key",
    HERMES_MODEL: "rockfoundry",
    HERMES_EXECUTOR_PRIVATE_HTTP_ORIGIN: "http://192.168.16.1:8643",
  });
  const adapter = new HermesExecutor(config);
  assert.equal(adapter.availability().available, true);
  assert.equal(
    new HermesExecutor({
      ...config,
      privateHttpOrigin: undefined,
    }).availability().available,
    false,
  );
  assert.equal(
    new HermesExecutor({
      ...config,
      privateHttpOrigin: "http://192.168.16.2:8643",
    }).availability().available,
    false,
  );
  assert.equal(
    new HermesExecutor({
      ...config,
      baseUrl: "http://8.8.8.8:8643",
      privateHttpOrigin: "http://8.8.8.8:8643",
    }).availability().available,
    false,
  );
  assert.equal(
    new HermesExecutor(
      resolveHermesEnvironment({
        HERMES_RUNS_BASE_URL: config.baseUrl,
        HERMES_API_KEY: "fixture-key",
      }),
    ).availability().available,
    false,
  );
  assert.notEqual(
    adapter.bindingId,
    new HermesExecutor({ ...config, model: "another-alias" }).bindingId,
  );
  assert.doesNotMatch(
    JSON.stringify(adapter.availability()),
    /fixture-key|192\.168/,
  );
});

test("RF-002C authentication failures expose only controlled diagnostics", async () => {
  const f = await fixture();
  try {
    const adapter = new HermesExecutor({
      enabled: true,
      baseUrl: f.baseUrl,
      key: "incorrect-fixture-key",
    });
    await assert.rejects(
      adapter.discover(),
      (cause: unknown) =>
        cause instanceof ExecutorError &&
        /authentication denied/.test(cause.safeMessage) &&
        !/incorrect-fixture-key/.test(cause.safeMessage),
    );
    assert.equal(f.submissions(), 0);
  } finally {
    await f.close();
  }
});
