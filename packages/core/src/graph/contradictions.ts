import { ProjectState, Contradiction } from "../schema";
import { acceptedDecision } from "../questions/crm-catalog";

type ContradictionRule = {
  id: string;
  check: (state: ProjectState) => Contradiction | null;
};

function decisionValue(state: ProjectState, topic: string) {
  return acceptedDecision(state, topic)?.decision?.toLowerCase() || "";
}

export const rules: ContradictionRule[] = [
  {
    id: "internal-vs-public",
    check: (state) => {
      const internal = state.targetUsers.some((user) =>
        /internal|employee|warehouse staff/i.test(user),
      );
      const publicRegistration = state.features.some((feature) =>
        /public registration|self-serve|anyone can sign up/i.test(feature),
      );
      if (!internal || !publicRegistration) return null;
      return {
        id: "internal-vs-public",
        severity: "BLOCKING",
        conflictingFields: ["targetUsers", "features"],
        explanation:
          "The project names internal users but also requires public self-registration.",
        recommendedResolution:
          "Choose invite-only access for internal users or explicitly make the product public.",
        status: "OPEN",
      };
    },
  },
  {
    id: "no-login-vs-private-data",
    check: (state) => {
      const anonymous = state.features.some((feature) =>
        /no login|anonymous/i.test(feature),
      );
      const privateData = state.features.some((feature) =>
        /private profile|private customer|personal dashboard/i.test(feature),
      );
      if (!anonymous || !privateData) return null;
      return {
        id: "no-login-vs-private-data",
        severity: "BLOCKING",
        conflictingFields: ["features", "permissions"],
        explanation:
          "The project requests anonymous access while also requiring private user-specific data.",
        recommendedResolution:
          "Define an identity boundary or make the data non-personal.",
        status: "OPEN",
      };
    },
  },
  {
    id: "single-location-vs-transfers",
    check: (state) => {
      const oneLocation = state.entities.some((entity) =>
        /one warehouse|single warehouse/i.test(entity),
      );
      const transfers = state.workflows.some((workflow) =>
        /transfer|move.*warehouse/i.test(workflow),
      );
      if (!oneLocation || !transfers) return null;
      return {
        id: "single-location-vs-transfers",
        severity: "WARNING",
        conflictingFields: ["entities", "workflows"],
        explanation:
          "The project describes one location but also requires cross-location transfers.",
        recommendedResolution:
          "Confirm whether multiple locations are in scope for the first build.",
        status: "OPEN",
      };
    },
  },
  {
    id: "crm-unit-customers-vs-open-sales",
    check: (state) => {
      const identity = decisionValue(state, "customer_identity");
      const visibility = decisionValue(state, "sales_visibility");
      if (!identity || !visibility) return null;
      const separateCustomers =
        /unit_specific|separate|per_brand|per-brand/.test(identity);
      const openSales = /all_sales_all_brands|all brands/.test(visibility);
      if (!separateCustomers || !openSales) return null;
      return {
        id: "crm-unit-customers-vs-open-sales",
        severity: "WARNING",
        conflictingFields: ["decisions.customer_identity", "decisions.sales_visibility"],
        explanation:
          "Customers are separate per brand, but every salesperson can see all brands. That usually creates confusing ownership and history.",
        recommendedResolution:
          "Either share customer identity company-wide, or keep sales visibility brand-scoped.",
        status: "OPEN",
      };
    },
  },
  {
    id: "crm-shared-customer-vs-no-dedupe",
    check: (state) => {
      const identity = decisionValue(state, "customer_identity");
      const duplicates = decisionValue(state, "duplicate_handling");
      if (!identity || !duplicates) return null;
      const shared = /company_wide|shared|across/.test(identity);
      const neverMerge =
        /never|no[_ -]?merge|ignore duplicates|biarkan saja|biarkan/.test(
          duplicates,
        );
      if (!shared || !neverMerge) return null;
      return {
        id: "crm-shared-customer-vs-no-dedupe",
        severity: "WARNING",
        conflictingFields: [
          "decisions.customer_identity",
          "decisions.duplicate_handling",
        ],
        explanation:
          "Customer identity is company-wide, but duplicate handling never reconciles matching contacts. Shared identity will rot quickly.",
        recommendedResolution:
          "Add at least a duplicate flag-for-review step, or accept separate brand identities.",
        status: "OPEN",
      };
    },
  },
  {
    id: "crm-owner-global-vs-brand-only-all-roles",
    check: (state) => {
      const visibility = decisionValue(state, "sales_visibility");
      const wantsOwnerGlobal =
        /owner.*all|owner.*global|owner harus bisa lihat semua|owner should see/i.test(
          state.rawIdea,
        ) ||
        state.permissions.some((item) =>
          /owner sees all|owner lihat semua/i.test(item),
        );
      if (!visibility || !wantsOwnerGlobal) return null;
      const brandOnlyEveryone =
        /brand_scoped|brand-only|own brand only/.test(visibility) &&
        !/owner_all|owner sees all|owner_all_sales/.test(visibility);
      // Only flag pure brand_scoped choices that exclude owner-all wording.
      if (!brandOnlyEveryone) return null;
      if (/owner_all/.test(visibility)) return null;
      return {
        id: "crm-owner-global-vs-brand-only-all-roles",
        severity: "WARNING",
        conflictingFields: ["rawIdea", "decisions.sales_visibility"],
        explanation:
          "The idea says the owner needs a global view, but visibility is locked to brand-only for everyone.",
        recommendedResolution:
          "Keep sales brand-scoped while giving the owner cross-brand access.",
        status: "OPEN",
      };
    },
  },
  {
    id: "crm-quotation-brand-vs-shared-history",
    check: (state) => {
      const identity = decisionValue(state, "customer_identity");
      const quotation = decisionValue(state, "quotation_branding");
      if (!identity || !quotation) return null;
      const separateCustomers =
        /unit_specific|separate|per_brand|per-brand/.test(identity);
      const sharedQuotationHistory =
        /shared history|company.wide quotation|one quotation history/.test(
          quotation,
        );
      if (!separateCustomers || !sharedQuotationHistory) return null;
      return {
        id: "crm-quotation-brand-vs-shared-history",
        severity: "WARNING",
        conflictingFields: [
          "decisions.customer_identity",
          "decisions.quotation_branding",
        ],
        explanation:
          "Customers are split per brand, but quotations assume one shared history. Reporting and ownership will conflict.",
        recommendedResolution:
          "Keep quotation history brand-scoped, or switch to company-wide customer identity.",
        status: "OPEN",
      };
    },
  },
  {
    id: "crm-shared-pool-vs-brand-scoped-visibility",
    check: (state) => {
      const ownership = decisionValue(state, "lead_ownership");
      const visibility = decisionValue(state, "sales_visibility");
      if (!ownership || !visibility) return null;
      const sharedPool = /shared_sales_pool|shared pool|round.?robin/.test(
        ownership,
      );
      const brandScopedVisibility =
        /owner_all_sales_brand_scoped|brand_scoped|brand-only|own brand/.test(
          visibility,
        ) && !/all_sales_all_brands/.test(visibility);
      if (!sharedPool || !brandScopedVisibility) return null;
      return {
        id: "crm-shared-pool-vs-brand-scoped-visibility",
        severity: "WARNING",
        conflictingFields: [
          "decisions.lead_ownership",
          "decisions.sales_visibility",
        ],
        explanation:
          "Leads are handled by a shared cross-brand sales pool, but sales visibility is brand-scoped. Pool members cannot see the leads they are supposed to work.",
        recommendedResolution:
          "Either assign leads to brand-owned sales teams, or open sales visibility for the shared pool.",
        status: "OPEN",
      };
    },
  },
];

export function detectContradictions(state: ProjectState): Contradiction[] {
  return rules.flatMap((rule) => {
    const result = rule.check(state);
    return result ? [result] : [];
  });
}
