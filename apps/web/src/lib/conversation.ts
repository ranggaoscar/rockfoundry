import {
  AgentRunner,
  deterministicDiscoveryPlanner,
  generateGenericDecisionCandidates,
  genericQuestionForTopic,
  matchNaturalAnswer,
  QuestionEngine,
  type AgentAction,
  type AgentPlanner,
  type AgentObservation,
  type ProjectState,
  type Question,
} from "@rockfoundry/core";
import { prisma } from "@rockfoundry/db";
import { createModelDiscoveryPlanner } from "./agent-planner";
import { parseProjectState } from "./local-project";
import { createServerToolRegistry } from "./server-tools";

export type MessageIntent =
  | "ACTIVE_DECISION_ANSWER"
  | "NEW_PRODUCT_CONTEXT"
  | "CORRECTION"
  | "RESEARCH_REQUEST"
  | "REFERENCE_URL"
  | "HANDOFF_REQUEST"
  | "AMBIGUOUS";

const URL_PATTERN = /https?:\/\/[^\s)]+/i;
const RESEARCH_PATTERN =
  /\b(cari|search|riset|research|bandingkan|compare|contoh|referensi|reference|bagaimana .*(?:menangani|memisahkan|melakukan)|how does .* handle)\b/i;
const HANDOFF_PATTERN =
  /\b(bikin|buat|generate|ready|siapkan?|handoff|documents|dokumen)\b/i;
const CORRECTION_PATTERN =
  /\b(sebenarnya|bukan|bukan begini|eh|nggak|tidak boleh|revisi|koreksi|revise|wait no|actually)\b/i;

export function classifyMessage(text: string): MessageIntent {
  const trimmed = text.trim();
  if (URL_PATTERN.test(trimmed)) return "REFERENCE_URL";
  if (RESEARCH_PATTERN.test(trimmed)) return "RESEARCH_REQUEST";
  if (CORRECTION_PATTERN.test(trimmed)) return "CORRECTION";
  if (HANDOFF_PATTERN.test(trimmed)) return "HANDOFF_REQUEST";
  return "NEW_PRODUCT_CONTEXT";
}

/** Web-layer compatibility export for the pure core matcher. */
export const mapNaturalAnswer = matchNaturalAnswer;

function canonicalQuestion(
  state: ProjectState,
  preferredTopic?: string,
): Question | null {
  const engine = new QuestionEngine();
  const queue = engine.generateQuestions(state, [], 12);
  return (
    (preferredTopic
      ? queue.find((question) => question.topic !== preferredTopic)
      : null) ||
    queue[0] ||
    null
  );
}

function deterministicResearchPlanner(
  question: Question,
  query: string,
): AgentPlanner {
  return {
    nextAction({ iteration }) {
      if (iteration === 1)
        return {
          id: "research-web",
          type: "CALL_TOOL",
          toolName: "web_search",
          input: { query, maxResults: 5 },
          rationale:
            "Collect public evidence before asking the canonical decision.",
        };
      return {
        id: `ask-${question.id}`,
        type: "ASK_USER",
        questionId: question.id,
        question: question.text,
        relatedRequirementIds: question.relatedRequirementIds,
        options: question.options || [],
      };
    },
  };
}

function deterministicHandoffPlanner(question: Question): AgentPlanner {
  return {
    nextAction({ iteration }) {
      if (iteration === 1)
        return {
          id: "requirements-check",
          type: "CALL_TOOL",
          toolName: "requirements_check",
          input: {},
        };
      return {
        id: `ask-${question.id}`,
        type: "ASK_USER",
        questionId: question.id,
        question: question.text,
        relatedRequirementIds: question.relatedRequirementIds,
        options: question.options || [],
      };
    },
  };
}

function deterministicReferencePlanner(
  question: Question,
  url: string,
): AgentPlanner {
  const toolName = /(^|\.)github\.com\//i.test(url)
    ? "github_reference_inspect"
    : "web_reference_inspect";
  return {
    nextAction({ iteration }) {
      if (iteration === 1)
        return {
          id: "inspect-reference",
          type: "CALL_TOOL",
          toolName,
          input: { url },
          rationale: "Inspect a pasted public reference as untrusted evidence.",
        };
      return {
        id: `ask-${question.id}`,
        type: "ASK_USER",
        questionId: question.id,
        question: question.text,
        relatedRequirementIds: question.relatedRequirementIds,
        options: question.options || [],
      };
    },
  };
}

function firstPublicUrl(text: string) {
  return text.match(URL_PATTERN)?.[0] || null;
}

async function persistResearchEvidence(
  projectId: string,
  state: ProjectState,
  observation: AgentObservation,
) {
  if (observation.type !== "TOOL:web_search") return;
  const output = observation.data as {
    query?: string;
    results?: Array<{ title?: string; url?: string; snippet?: string }>;
  };
  for (const result of output.results || []) {
    if (!result.url) continue;
    const existing = await prisma.reference.findFirst({
      where: { projectId, url: result.url },
    });
    if (existing) continue;
    const reference = await prisma.reference.create({
      data: {
        projectId,
        type: "WEB_SEARCH",
        url: result.url,
        status: "ANALYZED",
        untrusted: true,
        metadata: JSON.stringify({
          provenance: "RESEARCH",
          query: output.query || "",
          title: result.title || "",
          summary: result.snippet || "",
        }),
      },
    });
    state.references.push({
      id: reference.id,
      type: "URL",
      url: reference.url,
      status: "ANALYZED",
      source: "RESEARCH",
      untrusted: true,
      metadata: JSON.parse(reference.metadata || "{}"),
    });
  }
}

