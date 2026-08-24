import { describe, expect, it } from "vitest";
import { createInitialProjectState } from "../schema/project";
import { generateGenericDecisionCandidates } from "../questions/candidate-generator";

function topics(rawIdea: string, patch: Partial<ReturnType<typeof createInitialProjectState>> = {}) {
  return generateGenericDecisionCandidates({
    ...createInitialProjectState({ id: rawIdea.slice(0, 8), name: "Test", rawIdea }),
    ...patch,
  }).map((candidate) => candidate.topic);
}

describe("product-shape relevance gating", () => {
  it("keeps a personal calculator out of enterprise decision archetypes", () => {
    const result = topics("gua mau buat kalkulator khusus untuk diri gua sendiri, yg ngitungnya ga pernah minus. nambah terus", {
      targetUsers: ["diri sendiri"],
      entities: ["calculation"],
      features: ["clamp negative result to zero", "addition"],
    });
    expect(result).not.toEqual(expect.arrayContaining([
      "visibility_boundary", "role_boundaries", "ownership_boundary", "assignment_behavior",
      "lifecycle_transitions", "retention_deletion", "history_auditability",
    ]));
  });

  it.each([
    ["timer pribadi untuk latihan", ["timer"], ["start stop reset"]],
    ["catatan pribadi tanpa dibagikan", ["note"], ["write notes"]],
    ["unit converter pribadi", ["conversion"], ["convert units"]],
  ])("protects simple utility %s", (rawIdea, entities, features) => {
    const result = topics(rawIdea, { targetUsers: ["diri sendiri"], entities, features });
    expect(result).not.toEqual(expect.arrayContaining([
      "visibility_boundary", "role_boundaries", "assignment_behavior", "lifecycle_transitions", "retention_deletion",
    ]));
  });

  it("makes visibility relevant when a calculator is explicitly shared", () => {
    const result = topics("calculator pribadi, share calculation history with my team", {
      targetUsers: ["owner", "team"], entities: ["calculation", "history"], features: ["share history"],
    });
    expect(result).toContain("visibility_boundary");
  });

  it("makes retention and history relevant when permanent calculation history is explicit", () => {
    const result = topics("calculator pribadi, save every calculation permanently", {
      targetUsers: ["owner"], entities: ["calculation", "history"], features: ["save every calculation permanently"],
    });
    expect(result).toEqual(expect.arrayContaining(["retention_deletion", "history_auditability"]));
  });

  it("preserves CRM, rental, and inventory depth", () => {
    expect(topics("CRM untuk sales team manage leads customer and follow-up history", {
      targetUsers: ["sales", "manager"], roles: ["sales", "manager"], entities: ["lead", "customer"], workflows: ["assign lead", "move lead status"], features: ["duplicate detection", "history"],
    })).toEqual(expect.arrayContaining(["visibility_boundary", "ownership_boundary", "duplicate_semantics", "lifecycle_transitions"]));
    expect(topics("rental mobil untuk booking kendaraan lintas cabang", {
      targetUsers: ["staff", "manager"], roles: ["staff", "manager"], entities: ["booking", "vehicle"], workflows: ["booking vehicle", "transfer branch"], features: ["availability", "status"],
    })).toEqual(expect.arrayContaining(["resource_conflict_policy", "lifecycle_transitions", "cross_boundary_behavior"]));
    expect(topics("inventory gudang dengan transfer stock dan movement history", {
      targetUsers: ["warehouse staff", "manager"], roles: ["warehouse staff", "manager"], entities: ["stock", "movement"], workflows: ["transfer stock"], features: ["history", "reservation"],
    })).toEqual(expect.arrayContaining(["history_auditability", "identity_boundary", "cross_boundary_behavior"]));
  });
});
