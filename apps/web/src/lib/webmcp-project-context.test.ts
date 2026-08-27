import { describe, expect, it } from "vitest";
import { buildProjectWebMcpContext } from "./webmcp-project-context";

describe("buildProjectWebMcpContext", () => {
  it("uses the persisted Product Draft Screen Map and canonical project state", () => {
    const context = buildProjectWebMcpContext({
      project: {
        id: "project-1",
        name: "Laundry Flow",
        description: "A laundry service",
        version: 4,
        canonicalState: {
          normalizedSummary: "Manage laundry pickup and delivery.",
          openQuestions: ["Who confirms delivery?"],
          assumptions: [
            {
              statement: "Drivers use a mobile workflow.",
              confidence: "WEAKLY_INFERRED",
              impact: "HIGH",
            },
            { statement: "Resolved item", resolved: true },
          ],
          studio: {
            status: "NEEDS_REVIEW",
            currentVersion: 2,
            approvedVersion: null,
            stale: false,
            screenMap: [],
          },
        },
      },
      draft: {
        generation: {
          id: "generation-1",
          generationNumber: 3,
          canonicalVersion: 4,
          status: "COMPLETE",
        },
        hasCurrentDraft: true,
        documents: [
          {
            type: "SCREEN_MAP",
            fileName: "SCREEN_MAP.md",
            status: "READY",
            current: true,
            version: 4,
            content:
              "# Screen Map\n\n```rockfoundry-screen-map\n[{\"id\":\"orders\",\"name\":\"Orders\",\"actorIds\":[],\"purpose\":\"Review orders\",\"route\":\"#/orders\",\"status\":\"DRAFT\",\"source\":\"INFERRED\"}]\n```\n",
          },
        ],
      },
      screenMap: [
        {
          name: "Orders",
          route: "#/orders",
          purpose: "Review orders",
          status: "DRAFT",
        },
      ],
    });

    expect(context).toMatchObject({
      project: { name: "Laundry Flow", summary: "Manage laundry pickup and delivery." },
      productDraft: { status: "COMPLETE", hasCurrentDraft: true },
      screenMap: [{ name: "Orders", route: "#/orders" }],
      design: { status: "NEEDS_REVIEW", prototypeAvailable: true },
      openQuestions: ["Who confirms delivery?"],
      assumptions: [{ statement: "Drivers use a mobile workflow." }],
    });
  });

  it("falls back to unresolved discovery topics when no open-question list exists", () => {
    const context = buildProjectWebMcpContext({
      project: {
        id: "project-2",
        name: "Untitled",
        description: null,
        version: 1,
        canonicalState: {
          discovery: { unresolvedTopics: ["Choose the primary user role."] },
        },
      },
      draft: { generation: null, documents: [], hasCurrentDraft: false },
    });

    expect(context.openQuestions).toEqual(["Choose the primary user role."]);
  });
});
