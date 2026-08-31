import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("V2 initial conversation path", () => {
  it("uses the Conversation Agent and does not construct a canonical question", () => {
    const discoverySource = readFileSync(
      resolve(process.cwd(), "../../apps/web/src/lib/discovery.ts"),
      "utf8",
    );
    const conversationSource = readFileSync(
      resolve(process.cwd(), "../../apps/web/src/lib/conversation.ts"),
      "utf8",
    );
    const agentSource = readFileSync(
      resolve(process.cwd(), "../../apps/web/src/lib/conversation-agent.ts"),
      "utf8",
    );
    const routeSource = readFileSync(
      resolve(process.cwd(), "../../apps/web/src/app/api/projects/[id]/conversation/route.ts"),
      "utf8",
    );
    const conversationTurnSource = readFileSync(
      resolve(process.cwd(), "../../apps/web/src/lib/conversation-turn.ts"),
      "utf8",
    );
    const extractSource = readFileSync(
      resolve(process.cwd(), "../../apps/web/src/app/api/projects/[id]/extract/route.ts"),
      "utf8",
    );
    const workspaceSource = readFileSync(
      resolve(process.cwd(), "../../apps/web/src/app/project/[id]/page.tsx"),
      "utf8",
    );

    expect(discoverySource).toContain("conversation_agent_v2");
    expect(discoverySource).toContain("runConversationAgent");
    expect(discoverySource).toContain("providerCalls: 1");
    expect(discoverySource).toContain("runInitialConversation");
    expect(discoverySource).toContain('status: "FAILED"');
    expect(discoverySource).toContain("initialConversation");
    expect(conversationSource).not.toContain("QuestionEngine");
    expect(conversationSource).not.toContain("canonicalQuestion");
    expect(agentSource).toContain("runConversationAgent");
    expect(agentSource).toContain("generateGenericDecisionCandidates");
    expect(conversationTurnSource).toContain("question: null");
    expect(routeSource).not.toContain("QuestionEngine");
    expect(extractSource).toContain("retryable");
    expect(extractSource).toContain("runInitialConversation");
    expect(workspaceSource).toContain("RockFoundry sedang memahami idenya");
    expect(workspaceSource).toContain("Coba lagi");
  });
});
