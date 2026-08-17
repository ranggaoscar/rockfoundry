import { describe, expect, it } from "vitest";
import { InlineQueueProvider, isStaleRunningJob } from "../jobs";

describe("job queue primitives", () => {
  it("executes inline jobs once in development", async () => {
    const queue = new InlineQueueProvider();
    let calls = 0;
    await queue.enqueue(
      {
        id: "job-1",
        type: "zip_generation",
        payload: {},
        idempotencyKey: "export:project:1",
      },
      async () => {
        calls += 1;
      },
    );
    expect(calls).toBe(1);
  });

  it("marks old running jobs as stale", () => {
    expect(isStaleRunningJob(new Date(0), new Date(10 * 60 * 1000))).toBe(true);
    expect(isStaleRunningJob(new Date(1), new Date(10 * 60 * 1000))).toBe(
      false,
    );
  });
});
