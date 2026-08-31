import { describe, expect, it } from "vitest";
import {
  ArtifactComposerOutputSchema,
  assessArtifactComposerQuality,
  buildArtifactComposerInput,
  createInitialProjectState,
  normalizeArtifactComposerOutput,
  type ArtifactComposerOutput,
} from "../index";

function sparseState() {
  const state = createInitialProjectState({
    id: "composer-test",
    name: "Laundry desk",
    rawIdea: "A laundry app for a small shop",
  });
  state.targetUsers = ["owner"];
  state.features = ["track laundry orders"];
  state.provenance = {
    "targetUsers.owner": {
      source: "USER",
      confidence: "EXPLICIT",
      evidence: "for the owner",
    },
    "features.track laundry orders": {
      source: "USER",
      confidence: "EXPLICIT",
      evidence: "track laundry orders",
    },
    "features.inferred payment": {
      source: "AGENT_INFERENCE",
      confidence: "STRONGLY_INFERRED",
      evidence: "likely payment support",
    },
  };
  state.assumptions = [
    {
      id: "a1",
      statement: "Customers may receive pickup reminders",
      confidence: "STRONGLY_INFERRED",
      impact: "MEDIUM",
      source: "AGENT_INFERENCE",
      resolved: false,
    },
  ];
  state.openQuestions = ["Should the shop support delivery?"];
  return state;
}

function outputWith(item: Record<string, unknown>): ArtifactComposerOutput {
  const document = {
    title: "Draft",
    summary: "A useful draft summary.",
    sections: [
      {
        id: "overview",
        title: "Overview",
        paragraphs: ["A coherent paragraph."],
        items: [{ id: "claim-1", text: "A claim", ...item }],
      },
    ],
  };
  return ArtifactComposerOutputSchema.parse({
    BRD: document,
    PRD: document,
    ERD: document,
    USER_FLOWS: document,
    SCREEN_MAP: document,
    DESIGN_BRIEF: document,
  });
}

describe("Artifact Composer context", () => {
  it("grounds confirmed fields only when explicit user provenance exists", () => {
    const input = buildArtifactComposerInput(sparseState(), {
      recent: [{ role: "user", text: "Owner tracks laundry orders" }],
      fullUseful: [{ role: "user", text: "A laundry app for a small shop" }],
    });

    expect(input.rawIdea).toContain("laundry");
    expect(input.canonicalTruth.facts.map((fact) => fact.path)).toEqual(
      expect.arrayContaining(["targetUsers", "features"]),
    );
    expect(input.canonicalTruth.facts.map((fact) => fact.value)).not.toContain(
      "inferred payment",
    );
    expect(
      input.groundedUserFacts.every((fact) => fact.source === "USER"),
    ).toBe(true);
    expect(
      input.canonicalTruth.facts.every(
        (fact) => fact.confidence === "EXPLICIT",
      ),
    ).toBe(true);
  });
});

describe("Artifact Composer quality gate", () => {
  it("rejects a six-document output when every document is only the fallback placeholder", () => {
    const input = buildArtifactComposerInput(sparseState());
    const output = normalizeArtifactComposerOutput({}, input);

    expect(assessArtifactComposerQuality(output)).toMatchObject({
      meaningful: false,
      malformedTypes: [
        "BRD",
        "PRD",
        "ERD",
        "USER_FLOWS",
        "SCREEN_MAP",
        "DESIGN_BRIEF",
      ],
    });
  });

  it("accepts a substantive cashflow MVP across all six documents", () => {
    const output = ArtifactComposerOutputSchema.parse({
      BRD: {
        title: "Cashflow BRD",
        summary: "Track money in and out.",
        sections: [
          {
            id: "goal",
            title: "Goal",
            paragraphs: ["A small cashflow tracker."],
            items: [
              {
                id: "income-expense",
                text: "Record income and expense transactions.",
                label: "PROPOSAL",
                evidenceIds: [],
              },
            ],
          },
        ],
      },
      PRD: {
        title: "Cashflow PRD",
        summary: "Support balance and history.",
        sections: [
          {
            id: "mvp",
            title: "MVP",
            paragraphs: ["Keep the first release focused."],
            items: [
              {
                id: "balance",
                text: "Show current balance and transaction history.",
                label: "PROPOSAL",
                evidenceIds: [],
              },
            ],
          },
        ],
      },
      ERD: {
        title: "Cashflow ERD",
        summary: "Model transaction and category records.",
        sections: [
          {
            id: "entities",
            title: "Entities",
            paragraphs: ["Store transaction data."],
            items: [
              {
                id: "transaction",
                text: "Transaction belongs to a Category.",
                label: "PROPOSAL",
                evidenceIds: [],
              },
            ],
          },
        ],
      },
      USER_FLOWS: {
        title: "Cashflow User Flows",
        summary: "A user records and reviews money movement.",
        sections: [
          {
            id: "flow",
            title: "Primary flow",
            paragraphs: ["Start from the dashboard."],
            items: [
              {
                id: "record",
                text: "Open add transaction, choose income or expense, save, then review history.",
                label: "PROPOSAL",
                evidenceIds: [],
              },
            ],
          },
        ],
      },
      SCREEN_MAP: {
        title: "Cashflow Screen Map",
        summary: "Three focused screens.",
        sections: [
          {
            id: "screens",
            title: "Screens",
            paragraphs: ["Keep navigation simple."],
            items: [
              {
                id: "dashboard",
                text: "Dashboard, Add Transaction, and History screens.",
                label: "PROPOSAL",
                evidenceIds: [],
              },
            ],
          },
        ],
      },
      DESIGN_BRIEF: {
        title: "Cashflow Design Brief",
        summary: "Prioritize balance and fast entry.",
        sections: [
          {
            id: "direction",
            title: "Direction",
            paragraphs: ["Use a calm financial overview."],
            items: [
              {
                id: "visual",
                text: "Use balance hierarchy with clear income and expense states.",
                label: "PROPOSAL",
                evidenceIds: [],
              },
            ],
          },
        ],
      },
    });

    expect(assessArtifactComposerQuality(output)).toMatchObject({
      meaningful: true,
      malformedTypes: [],
    });
  });
});

