import { describe, expect, it } from "vitest";
import { MockGatewayProvider } from "../index";
import type { InitialIdeaExtraction } from "@rockfoundry/core";

const request = {
  taskType: "initial_idea_extraction" as const,
  modelTier: "cheap" as const,
  messages: [
    { role: "system" as const, content: "Extract" },
    {
      role: "user" as const,
      content:
        "Extract:\n---\nBuild inventory for three marble warehouses with transfer history\n---",
    },
  ],
};

describe("mock provider", () => {
  it("returns domain-specific extraction without network access", async () => {
    const response =
      await new MockGatewayProvider().complete<InitialIdeaExtraction>(request);
    expect(response.data.primaryUsers.map((item) => item.value)).toContain(
      "Warehouse staff",
    );
    expect(response.data.coreEntities.map((item) => item.value)).toContain(
      "Inventory movement",
    );
  });
});
