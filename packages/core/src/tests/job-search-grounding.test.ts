import { describe, expect, it } from "vitest";
import {
  createInitialProjectState,
  genericQuestionForTopic,
  generateGenericDecisionCandidates,
} from "../index";

describe("job-search discovery grounding", () => {
  it("asks a foundational actor boundary before lifecycle and never binds lifecycle to mencari", () => {
    const state = createInitialProjectState({
      id: "job-search",
      name: "Job search platform",
      rawIdea: "saya mau bangun aplikasi web untuk mencari pekerjaan",
    });

    const candidates = generateGenericDecisionCandidates(state);
    expect(candidates[0]).toMatchObject({ topic: "product_identity" });
    expect(candidates.some((item) => item.topic === "lifecycle_transitions")).toBe(false);

    const question = genericQuestionForTopic(state, "product_identity");
    expect(question?.text).toMatch(/pencari kerja|perusahaan/i);
    expect(question?.options?.map((option) => option.label)).toEqual(
      expect.arrayContaining(["Pencari kerja saja", "Pencari kerja + perusahaan"]),
    );
  });
});