describe("Artifact Composer normalization", () => {
  it("downgrades a confirmed claim with unsupported evidence and explains why", () => {
    const input = buildArtifactComposerInput(sparseState());
    const output = normalizeArtifactComposerOutput(
      outputWith({ label: "CONFIRMED", evidenceIds: ["unknown:evidence"] }),
      input,
    );
    const item = output.BRD.sections[0].items[0];
    expect(item.label).toBe("PROPOSAL");
    expect(item.rationale).toMatch(/unsupported|evidence/i);
  });

  it("does not permit non-user provenance to remain CONFIRMED", () => {
    const input = buildArtifactComposerInput(sparseState());
    input.canonicalTruth.facts.push({
      id: "agent:payment",
      path: "features",
      value: "payment automation",
      source: "AGENT_INFERENCE",
      confidence: "STRONGLY_INFERRED",
      evidence: "inferred",
    });
    const output = normalizeArtifactComposerOutput(
      outputWith({ label: "CONFIRMED", evidenceIds: ["agent:payment"] }),
      input,
    );
    expect(output.BRD.sections[0].items[0].label).toBe("PROPOSAL");
  });

  it("validates all six documents and preserves valid labels", () => {
    const input = buildArtifactComposerInput(sparseState());
    const output = normalizeArtifactComposerOutput(
      outputWith({ label: "ASSUMPTION", evidenceIds: [] }),
      input,
    );
    expect(Object.keys(output)).toEqual([
      "BRD",
      "PRD",
      "ERD",
      "USER_FLOWS",
      "SCREEN_MAP",
      "DESIGN_BRIEF",
    ]);
    expect(output.DESIGN_BRIEF.sections[0].items[0].label).toBe("ASSUMPTION");
  });
  it("normalizes Luna document wrappers and markdown content independently", () => {
    const input = buildArtifactComposerInput(sparseState());
    const valid = outputWith({ label: "PROPOSAL", evidenceIds: [] });
    const output = normalizeArtifactComposerOutput(
      {
        documents: {
          BRD: { document: valid.BRD },
          PRD: {
            content:
              "# Product Requirements\n\nA focused product draft.\n\n## Scope\n\n- Keep the first workflow small.",
          },
          ERD: valid.ERD,
          USER_FLOWS: { artifact: valid.USER_FLOWS },
          SCREEN_MAP: valid.SCREEN_MAP,
          DESIGN_BRIEF: { data: valid.DESIGN_BRIEF },
        },
      },
      input,
    );

    expect(output.BRD.title).toBe("Draft");
    expect(output.PRD.title).toBe("Product Requirements");
    expect(output.PRD.sections[0].paragraphs[0]).toContain(
      "focused product draft",
    );
    expect(
      output.PRD.sections
        .flatMap((section) => [
          ...section.paragraphs,
          ...section.items.map((item) => item.text),
        ])
        .join(" "),
    ).toContain("Keep the first workflow small");
    expect(output.USER_FLOWS.title).toBe("Draft");
  });

  it("keeps five valid documents when one Luna document is malformed", () => {
    const input = buildArtifactComposerInput(sparseState());
    const valid = outputWith({ label: "PROPOSAL", evidenceIds: [] });
    const output = normalizeArtifactComposerOutput(
      { ...valid, DESIGN_BRIEF: { title: "", sections: null } },
      input,
    );

    expect(output.BRD.title).toBe("Draft");
    expect(output.PRD.summary).toBe("A useful draft summary.");
    expect(output.ERD.sections).toHaveLength(1);
    expect(output.USER_FLOWS.sections).toHaveLength(1);
    expect(output.SCREEN_MAP.sections).toHaveLength(1);
    expect(output.DESIGN_BRIEF.sections[0].items[0].label).toBe(
      "OPEN_QUESTION",
    );
  });
});