async function persistReferenceEvidence(
  projectId: string,
  state: ProjectState,
  observation: AgentObservation,
) {
  if (
    !/^TOOL:(web_reference_inspect|github_reference_inspect)$/.test(
      observation.type,
    )
  )
    return;
  const output = observation.data as {
    url?: string;
    title?: string;
    summary?: string;
    error?: string;
  };
  if (!output.url || output.error) return;
  const type =
    observation.type === "TOOL:github_reference_inspect"
      ? "GITHUB_REPO"
      : "URL";
  const source =
    type === "GITHUB_REPO" ? "REFERENCE_GITHUB" : "REFERENCE_WEBSITE";
  const existing = await prisma.reference.findFirst({
    where: { projectId, url: output.url },
  });
  const reference =
    existing ||
    (await prisma.reference.create({
      data: {
        projectId,
        type,
        url: output.url,
        status: "ANALYZED",
        untrusted: true,
        metadata: JSON.stringify({ provenance: "RESEARCH", ...output }),
      },
    }));
  if (!state.references.some((item) => item.url === reference.url))
    state.references.push({
      id: reference.id,
      type,
      url: reference.url,
      status: "ANALYZED",
      source,
      untrusted: true,
      metadata: reference.metadata ? JSON.parse(reference.metadata) : {},
    });
}

export async function runConversationTurn(input: {
  projectId: string;
  text: string;
  intent: MessageIntent;
  answer?: string | string[] | null;
  state?: ProjectState;
  preferredTopic?: string;
  plannerOverride?: AgentPlanner;
}) {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
  });
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  const state = input.state || parseProjectState(project);
  const canonical = canonicalQuestion(state, input.preferredTopic);
  const candidates = generateGenericDecisionCandidates(state).slice(0, 5);
  const genericQuestions = candidates
    .map((candidate) => genericQuestionForTopic(state, candidate.topic))
    .filter((question): question is Question => Boolean(question));
  const questions = [canonical, ...genericQuestions]
    .filter((question): question is Question => Boolean(question))
    .filter(
      (question, index, all) =>
        all.findIndex((item) => item.id === question.id) === index,
    );
  const fallbackQuestion = canonical || questions[0] || null;
  if (!fallbackQuestion) throw new Error("NO_DISCOVERY_QUESTION");

  const modelPlanner = createModelDiscoveryPlanner(
    candidates,
    fallbackQuestion,
    input.intent,
  );
  const referenceUrl =
    input.intent === "REFERENCE_URL" ? firstPublicUrl(input.text) : null;
  const planner =
    input.plannerOverride ||
    (input.intent === "RESEARCH_REQUEST"
      ? modelPlanner ||
        deterministicResearchPlanner(fallbackQuestion, input.text)
      : input.intent === "REFERENCE_URL" && referenceUrl
        ? deterministicReferencePlanner(fallbackQuestion, referenceUrl)
        : input.intent === "HANDOFF_REQUEST"
          ? modelPlanner || deterministicHandoffPlanner(fallbackQuestion)
          : modelPlanner || deterministicDiscoveryPlanner(fallbackQuestion));
  const tools = createServerToolRegistry();
  const runner = new AgentRunner(planner, tools);
  let resolvedQuestion: Question | null = null;
  const toolRunByAction = new Map<string, string>();

  const result = await runner.run({
    project: state,
    latestUserMessage: input.text,
    candidateTopics: questions
      .map((question) => question.topic)
      .filter((topic): topic is string => Boolean(topic)),
    questionForAction: (action: AgentAction) => {
      if (action.type !== "ASK_USER") return undefined;
      // Strictly preserve canonical identity: an agent cannot substitute another ID.
      if (action.questionId !== fallbackQuestion.id) return undefined;
      resolvedQuestion = fallbackQuestion;
      return fallbackQuestion;
    },
    onToolStart: async (action) => {
      if (action.type !== "CALL_TOOL") return;
      const row = await prisma.toolRun.create({
        data: {
          projectId: input.projectId,
          toolName: action.toolName,
          status: "RUNNING",
          inputSummary: action.rationale || action.toolName,
          startedAt: new Date(),
        },
      });
      toolRunByAction.set(action.id, row.id);
    },
    onToolRun: async (activity) => {
      const rowId = toolRunByAction.get(activity.action.id);
      if (rowId)
        await prisma.toolRun.update({
          where: { id: rowId },
          data: {
            status: "COMPLETED",
            outputSummary: activity.observation?.summary || "Tool completed.",
            completedAt: new Date(),
          },
        });
      if (activity.observation)
        await persistResearchEvidence(
          input.projectId,
          state,
          activity.observation,
        );
      if (activity.observation)
        await persistReferenceEvidence(
          input.projectId,
          state,
          activity.observation,
        );
    },
    onToolFailure: async (action, error) => {
      const rowId = toolRunByAction.get(action.id);
      if (rowId)
        await prisma.toolRun.update({
          where: { id: rowId },
          data: {
            status: "FAILED",
            failureReason: error.message.slice(0, 500),
            completedAt: new Date(),
          },
        });
    },
  });

  return {
    result,
    candidates,
    questions,
    canonicalQuestion: fallbackQuestion,
    questionForAction: resolvedQuestion,
  };
}

export async function persistConversationMessage(
  projectId: string,
  role: "user" | "assistant",
  content: string,
  metadata: Record<string, unknown>,
) {
  return prisma.conversationMessage.create({
    data: { projectId, role, content, metadata: JSON.stringify(metadata) },
  });
}
