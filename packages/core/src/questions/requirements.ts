import type {
  ProjectState,
  RequirementNode,
  RequirementStatus,
} from "../schema";
import { CRM_DECISION_META, CRM_DECISION_ORDER, sortByCrmQueue } from "./crm-catalog";

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

export function detectDiscoveryDomain(
  state: ProjectState,
): DiscoveryDomain | null {
  const text = stateText(state);
  if (
    /crm|customer relationship|sales pipeline|lead management|quotation/.test(
      text,
    )
  )
    return "CRM";
  if (/rental|vehicle|car booking|booking mobil|cabang|branch/.test(text))
    return "RENTAL";
  if (/inventory|warehouse|gudang|slab|stock|stok|movement|transfer/.test(text))
    return "INVENTORY";
  if (
    state.rawIdea.trim().length >= 24 ||
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

export function buildDiscoveryRequirements(
  state: ProjectState,
): RequirementNode[] {
  const domain = detectDiscoveryDomain(state);

  if (domain === "CRM") {
    return CRM_DECISION_ORDER.map((topic) => {
      const meta = CRM_DECISION_META[topic];
      return node(state, {
        id: topic,
        category: meta.category,
        title: meta.title,
        description: meta.description,
        priority: meta.priority,
        riskWeight: meta.riskWeight,
      });
    });
  }

  if (domain === "RENTAL") {
    return [
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
    ];
  }

  if (domain === "INVENTORY") {
    return [
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
    ];
  }

  if (domain === "GENERAL") {
    return [
      node(state, {
        id: "primary_workflow",
        category: "WORKFLOW",
        title: "Primary workflow",
        description: `What should happen first when someone uses ${state.name || "this product"}.`,
        priority: 9,
        riskWeight: 8,
      }),
      node(state, {
        id: "record_relationships",
        category: "DATA",
        title: "Record relationships",
        description: `How ${state.entities.slice(0, 3).join(", ") || "the important records"} stay connected over time.`,
        priority: 8,
        riskWeight: 8,
      }),
      node(state, {
        id: "role_boundaries",
        category: "PERMISSIONS",
        title: "Role boundaries",
        description: `What ${state.targetUsers.slice(0, 2).join(" and ") || "different users"} can see or change.`,
        priority: 8,
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
      : unresolvedBase.sort(
          (left, right) =>
            right.priority * right.riskWeight -
            left.priority * left.riskWeight,
        );
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
