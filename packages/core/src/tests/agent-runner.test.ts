import { describe, expect, it } from "vitest";
import {
  AgentRunner,
  createDefaultToolRegistry,
  createInitialProjectState,
  deterministicDiscoveryPlanner,
} from "../index";

describe("AgentRunner", () => {
  it("executes a real tool observation before asking the user", async () => {
    const project = createInitialProjectState({
      id: "agent-runner",
      name: "Job search",
      rawIdea: "saya mau bangun aplikasi web untuk mencari pekerjaan",
    });
    const toolActivities: string[] = [];
    const runner = new AgentRunner(
      deterministicDiscoveryPlanner({
        id: "product-identity",
        text: "Aplikasi ini hanya untuk pencari kerja?",
        relatedRequirementIds: ["product_identity"],
        options: [{ id: "seekers", label: "Pencari kerja saja" }],
      }),
      createDefaultToolRegistry(),
    );

    const result = await runner.run({
      project,
      candidateTopics: ["product_identity"],
      questionForAction: (action) =>
        action.type === "ASK_USER"
          ? {
              id: "product-identity",
              topic: "product_identity",
              category: "PRODUCT",
              text: "Aplikasi untuk mencari pekerjaan ini hanya untuk pencari kerja?",
              contextReferences: ["rawIdea"],
              relatedRequirementIds: ["product_identity"],
              affects: ["actors"],
              answerType: "SINGLE_CHOICE",
              options: [
                {
                  id: "job_seeker_only",
                  label: "Pencari kerja saja",
                  description:
                    "Platform membantu user menemukan dan melacak lowongan.",
                },
                {
                  id: "two_sided_marketplace",
                  label: "Pencari kerja + perusahaan",
                  description:
                    "Perusahaan dapat memasang lowongan dan mengelola kandidat.",
                },
              ],
              priority: 10,
              reasonAsked: "Menentukan batas produk.",
            }
          : undefined,
      onToolRun: (activity) => {
        toolActivities.push(activity.action.type);
      },
    });

    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]).toMatchObject({
      action: { type: "CALL_TOOL", toolName: "project_state_read" },
      observation: { type: "TOOL:project_state_read" },
    });
    expect(toolActivities).toEqual(["CALL_TOOL"]);
    expect(result.finalAction).toMatchObject({ type: "ASK_USER" });
  });

  it("stops safely for an unknown tool instead of fabricating an observation", async () => {
    const project = createInitialProjectState({
      id: "unknown",
      name: "Unknown",
    });
    const runner = new AgentRunner(
      {
        nextAction: () => ({
          id: "bad",
          type: "CALL_TOOL",
          toolName: "missing",
          input: {},
        }),
      },
      createDefaultToolRegistry(),
    );

    await expect(runner.run({ project })).rejects.toThrow(
      "Unknown tool: missing",
    );
  });

  it("keeps a planner's tool sequence while rejecting a replacement question id", async () => {
    const project = createInitialProjectState({
      id: "planner-sequence",
      name: "Job search",
      rawIdea: "Saya mau bikin platform untuk mencari kerja.",
    });
    const calls: string[] = [];
    const runner = new AgentRunner(
      {
        nextAction: ({ iteration }) => {
          calls.push(`planner-${iteration}`);
          return iteration === 1
            ? {
                id: "read",
                type: "CALL_TOOL",
                toolName: "project_state_read",
                input: {},
              }
            : {
                id: "ask-canonical",
                type: "ASK_USER",
                questionId: "job-product-identity",
                question:
                  "Pada platform mencari kerja ini, siapa yang dapat menggunakan fitur utama?",
                relatedRequirementIds: ["product_identity"],
                options: [],
              };
        },
      },
      createDefaultToolRegistry(),
    );
    const canonical = {
      id: "job-product-identity",
      topic: "product_identity",
      category: "PRODUCT",
      text: "Pada platform mencari kerja ini, siapa yang dapat menggunakan fitur utama?",
      contextReferences: ["rawIdea"],
      relatedRequirementIds: ["product_identity"],
      affects: ["actors"],
      answerType: "SINGLE_CHOICE" as const,
      options: [
        {
          id: "job_seeker_only",
          label: "Pencari kerja saja",
          description: "Mencari dan menyimpan lowongan.",
        },
        {
          id: "two_sided_marketplace",
          label: "Pencari kerja + perusahaan",
          description: "Perusahaan juga memasang lowongan.",
        },
      ],
      priority: 10,
      reasonAsked: "Menentukan batas actor produk.",
    };
    const result = await runner.run({
      project,
      candidateTopics: ["product_identity"],
      questionForAction: (action) =>
        action.type === "ASK_USER" && action.questionId === canonical.id
          ? canonical
          : undefined,
    });

    expect(calls).toEqual(["planner-1", "planner-2"]);
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].action).toMatchObject({
      toolName: "project_state_read",
    });
    expect(result.finalAction).toMatchObject({
      type: "ASK_USER",
      questionId: canonical.id,
    });
  });

  it("rejects an ASK_USER planner action whose id differs from the canonical question", async () => {
    const project = createInitialProjectState({
      id: "planner-id-drift",
      name: "Job search",
      rawIdea: "Saya mau bikin platform untuk mencari kerja.",
    });
    const runner = new AgentRunner(
      {
        nextAction: () => ({
          id: "bad-ask",
          type: "ASK_USER",
          questionId: "generic-visibility",
          question: "Pertanyaan pengganti",
          relatedRequirementIds: ["product_identity"],
          options: [],
        }),
      },
      createDefaultToolRegistry(),
    );
    const canonical = {
      id: "job-product-identity",
      topic: "product_identity",
      category: "PRODUCT",
      text: "Pada platform mencari kerja ini, siapa yang dapat menggunakan fitur utama?",
      contextReferences: ["rawIdea"],
      relatedRequirementIds: ["product_identity"],
      affects: ["actors"],
      answerType: "SINGLE_CHOICE" as const,
      options: [
        {
          id: "job_seeker_only",
          label: "Pencari kerja saja",
          description: "Mencari lowongan.",
        },
        {
          id: "two_sided_marketplace",
          label: "Pencari kerja + perusahaan",
          description: "Perusahaan memasang lowongan.",
        },
      ],
      priority: 10,
      reasonAsked: "Menentukan batas actor produk.",
    };
    await expect(
      runner.run({
        project,
        candidateTopics: ["product_identity"],
        questionForAction: () => canonical,
      }),
    ).rejects.toThrow(/canonical question id/i);
  });
});
