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

  it("recognizes Indonesian multi-brand CRM context", async () => {
    const response =
      await new MockGatewayProvider().complete<InitialIdeaExtraction>({
        ...request,
        messages: [
          request.messages[0],
          {
            role: "user",
            content:
              "Extract:\n---\nGua mau bikin CRM untuk 5 brand marmer. Customer datang dari WhatsApp, Instagram, dan website. Ada follow-up dan quotation.\n---",
          },
        ],
      });
    const entities = response.data.coreEntities.map((item) => item.value);
    const integrations = response.data.integrationsMentioned.map(
      (item) => item.value,
    );
    expect(entities).toEqual(
      expect.arrayContaining(["Customer", "Quotation", "Brand"]),
    );
    expect(integrations).toEqual(
      expect.arrayContaining(["WhatsApp", "Instagram", "Website"]),
    );
  });
});
