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
});
