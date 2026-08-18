import type { ProjectState, RequirementNode } from "../schema";

/** Stable CRM discovery order — magic-moment queue for multi-brand / multi-unit ops. */
export const CRM_DECISION_ORDER = [
  "customer_identity",
  "sales_visibility",
  "lead_ownership",
  "quotation_branding",
  "duplicate_handling",
] as const;

export type CrmDecisionTopic = (typeof CRM_DECISION_ORDER)[number];

export const CRM_DECISION_META: Record<
  CrmDecisionTopic,
  {
    category: RequirementNode["category"];
    title: string;
    description: string;
    priority: number;
    riskWeight: number;
    affects: string[];
    inventWarning: string;
  }
> = {
  customer_identity: {
    category: "DATA",
    title: "Customer identity across brands",
    description:
      "Whether one customer has one company-wide identity or a separate identity for each brand.",
    priority: 10,
    riskWeight: 10,
    affects: [
      "customer model",
      "cross-unit search",
      "duplicate detection",
      "permissions",
      "quotation ownership",
    ],
    inventWarning:
      "Do not invent whether customers are company-wide or split per brand.",
  },
  sales_visibility: {
    category: "PERMISSIONS",
    title: "Sales visibility boundaries",
    description:
      "What brand-specific sales teams can see and what the owner can see across all brands.",
    priority: 10,
    riskWeight: 10,
    affects: [
      "sales permissions",
      "owner visibility",
      "search scope",
      "navigation",
    ],
    inventWarning:
      "Do not invent cross-brand visibility rules for sales or owner roles.",
  },
  lead_ownership: {
    category: "WORKFLOW",
    title: "Lead ownership",
    description:
      "Which brand and salesperson own a lead when it arrives through WhatsApp, Instagram, or the website.",
    priority: 9,
    riskWeight: 9,
    affects: [
      "lead ownership",
      "follow-up workflow",
      "sales permissions",
      "reassignment",
    ],
    inventWarning:
      "Do not invent lead ownership, first-touch, or reassignment rules.",
  },
  quotation_branding: {
    category: "DATA",
    title: "Quotation brand and ownership",
    description:
      "How a quotation keeps the selling brand, responsible salesperson, and customer history connected.",
    priority: 9,
    riskWeight: 9,
    affects: [
      "quotation ownership",
      "brand reporting",
      "customer history",
      "commission attribution",
    ],
    inventWarning:
      "Do not invent which brand owns a quotation or how history is attributed.",
  },
  duplicate_handling: {
    category: "DATA",
    title: "Duplicate customer handling",
    description:
      "What happens when the same phone number or social contact appears through more than one channel or brand.",
    priority: 8,
    riskWeight: 8,
    affects: [
      "duplicate detection",
      "customer model",
      "channel intake",
      "merge workflow",
    ],
    inventWarning:
      "Do not invent merge, flag, or ignore behavior for duplicate contacts.",
  },
};

export function crmOrderIndex(topic: string) {
  const index = CRM_DECISION_ORDER.indexOf(topic as CrmDecisionTopic);
  return index === -1 ? 999 : index;
}

export function sortByCrmQueue<
  T extends { id: string; priority: number; riskWeight: number },
>(nodes: T[]): T[] {
  return [...nodes].sort((left, right) => {
    const orderDelta = crmOrderIndex(left.id) - crmOrderIndex(right.id);
    if (orderDelta !== 0) return orderDelta;
    return right.priority * right.riskWeight - left.priority * left.riskWeight;
  });
}

export function acceptedDecision(state: ProjectState, topic: string) {
  return state.decisions.find(
    (decision) =>
      decision.topic === topic &&
      ["ACCEPTED", "PROPOSED"].includes(decision.status),
  );
}

function humanizeTopic(topic: string) {
  return topic.replace(/[_-]+/g, " ");
}

export function describeDecisionImpact(input: {
  topic: string;
  decision: string;
  affects?: string[];
}): { headline: string; detail: string } {
  const meta = CRM_DECISION_META[input.topic as CrmDecisionTopic];
  const affects = input.affects?.length
    ? input.affects
    : meta?.affects || [input.topic];
  const title = meta?.title || humanizeTopic(input.topic);
  const headline = `Locked for now — ${title}.`;
  const detail = `This affects ${affects.join(", ")}.`;
  return { headline, detail };
}

/** Five scripted CRM ideas used for golden-path demos and tests. */
export const CRM_GOLDEN_IDEAS = [
  {
    id: "marble-five-brands",
    rawIdea:
      "I want to build a CRM for five marble brands. Each brand has its own salespeople, but the owner should see everything. Leads come from WhatsApp, Instagram, and the website.",
    expectedFirstTopics: [
      "customer_identity",
      "sales_visibility",
      "lead_ownership",
    ] as const,
  },
  {
    id: "multi-brand-fashion",
    rawIdea:
      "CRM for 3 fashion brands under one holding company. Sales are brand-specific. Owner and finance need company-wide customer and quotation history.",
    expectedFirstTopics: [
      "customer_identity",
      "sales_visibility",
      "lead_ownership",
    ] as const,
  },
  {
    id: "indo-marmer-crm",
    rawIdea:
      "Gua mau bikin CRM untuk 5 brand marmer. Setiap brand punya sales sendiri, tapi owner harus bisa lihat semua. Lead dari WhatsApp, Instagram, sama website.",
    expectedFirstTopics: [
      "customer_identity",
      "sales_visibility",
      "lead_ownership",
    ] as const,
  },
  {
    id: "agency-multi-client-brands",
    rawIdea:
      "Build a sales CRM where one agency runs outreach for multiple client brands. Each brand has its own pipeline, but some customers buy from more than one brand.",
    expectedFirstTopics: [
      "customer_identity",
      "sales_visibility",
      "lead_ownership",
    ] as const,
  },
  {
    id: "dealer-network-crm",
    rawIdea:
      "CRM for a dealer network with several product lines treated as brands. Sales quotas and quotations are per brand. Duplicate phone numbers appear across channels every week.",
    expectedFirstTopics: [
      "customer_identity",
      "sales_visibility",
      "lead_ownership",
    ] as const,
  },
] as const;
