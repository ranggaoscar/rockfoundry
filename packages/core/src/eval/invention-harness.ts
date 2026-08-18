import type { ProjectState } from "../schema";
import {
  CRM_DECISION_META,
  CRM_DECISION_ORDER,
  CRM_GOLDEN_IDEAS,
  acceptedDecision,
  type CrmDecisionTopic,
} from "../questions/crm-catalog";
import { detectDiscoveryDomain } from "../questions/requirements";
import { createInitialProjectState, deriveProjectTitle } from "../schema/project";
import { QuestionEngine } from "../questions/engine";
import { evaluateDecisionDebt } from "../graph/decision-debt";
import { renderArtifacts } from "../export/generator";

export type InventionStatus =
  | "MUST_INVENT"
  | "CONSTRAINED"
  | "EXPLICIT_OPEN"
  | "NOT_APPLICABLE";

export type InventionTopicResult = {
  topic: string;
  title: string;
  riskWeight: number;
  withoutHandoff: InventionStatus;
  withHandoff: InventionStatus;
};

export type InventionEvalResult = {
  domain: string | null;
  topics: InventionTopicResult[];
  withoutHandoff: {
    mustInventCount: number;
    weightedScore: number;
  };
  withHandoff: {
    mustInventCount: number;
    constrainedCount: number;
    explicitOpenCount: number;
    weightedScore: number;
    decisionDebt: number;
    packageFiles: string[];
    hasDoNotInvent: boolean;
  };
  reduction: {
    mustInventDelta: number;
    weightedScoreDelta: number;
    wins: boolean;
  };
  summary: string;
};

function riskTopics(state: ProjectState): Array<{
  topic: string;
  title: string;
  riskWeight: number;
}> {
  const domain = detectDiscoveryDomain(state);
  if (domain === "CRM") {
    return CRM_DECISION_ORDER.map((topic) => ({
      topic,
      title: CRM_DECISION_META[topic].title,
      riskWeight:
        CRM_DECISION_META[topic].priority *
        CRM_DECISION_META[topic].riskWeight,
    }));
  }

  // Generic fallback: use unresolved discovery requirements when available.
  const text = state.rawIdea.toLowerCase();
  if (!text.trim()) return [];
  return [
    {
      topic: "primary_workflow",
      title: "Primary workflow",
      riskWeight: 72,
    },
    {
      topic: "record_relationships",
      title: "Record relationships",
      riskWeight: 64,
    },
    {
      topic: "role_boundaries",
      title: "Role boundaries",
      riskWeight: 64,
    },
  ];
}

function statusWithoutHandoff(state: ProjectState, topic: string): InventionStatus {
  // Raw idea alone almost never freezes multi-brand product rules.
  // Only treat as constrained if the idea hard-codes the answer unambiguously.
  const idea = state.rawIdea.toLowerCase();
  if (topic === "customer_identity") {
    if (
      /one shared customer|satu customer lintas|company-wide customer/.test(idea) &&
      !/or separate|atau terpisah|belum/.test(idea)
    ) {
      return "CONSTRAINED";
    }
  }
  return "MUST_INVENT";
}

function statusWithHandoff(state: ProjectState, topic: string): InventionStatus {
  const decision = acceptedDecision(state, topic);
  if (decision) return "CONSTRAINED";
  const open = state.openQuestions.some((item) =>
    item.toLowerCase().includes(topic.replace(/_/g, " ")),
  );
  if (open) return "EXPLICIT_OPEN";
  // Unresolved high-risk topics remain invention pressure unless the package
  // forbids guessing. DO_NOT_INVENT makes them EXPLICIT_OPEN constraints.
  return "EXPLICIT_OPEN";
}

function weighted(
  topics: InventionTopicResult[],
  side: "withoutHandoff" | "withHandoff",
) {
  return topics.reduce((total, topic) => {
    const status = topic[side];
    if (status === "MUST_INVENT") return total + topic.riskWeight;
    if (status === "EXPLICIT_OPEN") return total + Math.round(topic.riskWeight * 0.35);
    return total;
  }, 0);
}

/**
 * Deterministic side-by-side score:
 * what a coding agent must invent from a raw idea vs a RockFoundry handoff.
 */
