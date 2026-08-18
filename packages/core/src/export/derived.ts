import type {
  EntityRelationship,
  ProjectState,
} from "../schema";
import { acceptedDecision } from "../questions/crm-catalog";

const UNRESOLVED = "[UNRESOLVED]";

function d(state: ProjectState, topic: string) {
  return acceptedDecision(state, topic)?.decision || "";
}

/** Human-readable facts derived from accepted decisions — reduces lazy UNRESOLVED. */
export function derivedPermissionLines(state: ProjectState): string[] {
  const lines = [...state.permissions];
  const visibility = d(state, "sales_visibility");
  if (visibility === "owner_all_sales_brand_scoped") {
    lines.push(
      "Salespeople can access only their brand's customers, leads, follow-ups, and quotations.",
      "Owner can access customers, leads, follow-ups, and quotations across all brands.",
    );
  } else if (visibility === "all_sales_all_brands") {
    lines.push("All sales roles can access customer and pipeline data across brands.");
  } else if (visibility === "brand_scoped") {
    lines.push("All non-owner access is limited to the user's brand.");
  }

  const ownership = d(state, "lead_ownership");
  if (ownership === "owning_brand_sales") {
    lines.push(
      "Lead follow-up ownership starts with the brand/sales team that first receives the lead.",
    );
  } else if (ownership === "shared_sales_pool") {
    lines.push("Leads are assigned from a shared sales pool rather than a single brand inbox.");
  }
  return unique(lines);
}

export function derivedBusinessRuleLines(state: ProjectState): string[] {
  const lines = [...state.businessRules];
  const identity = d(state, "customer_identity");
  if (identity === "company_wide") {
    lines.push(
      "A customer has one company-wide identity; brand context lives on leads and quotations.",
    );
  } else if (identity === "unit_specific") {
    lines.push("Customer identity is separate per brand; cross-brand history is not automatic.");
  }

  const quotation = d(state, "quotation_branding");
  if (quotation === "quotation_uses_owning_brand") {
    lines.push("A quotation is branded and attributed to the lead-owning brand.");
  } else if (quotation === "customer_chooses_brand") {
    lines.push("The customer chooses the brand during quotation creation.");
  }

  const duplicates = d(state, "duplicate_handling");
  if (duplicates === "merge_with_review") {
    lines.push(
      "Matching phone/social contacts create a duplicate signal that requires human merge review.",
    );
  } else if (duplicates === "keep_separate_until_review") {
    lines.push(
      "Potential duplicates stay separate until a human review decides otherwise.",
    );
  }
  return unique(lines);
}

export function derivedDataOwnershipLines(state: ProjectState): string[] {
  const lines: string[] = [];
  const identity = d(state, "customer_identity");
  if (identity === "company_wide") {
    lines.push("Customer master data is company-owned; brand is a dimension on commercial records.");
  } else if (identity === "unit_specific") {
    lines.push("Customer master data is brand-owned; no automatic shared customer profile.");
  }

  const quotation = d(state, "quotation_branding");
  if (quotation) {
    lines.push(`Quotation commercial ownership follows decision: ${quotation}.`);
  }

  const ownership = d(state, "lead_ownership");
  if (ownership) {
    lines.push(`Lead operational ownership follows decision: ${ownership}.`);
  }

  return lines.length ? lines : [UNRESOLVED];
}

export type ResolvedEntityRelationship = EntityRelationship & {
  fromEntity: string;
  toEntity: string;
  source: "CANONICAL" | "DECISION_DERIVED";
};

