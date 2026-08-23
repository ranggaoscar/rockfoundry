import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("fast initial discovery path", () => {
  it("keeps normal INITIAL_DISCOVERY on a single extraction call without model planner", () => {
    const discoverySource = readFileSync(
      resolve(process.cwd(), "../../apps/web/src/lib/discovery.ts"),
      "utf8",
    );
    const plannerSource = readFileSync(
      resolve(process.cwd(), "../../apps/web/src/lib/agent-planner.ts"),
      "utf8",
    );
    const conversationSource = readFileSync(
      resolve(process.cwd(), "../../apps/web/src/lib/conversation.ts"),
      "utf8",
    );
    const aiSource = readFileSync(
      resolve(process.cwd(), "src/index.ts"),
      "utf8",
    );

    expect(discoverySource).toContain("fast_initial_v1");
    expect(discoverySource).toContain("runInitialExtraction");
    expect(discoverySource).toContain("providerCalls: 1");
    expect(discoverySource).not.toContain("createModelDiscoveryPlanner");
    expect(discoverySource).not.toContain("AgentRunner");
    expect(discoverySource).not.toContain("runPlannerAction");

    // Research/agentic infrastructure remains available outside initial discovery.
    expect(plannerSource).toContain("createModelDiscoveryPlanner");
    expect(plannerSource).toContain("runPlannerAction");
    expect(conversationSource).toContain("createModelDiscoveryPlanner");
    expect(conversationSource).toContain("RESEARCH_REQUEST");

    // Initial extraction uses request-level medium reasoning.
    expect(aiSource).toMatch(
      /runInitialExtraction[\s\S]*reasoningEffort:\s*"medium"/,
    );
  });
});
