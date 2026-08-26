import { describe, expect, it, vi } from "vitest";

const { aiGateway, prismaMock, transactionMock } = vi.hoisted(() => {
  const createdArtifacts: Array<Record<string, unknown>> = [];
  const transactionMock = {
    draftGeneration: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi
        .fn()
        .mockImplementation(
          async ({ data }: { data: Record<string, unknown> }) => ({
            id: "generation-1",
            ...data,
          }),
        ),
    },
    artifact: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi
        .fn()
        .mockImplementation(
          async ({ data }: { data: Record<string, unknown> }) => {
            const artifact = {
              id: `artifact-${createdArtifacts.length + 1}`,
              generatedAt: new Date("2026-08-26T00:00:00.000Z"),
              ...data,
            };
            createdArtifacts.push(artifact);
            return artifact;
          },
        ),
    },
  };
  return {
    aiGateway: { runArtifactComposer: vi.fn() },
    prismaMock: {
      conversationMessage: { findMany: vi.fn().mockResolvedValue([]) },
      draftGeneration: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(
        async (callback: (transaction: typeof transactionMock) => unknown) =>
          callback(transactionMock),
      ),
    },
    transactionMock,
  };
});

vi.mock("./ai-provider", () => ({
  getAiGateway: vi.fn(() => aiGateway),
}));

vi.mock("@rockfoundry/db", () => ({ prisma: prismaMock }));

import { createInitialProjectState } from "@rockfoundry/core";
import {
  artifactComposerErrorPayload,
  composeDraftArtifacts,
  formatComposedDocument,
  publicDraftArtifact,
  selectLatestCompleteDraftGeneration,
  selectLatestLegacyDraftArtifacts,
} from "./artifact-composer";

function malformedMarkdownDocument(
  title: string,
  detail: string,
  wrapper: "document" | "artifact" | "data" | "result",
) {
  const markdown = `# ${title}\n\n${detail}\n\n## Review\n\n- Useful ${title} detail survives malformed fields.`;
  return {
    [wrapper]: {
      title,
      summary: null,
      sections: "invalid-sections",
      content: markdown,
    },
  };
}

function malformedLunaOutput() {
  return {
    documents: {
      BRD: malformedMarkdownDocument(
        "Business Requirements",
        "Laundry shop owners need a clear order workflow.",
        "document",
      ),
      PRD: {
        document: {
          title: "Product Requirements",
          summary: { invalid: true },
          sections: 42,
          content:
            "# Product Requirements\n\nA focused laundry product draft.\n\n## Scope\n\n- Keep the first laundry workflow small.",
        },
      },
      ERD: malformedMarkdownDocument(
        "Entity Relationship Document",
        "Laundry orders connect customers with pickup status.",
        "artifact",
      ),
      USER_FLOWS: malformedMarkdownDocument(
        "User Flows",
        "Customers request pickup and owners review active orders.",
        "data",
      ),
      SCREEN_MAP: malformedMarkdownDocument(
        "Screen Map",
        "Owner dashboard — Route: `#/orders` — Purpose: Review active laundry orders",
        "document",
      ),
      DESIGN_BRIEF: malformedMarkdownDocument(
        "Design Brief",
        "A useful laundry preview direction keeps order status visible.",
        "result",
      ),
    },
  };
}

describe("Artifact Composer error boundary", () => {
  it("never exposes provider, schema, or database error text", () => {
    const payload = artifactComposerErrorPayload(
      new Error("Prisma password=secret provider payload invalid JSON"),
    );
    expect(payload.error).toBe(
      "RockFoundry couldn't generate the Product Draft.",
    );
    expect(JSON.stringify(payload)).not.toContain("Prisma");
    expect(JSON.stringify(payload)).not.toContain("secret");
    expect(JSON.stringify(payload)).not.toContain("invalid JSON");
  });
});

describe("Product Draft formatter compatibility", () => {
  it("keeps the truth ledger headings and per-item labels", () => {
    const content = formatComposedDocument({
      title: "Screen Map",
      summary: "Useful draft",
      sections: [
        {
          id: "overview",
          title: "Overview",
          paragraphs: ["A grounded summary."],
          items: [
            {
              id: "confirmed",
              text: "Owner",
              label: "CONFIRMED",
              evidenceIds: [],
            },
            {
              id: "proposal",
              text: "Orders screen",
              label: "PROPOSAL",
              evidenceIds: [],
            },
            {
              id: "question",
              text: "Delivery?",
              label: "OPEN_QUESTION",
              evidenceIds: [],
            },
          ],
        },
      ],
    });
    expect(content).toContain("## TRUTH LEDGER");
    expect(content).toContain("## CONFIRMED");
    expect(content).toContain("## ASSUMPTIONS / PROPOSALS");
    expect(content).toContain("## OPEN QUESTIONS");
    expect(content).toContain("**CONFIRMED** Owner");
    expect(content).toContain("**PROPOSAL** Orders screen");
    expect(content).toContain("**OPEN_QUESTION** Delivery?");
  });
});
describe("Product Draft persistence with tolerant Luna output", () => {
  it("persists six useful READY artifacts from one malformed provider response without repair", async () => {
    const state = createInitialProjectState({
      id: "luna-web-regression",
      name: "Laundry",
      rawIdea: "A laundry app for a small shop",
    });
    aiGateway.runArtifactComposer.mockReset();
    aiGateway.runArtifactComposer.mockResolvedValue(malformedLunaOutput());

    const result = await composeDraftArtifacts("project-1", 7, state);

    expect(aiGateway.runArtifactComposer).toHaveBeenCalledTimes(1);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionMock.draftGeneration.create).toHaveBeenCalledTimes(1);
    expect(
      transactionMock.draftGeneration.create.mock.calls[0][0].data,
    ).toMatchObject({
      canonicalVersion: 7,
      generationNumber: 1,
      status: "COMPLETE",
    });
    expect(transactionMock.artifact.create).toHaveBeenCalledTimes(6);
    const artifactInputs = transactionMock.artifact.create.mock.calls.map(
      ([call]) => call.data,
    );
    expect(artifactInputs.map((artifact) => artifact.type)).toEqual([
      "BRD",
      "PRD",
      "ERD",
      "USER_FLOWS",
      "SCREEN_MAP",
      "DESIGN_BRIEF",
    ]);
    expect(
      artifactInputs.every((artifact) => artifact.status === "READY"),
    ).toBe(true);
    expect(
      artifactInputs.every(
        (artifact) => artifact.draftGenerationId === "generation-1",
      ),
    ).toBe(true);

    const prd = result.documents.PRD;
    const screenMap = result.documents.SCREEN_MAP;
    expect(prd).toContain("focused laundry product draft");
    expect(prd).toContain("Keep the first laundry workflow small");
    expect(screenMap).toContain("#/orders");
    expect(screenMap).toContain("Review active laundry orders");
    for (const artifact of artifactInputs) {
      const content = String(artifact.content);
      expect(content.length).toBeGreaterThan(100);
      expect(content).not.toMatch(
        /needs review before it can be treated as complete/i,
      );
      expect(content.match(/\[UNRESOLVED\]/g)?.length || 0).toBeLessThan(2);
    }
  });
});