function normalizedEntity(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findEntity(state: ProjectState, reference: string) {
  const target = normalizedEntity(reference);
  if (!target) return undefined;
  return state.entities.find((entity) => {
    const candidate = normalizedEntity(entity);
    return (
      candidate === target ||
      candidate.startsWith(`${target} `) ||
      candidate.endsWith(` ${target}`)
    );
  });
}

function relationshipKey(from: string, to: string, cardinality: string) {
  return `${normalizedEntity(from)}|${normalizedEntity(to)}|${cardinality}`;
}

function collectRelationship(
  state: ProjectState,
  relationships: ResolvedEntityRelationship[],
  seen: Set<string>,
  input: EntityRelationship,
  source: ResolvedEntityRelationship["source"],
) {
  const fromEntity = findEntity(state, input.from);
  const toEntity = findEntity(state, input.to);
  // A relationship with an unknown endpoint is not rendered. Adding the
  // missing endpoint would turn an unresolved canonical fact into invention.
  if (!fromEntity || !toEntity) return;
  const key = relationshipKey(fromEntity, toEntity, input.cardinality);
  if (seen.has(key)) return;
  seen.add(key);
  relationships.push({
    ...input,
    fromEntity,
    toEntity,
    source,
  });
}

/**
 * Return only relationships whose endpoints are canonical entities. Explicit
 * state relationships win; accepted decisions may derive a relationship only
 * when every endpoint is already present in `state.entities`.
 */
export function derivedRelationships(
  state: ProjectState,
): ResolvedEntityRelationship[] {
  const relationships: ResolvedEntityRelationship[] = [];
  const seen = new Set<string>();

  for (const relationship of state.relationships) {
    collectRelationship(state, relationships, seen, relationship, "CANONICAL");
  }

  const addDecisionRelationship = (
    from: string,
    to: string,
    cardinality: EntityRelationship["cardinality"],
    label?: string,
  ) =>
    collectRelationship(
      state,
      relationships,
      seen,
      { from, to, cardinality, label },
      "DECISION_DERIVED",
    );

  const identity = d(state, "customer_identity");
  if (identity === "company_wide") {
    addDecisionRelationship(
      "Brand",
      "Customer",
      "ONE_TO_MANY",
      "customer may relate to many brands via leads or quotations",
    );
    addDecisionRelationship("Customer", "Lead", "ONE_TO_MANY");
    addDecisionRelationship("Customer", "Quotation", "ONE_TO_MANY");
    addDecisionRelationship("Lead", "Brand", "MANY_TO_ONE");
    addDecisionRelationship("Quotation", "Brand", "MANY_TO_ONE");
  } else if (identity === "unit_specific") {
    addDecisionRelationship(
      "Brand",
      "Customer",
      "ONE_TO_MANY",
      "customers do not automatically span brands",
    );
    addDecisionRelationship("Customer", "Lead", "ONE_TO_MANY");
    addDecisionRelationship("Customer", "Quotation", "ONE_TO_MANY");
  }

  // SalesOwner is deliberately not synthesized from a decision. It is only
  // rendered when that role/entity was explicitly added to canonical state.
  if (d(state, "lead_ownership")) {
    addDecisionRelationship("Lead", "SalesOwner", "MANY_TO_ONE", "operational owner");
  }
  if (d(state, "quotation_branding")) {
    addDecisionRelationship("Quotation", "Brand", "MANY_TO_ONE");
    addDecisionRelationship("Quotation", "Customer", "MANY_TO_ONE");
  }

  return relationships;
}

function relationshipCardinalityLabel(
  cardinality: EntityRelationship["cardinality"],
) {
  switch (cardinality) {
    case "ONE_TO_ONE":
      return "1—1";
    case "ONE_TO_MANY":
      return "1—*";
    case "MANY_TO_ONE":
      return "*—1";
    case "MANY_TO_MANY":
      return "*—*";
  }
}

export function relationshipLine(relationship: ResolvedEntityRelationship) {
  const label = relationship.label ? ` (${relationship.label})` : "";
  return `${relationship.fromEntity} ${relationshipCardinalityLabel(relationship.cardinality)} ${relationship.toEntity}${label}`;
}

export function derivedRelationshipLines(state: ProjectState): string[] {
  const relationships = derivedRelationships(state);
  return relationships.length
    ? relationships.map(relationshipLine)
    : [UNRESOLVED];
}

export function relationshipsForEntity(
  state: ProjectState,
  entity: string,
): string[] {
  const target = normalizedEntity(entity);
  return derivedRelationships(state)
    .filter(
      (relationship) =>
        normalizedEntity(relationship.fromEntity) === target ||
        normalizedEntity(relationship.toEntity) === target,
    )
    .map(relationshipLine);
}

export function mermaidRelationshipMarkers(
  cardinality: EntityRelationship["cardinality"],
): [string, string] {
  switch (cardinality) {
    case "ONE_TO_ONE":
      return ["||", "||"];
    case "ONE_TO_MANY":
      return ["||", "o{"];
    case "MANY_TO_ONE":
      return ["}o", "||"];
    case "MANY_TO_MANY":
      return ["}o", "o{"];
  }
}

export function derivedEdgeCaseLines(state: ProjectState): string[] {
  const lines: string[] = [];
  if (d(state, "duplicate_handling")) {
    lines.push(
      "Same phone/social identity arrives from two channels or brands — follow duplicate_handling decision.",
    );
  }
  if (d(state, "customer_identity") === "company_wide") {
    lines.push(
      "Customer already exists under another brand — reuse company-wide customer and attach brand on the commercial record.",
    );
  }
  if (d(state, "sales_visibility") === "owner_all_sales_brand_scoped") {
    lines.push(
      "Sales user attempts to open another brand's customer — deny; owner override remains available.",
    );
  }
  return lines;
}

export function derivedNonGoals(state: ProjectState): string[] {
  const lines = [
    "Do not invent undecided multi-brand identity, permission, or ownership rules.",
  ];
  if (!d(state, "duplicate_handling")) {
    lines.push("Automatic silent merge of customers is out of scope until decided.");
  }
  return lines;
}

export function listOrUnresolved(values: string[]) {
  return values.length ? values.map((value) => `- ${value}`).join("\n") : UNRESOLVED;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
