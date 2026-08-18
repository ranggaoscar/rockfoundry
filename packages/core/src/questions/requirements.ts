import type {
  ProjectState,
  RequirementNode,
  RequirementStatus,
} from "../schema";
import {
  CRM_DECISION_META,
  CRM_DECISION_ORDER,
  sortByCrmQueue,
} from "./crm-catalog";
import { genericRequirementNodes } from "./candidate-generator";

export type DiscoveryDomain = "CRM" | "RENTAL" | "INVENTORY" | "GENERAL";

export type DiscoveryEvaluation = {
  evaluated: boolean;
  domain: DiscoveryDomain | null;
  requirements: RequirementNode[];
  topUnresolved: RequirementNode[];
  importantDecisionsRemaining: number | null;
  unresolvedTopics: string[];
};

function stateText(state: ProjectState) {
  return [
    state.rawIdea,
    state.name,
    state.normalizedSummary,
    state.productType,
    ...state.targetUsers,
    ...state.entities,
    ...state.features,
    ...state.workflows,
    ...state.integrations,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

type ScoredDomain = Exclude<DiscoveryDomain, "GENERAL">;

type DomainSignal = {
  pattern: RegExp;
  weight: number;
};

/**
 * Weighted multi-signal domain scoring.
 * Weak shared terms (quotation, transfer, branch) must not beat stronger
 * domain cores — that was the single-keyword misroute failure mode.
 */
const DOMAIN_SIGNALS: Record<ScoredDomain, DomainSignal[]> = {
  CRM: [
    {
      pattern: /\bcrm\b|customer relationship|sales pipeline|lead management/,
      weight: 6,
    },
    { pattern: /\bleads?\b|\bpipeline\b|follow[- ]?ups?/, weight: 3 },
    {
      pattern: /multi[- ]?brand|per brand|sales per brand|\b5 brand|five brand/,
      weight: 3,
    },
    { pattern: /sales team|salespeople|tim sales|sales staff/, weight: 2 },
    {
      pattern:
        /\bcustomer\b.*\b(brand|sales)\b|\b(brand|sales)\b.*\bcustomer\b/,
      weight: 2,
    },
    // Shared / weak — inventory can also say "quotation" or "reserve for quotation".
    { pattern: /\bquotation\b|\bquotes?\b/, weight: 1 },
  ],
  RENTAL: [
    { pattern: /\brental\b|\brent\b|\bsewa\b/, weight: 6 },
    { pattern: /car booking|booking mobil|rental car|rental mobil/, weight: 5 },
    { pattern: /\bvehicle\b|\bkendaraan\b|\bcars?\b/, weight: 3 },
    { pattern: /\bpickup\b|\breturn\b|late return|damage/, weight: 2 },
    { pattern: /\bcabang\b|\bbranch\b/, weight: 1 },
    { pattern: /\bbooking\b/, weight: 1 },
  ],
  INVENTORY: [
    {
      pattern: /\binventory\b|\bwarehouse\b|\bgudang\b|\bstock\b|\bstok\b/,
      weight: 6,
    },
    { pattern: /\bslab\b|\bmarmer\b|\bmarble\b(?!\s+crm)/, weight: 4 },
    { pattern: /multi[- ]?warehouse|tiga gudang|three warehouse/, weight: 3 },
    { pattern: /\bmovement\b|\btransfer\b|stock adjustment/, weight: 2 },
    { pattern: /\breservation\b|\breserve\b|\breservasi\b/, weight: 2 },
    { pattern: /meter persegi|square meter|quantity semantics/, weight: 2 },
  ],
};

const DOMAIN_ENTITY_BOOST: Record<ScoredDomain, RegExp> = {
  CRM: /customer|lead|quotation|brand|deal|opportunity/i,
  RENTAL: /vehicle|booking|branch|renter|car/i,
  INVENTORY: /warehouse|slab|stock|inventory|sku|bin/i,
};

export function scoreDiscoveryDomains(
  state: ProjectState,
): Record<ScoredDomain, number> {
  const text = stateText(state);
  const scores: Record<ScoredDomain, number> = {
    CRM: 0,
    RENTAL: 0,
    INVENTORY: 0,
  };

  for (const domain of Object.keys(DOMAIN_SIGNALS) as ScoredDomain[]) {
    for (const signal of DOMAIN_SIGNALS[domain]) {
      if (signal.pattern.test(text)) scores[domain] += signal.weight;
    }
    const entityHits = state.entities.filter((entity) =>
      DOMAIN_ENTITY_BOOST[domain].test(entity),
    ).length;
    scores[domain] += Math.min(3, entityHits);
  }

  return scores;
}

export function detectDiscoveryDomain(
  state: ProjectState,
): DiscoveryDomain | null {
  const scores = scoreDiscoveryDomains(state);
  const ranked = (Object.entries(scores) as [ScoredDomain, number][])
    .filter(([, score]) => score > 0)
    .sort((left, right) => right[1] - left[1]);

  if (ranked.length > 0) {
    const [topDomain, topScore] = ranked[0];
    const secondScore = ranked[1]?.[1] ?? 0;
    // Require a real signal and a clear winner when two domains both fire.
    if (topScore >= 3 && topScore >= secondScore + (secondScore >= 3 ? 2 : 0)) {
      return topDomain;
    }
    // Tie / weak margin with some signal: still prefer the top if clearly primary.
    if (topScore >= 5 && topScore > secondScore) return topDomain;
  }

  if (
    state.rawIdea.trim().length >= 18 ||
    state.entities.length > 0 ||
    state.targetUsers.length > 0
  )
    return "GENERAL";
  return null;
}

function hasDecision(state: ProjectState, topic: string) {
  return state.decisions.some(
    (decision) =>
      decision.topic === topic &&
      ["ACCEPTED", "PROPOSED"].includes(decision.status),
  );
}

function node(
  state: ProjectState,
  input: Omit<
    RequirementNode,
    "status" | "source" | "dependencies" | "confidence"
  >,
): RequirementNode {
  return {
    ...input,
    status: hasDecision(state, input.id) ? "ANSWERED" : "UNRESOLVED",
    source: "SYSTEM",
    dependencies: [],
    confidence: hasDecision(state, input.id) ? 100 : 0,
  };
}

const DOMAIN_PRIOR_TOPICS = new Set([
  ...CRM_DECISION_ORDER,
  "vehicle_location",
  "cross_branch_booking",
  "customer_identity",
  "vehicle_transfer",
  "pickup_return",
  "slab_identity",
  "warehouse_transfer",
  "movement_history",
  "reservation",
  "measurement_semantics",
]);

function withGenericCandidates(
  state: ProjectState,
  priorRequirements: RequirementNode[],
): RequirementNode[] {
  const generic = genericRequirementNodes(state)
    .filter(
      (candidate) =>
        !priorRequirements.some((prior) => prior.id === candidate.id),
    )
    .map((candidate) => ({
      ...candidate,
      // Domain priors remain the beachhead's high-risk opening. Generic
      // candidates still exist and become available after the prior queue,
      // but do not inflate the legacy "important domain decisions" count.
      priority: Math.min(7, candidate.priority),
    }));
  return [...priorRequirements, ...generic];
}

export function buildDiscoveryRequirements(
  state: ProjectState,
): RequirementNode[] {
  const domain = detectDiscoveryDomain(state);

  if (domain === "CRM") {
    return withGenericCandidates(
      state,
      CRM_DECISION_ORDER.map((topic) => {
        const meta = CRM_DECISION_META[topic];
        return node(state, {
          id: topic,
          category: meta.category,
          title: meta.title,
          description: meta.description,
          priority: meta.priority,
          riskWeight: meta.riskWeight,
        });
      }),
    );
  }

  if (domain === "RENTAL") {
    return withGenericCandidates(state, [
      node(state, {
        id: "vehicle_location",
        category: "DATA",
        title: "Vehicle location",
        description:
          "Which branch currently holds each vehicle and how availability is determined.",
        priority: 10,
        riskWeight: 10,
      }),
      node(state, {
        id: "cross_branch_booking",
        category: "WORKFLOW",
        title: "Cross-branch booking",
        description:
          "Whether a customer can book at one branch and pick up or return at another branch.",
        priority: 10,
        riskWeight: 9,
      }),
      node(state, {
        id: "customer_identity",
        category: "DATA",
        title: "Customer identity across branches",
        description:
          "Whether the same renter should have one history across branches or separate records per branch.",
        priority: 9,
        riskWeight: 9,
      }),
      node(state, {
        id: "vehicle_transfer",
        category: "WORKFLOW",
        title: "Vehicle transfer",
        description:
          "How a vehicle moving between branches affects availability, bookings, and its movement history.",
        priority: 8,
        riskWeight: 8,
      }),
      node(state, {
        id: "pickup_return",
        category: "WORKFLOW",
        title: "Pickup and return behavior",
        description:
          "What staff record when a vehicle is picked up, returned late, damaged, or not returned.",
        priority: 8,
        riskWeight: 8,
      }),
    ]);
  }

  if (domain === "INVENTORY") {
    return withGenericCandidates(state, [
      node(state, {
        id: "slab_identity",
        category: "DATA",
        title: "Individual slab identity",
        description:
          "Whether every slab has its own identity and history or inventory is tracked only as aggregate quantity.",
        priority: 10,
        riskWeight: 10,
      }),
      node(state, {
        id: "warehouse_transfer",
        category: "WORKFLOW",
        title: "Warehouse transfer",
        description:
          "How a slab or quantity moves between warehouses and who confirms the transfer.",
        priority: 10,
        riskWeight: 9,
      }),
      node(state, {
        id: "movement_history",
        category: "DATA",
        title: "Movement history",
        description:
          "Whether the system must preserve a complete history of each inventory movement and adjustment.",
        priority: 9,
        riskWeight: 9,
      }),
      node(state, {
        id: "reservation",
        category: "WORKFLOW",
        title: "Inventory reservation",
        description:
          "Whether a slab can be reserved for a customer or quotation before it leaves the warehouse.",
        priority: 8,
        riskWeight: 8,
      }),
      node(state, {
        id: "measurement_semantics",
        category: "DATA",
        title: "Measurement and quantity semantics",
        description:
          "Whether stock is measured by slab, square meter, dimensions, or a combination of units.",
        priority: 8,
        riskWeight: 8,
      }),
    ]);
  }

  if (domain === "GENERAL") {
    const generic = genericRequirementNodes(state);
    if (generic.length > 0) return generic;
    return [
      node(state, {
        id: "primary_workflow",
        category: "WORKFLOW",
        title: "Primary workflow",
        description:
          "What the first successful outcome should be when someone uses this product.",
        priority: 9,
        riskWeight: 8,
      }),
    ];
  }

  return [];
}

export function evaluateDiscovery(state: ProjectState): DiscoveryEvaluation {
  const domain = detectDiscoveryDomain(state);
  const requirements = buildDiscoveryRequirements(state);
  const unresolvedBase = requirements.filter((requirement) =>
    ["UNRESOLVED", "CONFLICTING"].includes(requirement.status),
  );
  const unresolved =
    domain === "CRM"
      ? sortByCrmQueue(unresolvedBase)
      : domain === "GENERAL"
        ? unresolvedBase
        : unresolvedBase.sort((left, right) => {
            const leftIsPrior = DOMAIN_PRIOR_TOPICS.has(left.id);
            const rightIsPrior = DOMAIN_PRIOR_TOPICS.has(right.id);
            if (leftIsPrior !== rightIsPrior) return leftIsPrior ? -1 : 1;
            return (
              right.priority * right.riskWeight -
              left.priority * left.riskWeight
            );
          });
  const important = unresolved.filter(
    (requirement) => requirement.priority >= 8,
  );
  const evaluated = domain !== null && requirements.length > 0;

  return {
    evaluated,
    domain,
    requirements,
    topUnresolved: unresolved.slice(0, 5),
    importantDecisionsRemaining: evaluated ? important.length : null,
    unresolvedTopics: important.map((requirement) => requirement.id),
  };
}

export function requirementStatusForTopic(
  state: ProjectState,
  topic: string,
): RequirementStatus {
  return (
    buildDiscoveryRequirements(state).find(
      (requirement) => requirement.id === topic,
    )?.status || "UNRESOLVED"
  );
}