describe("Product Draft quality gate", () => {
  it("persists FAILED and creates no READY artifacts when all six documents are fallback placeholders", async () => {
    transactionMock.draftGeneration.create.mockClear();
    transactionMock.artifact.create.mockClear();
    aiGateway.runArtifactComposer.mockReset();
    aiGateway.runArtifactComposer.mockResolvedValue({});
    const state = createInitialProjectState({
      id: "quality-gate-failure",
      name: "Cashflow",
      rawIdea: "aplikasi untuk mencatat duit masuk dan keluar",
    });

    await expect(composeDraftArtifacts("project-1", 8, state)).rejects.toThrow(
      /quality gate/i,
    );

    expect(transactionMock.draftGeneration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
    expect(transactionMock.artifact.create).not.toHaveBeenCalled();
  });

  it("repairs only the malformed document and preserves the five substantive documents", async () => {
    transactionMock.draftGeneration.create.mockClear();
    transactionMock.artifact.create.mockClear();
    const valid = malformedLunaOutput().documents;
    aiGateway.runArtifactComposer.mockReset();
    aiGateway.runArtifactComposer
      .mockResolvedValueOnce({ ...valid, DESIGN_BRIEF: {} })
      .mockResolvedValueOnce({ ...valid, DESIGN_BRIEF: valid.DESIGN_BRIEF });
    const state = createInitialProjectState({
      id: "quality-gate-repair",
      name: "Cashflow",
      rawIdea: "aplikasi untuk mencatat duit masuk dan keluar",
    });

    await composeDraftArtifacts("project-1", 9, state);

    expect(aiGateway.runArtifactComposer).toHaveBeenCalledTimes(2);
    expect(
      aiGateway.runArtifactComposer.mock.calls[1][0].requestedDocumentTypes,
    ).toEqual(["DESIGN_BRIEF"]);
    expect(transactionMock.draftGeneration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETE" }),
      }),
    );
    expect(transactionMock.artifact.create).toHaveBeenCalledTimes(6);
  });
});

describe("Product Draft artifact current state", () => {
  const artifact = {
    id: "artifact-1",
    type: "PRD",
    status: "READY",
    content: "# PRD",
    version: 3,
    canonicalVersion: 8,
    generatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  it("marks matching canonical versions current and mismatches stale", () => {
    expect(publicDraftArtifact(artifact, 8).current).toBe(true);
    expect(publicDraftArtifact(artifact, 9).current).toBe(false);
  });
});

describe("legacy Product Draft accessor coherence", () => {
  const types = [
    "BRD",
    "PRD",
    "ERD",
    "USER_FLOWS",
    "SCREEN_MAP",
    "DESIGN_BRIEF",
  ];
  const rows = (version: number) =>
    types.map((type) => ({
      id: `${type}-${version}`,
      type,
      status: "READY",
      content: `${type}-${version}`,
      version,
      canonicalVersion: null,
      generatedAt: new Date("2026-01-01T00:00:00.000Z"),
    }));

  it("rejects mixed legacy versions and selects a coherent set", () => {
    const mixed = [...rows(1).slice(0, 3), ...rows(2).slice(3)];
    expect(selectLatestLegacyDraftArtifacts(mixed)).toBeNull();
    const selected = selectLatestLegacyDraftArtifacts(rows(2));
    expect(selected?.every((row) => row.version === 2)).toBe(true);
  });
});

describe("draft generation selection across canonical versions", () => {
  it("keeps the latest complete stale generation visible", () => {
    const artifact = (type: string) => ({
      id: type,
      type,
      status: "READY",
      content: type,
      version: 1,
      canonicalVersion: 5,
      generatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const complete = typesForTest().map(artifact);
    const generations = [
      {
        id: "g1",
        canonicalVersion: 4,
        generationNumber: 1,
        status: "COMPLETE",
        artifacts: complete,
      },
      {
        id: "g2",
        canonicalVersion: 5,
        generationNumber: 2,
        status: "COMPLETE",
        artifacts: complete,
      },
    ];
    expect(selectLatestCompleteDraftGeneration(generations, 6)?.id).toBe("g2");
  });
});

function typesForTest() {
  return ["BRD", "PRD", "ERD", "USER_FLOWS", "SCREEN_MAP", "DESIGN_BRIEF"];
}