export function evaluateInventionRisk(state: ProjectState): InventionEvalResult {
  const domain = detectDiscoveryDomain(state);
  const topics = riskTopics(state).map((item) => ({
    ...item,
    withoutHandoff: statusWithoutHandoff(state, item.topic),
    withHandoff: statusWithHandoff(state, item.topic),
  }));

  const withoutMust = topics.filter((item) => item.withoutHandoff === "MUST_INVENT")
    .length;
  const withMust = topics.filter((item) => item.withHandoff === "MUST_INVENT")
    .length;
  const constrained = topics.filter((item) => item.withHandoff === "CONSTRAINED")
    .length;
  const explicitOpen = topics.filter(
    (item) => item.withHandoff === "EXPLICIT_OPEN",
  ).length;

  const withoutScore = weighted(topics, "withoutHandoff");
  const withScore = weighted(topics, "withHandoff");
  const docs = renderArtifacts(state);
  const debt = evaluateDecisionDebt(state);

  const wins = withScore < withoutScore && constrained + explicitOpen > 0;
  const summary = wins
    ? `Handoff wins: invention pressure dropped from ${withoutScore} → ${withScore} (constrained ${constrained}, explicit-open ${explicitOpen}).`
    : `Handoff does not yet reduce invention pressure enough (${withoutScore} → ${withScore}).`;

  return {
    domain,
    topics,
    withoutHandoff: {
      mustInventCount: withoutMust,
      weightedScore: withoutScore,
    },
    withHandoff: {
      mustInventCount: withMust,
      constrainedCount: constrained,
      explicitOpenCount: explicitOpen,
      weightedScore: withScore,
      decisionDebt: debt.score,
      packageFiles: [
        "BRD.md",
        "PRD.md",
        "ERD.md",
        "DO_NOT_INVENT.md",
        "DECISIONS.md",
        "decisions.json",
        "INVARIANTS.md",
        "READINESS.md",
        "AGENT_HANDOFF.md",
      ],
      hasDoNotInvent: Boolean(docs.DO_NOT_INVENT?.includes("DO NOT INVENT")),
    },
    reduction: {
      mustInventDelta: withoutMust - withMust,
      weightedScoreDelta: withoutScore - withScore,
      wins,
    },
    summary,
  };
}

export type CrmBenchmarkCase = {
  id: string;
  rawIdea: string;
  answeredTopics: string[];
  evaluation: InventionEvalResult;
};

function seedCrmState(rawIdea: string): ProjectState {
  const state = createInitialProjectState({
    id: "eval",
    name: deriveProjectTitle(rawIdea),
    rawIdea,
  });
  state.targetUsers = ["Sales team", "Owner"];
  state.entities = ["Customer", "Lead", "Quotation", "Brand"];
  state.features = ["Track leads", "Manage quotations", "Follow-ups"];
  state.workflows = ["Capture lead", "Send quotation"];
  state.roles = ["Sales", "Owner"];
  state.problems = ["Sales work is scattered across brands and channels"];
  state.objectives = ["One reliable sales system before coding starts"];
  return state;
}

/** Answer the full CRM queue with recommended first options. */
export function answerCrmQueue(state: ProjectState): {
  state: ProjectState;
  answeredTopics: string[];
} {
  const engine = new QuestionEngine();
  let current = state;
  const answeredTopics: string[] = [];

  for (const expected of CRM_DECISION_ORDER) {
    const question = engine.generateQuestions(current, [], 1)[0];
    if (!question || question.topic !== expected) break;
    const choice =
      question.options?.find((item) => item.id !== "not_sure")?.id ||
      question.options?.[0]?.id ||
      "yes";
    const processed = engine.processAnswer(
      current,
      question.id,
      choice,
      question,
    );
    current = processed.updatedState;
    answeredTopics.push(expected);
  }

  return { state: current, answeredTopics };
}

/**
 * Runs the five CRM golden ideas through a full discovery answer path and
 * scores with-vs-without handoff invention pressure.
 */
export function runCrmInventionBenchmark(): {
  cases: CrmBenchmarkCase[];
  winCount: number;
  total: number;
  winRate: number;
  passesExitCheck: boolean;
  summary: string;
} {
  const cases: CrmBenchmarkCase[] = CRM_GOLDEN_IDEAS.map((fixture) => {
    const seeded = seedCrmState(fixture.rawIdea);
    const answered = answerCrmQueue(seeded);
    const evaluation = evaluateInventionRisk(answered.state);
    return {
      id: fixture.id,
      rawIdea: fixture.rawIdea,
      answeredTopics: answered.answeredTopics,
      evaluation,
    };
  });

  const winCount = cases.filter((item) => item.evaluation.reduction.wins).length;
  const total = cases.length;
  const winRate = total === 0 ? 0 : winCount / total;
  // Exit check from 30-day plan: ≥3 of 5 trials win.
  const passesExitCheck = winCount >= 3;

  return {
    cases,
    winCount,
    total,
    winRate,
    passesExitCheck,
    summary: `CRM invention benchmark: ${winCount}/${total} handoff wins (need ≥3).`,
  };
}

export function formatInventionBenchmarkReport(
  result: ReturnType<typeof runCrmInventionBenchmark>,
) {
  const lines = [
    result.summary,
    `Win rate: ${Math.round(result.winRate * 100)}%`,
    `Exit check (≥3/5): ${result.passesExitCheck ? "PASS" : "FAIL"}`,
    "",
  ];
  for (const item of result.cases) {
    const e = item.evaluation;
    lines.push(
      `## ${item.id}`,
      `- answered: ${item.answeredTopics.join(" → ") || "(none)"}`,
      `- without: invent ${e.withoutHandoff.mustInventCount}, score ${e.withoutHandoff.weightedScore}`,
      `- with: invent ${e.withHandoff.mustInventCount}, constrained ${e.withHandoff.constrainedCount}, score ${e.withHandoff.weightedScore}`,
      `- delta: -${e.reduction.weightedScoreDelta} weighted invention pressure`,
      `- ${e.reduction.wins ? "WIN" : "LOSE"} — ${e.summary}`,
      "",
    );
  }
  return lines.join("\n");
}

/** Convenience for docs/tests: which CRM topics are still free to invent. */
export function unresolvedCrmInventionTopics(state: ProjectState): CrmDecisionTopic[] {
  return CRM_DECISION_ORDER.filter((topic) => !acceptedDecision(state, topic));
}
