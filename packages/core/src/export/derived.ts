import type { ProjectState } from "../schema";
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

export function derivedRelationshipLines(state: ProjectState): string[] {
  const lines: string[] = [];
  const identity = d(state, "customer_identity");
  if (identity === "company_wide") {
    lines.push("Brand 1—* Customer (customer may relate to many brands via leads/quotations)");
    lines.push("Customer 1—* Lead");
    lines.push("Customer 1—* Quotation");
    lines.push("Lead *—1 Brand");
    lines.push("Quotation *—1 Brand");
  } else if (identity === "unit_specific") {
    lines.push("Brand 1—* Customer (customers do not automatically span brands)");
    lines.push("Customer 1—* Lead");
    lines.push("Customer 1—* Quotation");
  }

  if (d(state, "lead_ownership")) {
    lines.push("Lead *—1 SalesOwner (or sales team)");
  }
  if (d(state, "quotation_branding")) {
    lines.push("Quotation *—1 Brand");
    lines.push("Quotation *—1 Customer");
  }

  if (!lines.length && state.entities.length > 1) {
    return [UNRESOLVED];
  }
  return lines.length ? lines : [UNRESOLVED];
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
