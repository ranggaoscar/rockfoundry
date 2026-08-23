import {
  AgentRunner,
  deterministicDiscoveryPlanner,
  generateGenericDecisionCandidates,
  genericQuestionForTopic,
  QuestionEngine,
  type AgentAction,
  type ProjectState,
  type Question,
} from "@rockfoundry/core";
import { prisma } from "@rockfoundry/db";

import { createServerToolRegistry } from "./server-tools";
import { parseProjectState } from "./local-project";

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
  return "AMBIGUOUS";
}

/** Map a natural-language answer to an active question option when confident. */
export function mapNaturalAnswer(
  text: string,
  question: Question | null,
): string | null {
  if (!question) return null;
  const lower = text.toLowerCase();
  const options = question.options || [];
  for (const option of options) {
    const optionLower = option.label.toLowerCase();
    if (
      optionLower &&
      (lower.includes(optionLower) ||
        optionLower.includes(lower) ||
        options.some(
          (o) => o.id !== option.id && lower.includes(o.label.toLowerCase()),
        ))
    )
      continue;
  }
  if (
    /perusahaan|employer|posting|pasang lowongan|two-sided|marketplace/.test(
      lower,
    )
  )
    return (
      options.find((option) =>
        /two_sided|perusahaan/.test(option.id + option.label),
      )?.id || null
    );
  if (/pencari kerja saja|job seeker only|hanya.*pencari/.test(lower))
    return (
      options.find((option) =>
        /job_seeker|pencari kerja saja/.test(option.id + option.label),
      )?.id || null
    );
  return null;
}

export async function runConversationTurn(input: {
  projectId: string;
  text: string;
  intent: MessageIntent;
  answer?: string | string[] | null;
  /** Updated canonical state after the human decision, so candidates reflect it. */
  state?: ProjectState;
  /** Topic just answered, used to pick the domain queue successor deterministically. */
  preferredTopic?: string;
}) {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
  });
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  const state = input.state || parseProjectState(project);
  const engine = new QuestionEngine();
  const domainNext = input.preferredTopic
    ? engine
        .generateQuestions(state, [], 12)
        .find((question) => question.topic !== input.preferredTopic) || null
    : null;
  const candidates = generateGenericDecisionCandidates(state).slice(0, 5);
  const genericQuestions = candidates
    .map((candidate) => genericQuestionForTopic(state, candidate.topic))
    .filter((question): question is Question => Boolean(question));
  const questions = [domainNext, ...genericQuestions]
    .filter((question): question is Question => Boolean(question))
    .filter(
      (question, index, all) =>
        all.findIndex((candidate) => candidate.id === question.id) === index,
    );
  const fallbackQuestion = questions[0] || null;
  // Answer turns advance a deterministic product queue. The model may enrich
  // language elsewhere, but must not replace the canonical next decision.
  const planner = deterministicDiscoveryPlanner(
    fallbackQuestion || {
      id: "no-question",
      text: "Describe the product a bit more so RockFoundry can find the next important decision.",
      relatedRequirementIds: [],
      options: [],
    },
  );
  const tools = createServerToolRegistry();
  const runner = new AgentRunner(planner, tools);

  let resolvedQuestion: Question | null = null;
  const result = await runner.run({
    project: state,
    latestUserMessage: input.text,
    candidateTopics: questions
      .map((question) => question.topic)
      .filter((topic): topic is string => Boolean(topic)),
    questionForAction: (action: AgentAction) => {
      if (action.type !== "ASK_USER") return undefined;
      const question =
        questions.find((question) => question.id === action.questionId) ||
        questions.find((question) => question.topic === action.questionId) ||
        fallbackQuestion ||
        undefined;
      resolvedQuestion = question || null;
      return question;
    },
    onToolRun: async (activity) => {
      await prisma.toolRun.create({
        data: {
          projectId: input.projectId,
          toolName:
            activity.action.type === "CALL_TOOL"
              ? activity.action.toolName
              : "agent",
          status: "COMPLETED",
          inputSummary: activity.action.rationale || "Agent tool execution",
          outputSummary: activity.observation?.summary || "Tool completed.",
          startedAt: new Date(Date.now() - activity.durationMs),
          completedAt: new Date(),
        },
      });
    },
  });

  return {
    result,
    candidates,
    questions,
    fallbackQuestion,
    questionForAction: resolvedQuestion,
  };
}
