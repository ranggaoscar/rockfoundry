import type { ProjectState } from "../schema";
import type { Question } from "../schema/question";
import { extractStructuralContext } from "./context-extractor";

export type QuestionQualityResult = { accepted: boolean; reasons: string[] };

const genericPatterns = [
  /^who are (your|the) target (users|audience)\??$/i,
  /^what (features|functionality) do you need\??$/i,
  /^do you need authentication\??$/i,
  /^what platform will this run on\??$/i,
  /^what database do you prefer\??$/i,
  /^do you need an? (api|notification|integration)\??$/i,
  /^what is the tech stack\??$/i,
  /^what should we build first\??$/i,
  /^how does .+ plan to make money\??$/i,
  /^what is your (business|monetization) model\??$/i,
];

const technicalPattern =
  /\b(postgres|postgresql|sqlite|mysql|database|orm|rest|graphql|uuid|integer id|server actions|api design|tech stack)\b/i;

const genericOptionPattern =
  /^(?:tetapkan satu aturan tetap|ada pengecualian terukur|set one explicit rule|allow defined exceptions)$/i;

const avoidableIndonesianJargon =
  /\b(?:record|role|acceptance criteria|visibility boundary|ownership)\b/i;

function knownContextTerms(state: ProjectState) {
  const context = extractStructuralContext(state);
  return [
    state.name,
    ...state.targetUsers,
    ...state.roles,
    ...state.entities,
    ...state.features,
    ...state.workflows,
    ...state.integrations,
    ...context.roles.map((item) => item.value),
    ...context.entities.map((item) => item.value),
    ...context.workflows.map((item) => item.value),
    ...context.channels.map((item) => item.value),
  ]
    .filter(Boolean)
    .flatMap((value) => {
      const phrase = value.toLowerCase().trim();
      return [
        phrase,
        ...phrase.split(/[^a-z0-9]+/).filter((token) => token.length > 3),
      ];
    });
}

export function validateQuestionQuality(
  question: Question,
  state: ProjectState,
): QuestionQualityResult {
  const reasons: string[] = [];
  const text = question.text.trim();
  if (genericPatterns.some((pattern) => pattern.test(text)))
    reasons.push(
      "This question can be asked unchanged for unrelated products.",
    );
  if (technicalPattern.test(text))
    reasons.push(
      "Discovery questions should resolve product behavior, not implementation choices.",
    );
  if (question.relatedRequirementIds.length === 0)
    reasons.push("The question is not mapped to an unresolved requirement.");
  if (
    question.topic &&
    state.decisions.some(
      (decision) =>
        decision.topic === question.topic && decision.status === "ACCEPTED",
    )
  )
    reasons.push("This decision is already confirmed by the user.");
  if (
    (question.options || []).length > 0 &&
    (question.options || []).length < 2
  )
    reasons.push("A choice question needs at least two meaningful options.");
  if (
    (question.options || []).some((option) =>
      genericOptionPattern.test(option.label.trim()),
    )
  )
    reasons.push(
      "Options use a generic policy placeholder instead of answering the decision.",
    );
  if (
    (question.options || []).some(
      (option) => !option.description || option.description.trim().length < 8,
    )
  )
    reasons.push("Each option needs a useful trade-off description.");
  if (question.contextReferences.length === 0)
    reasons.push("The question does not point to known project context.");

  const terms = knownContextTerms(state);
  const hasKnownContext = terms.some(
    (term) => term.length > 3 && text.toLowerCase().includes(term),
  );
  if (!hasKnownContext)
    reasons.push("The question does not use a known project noun or workflow.");
  if (
    state.name &&
    state.name.length > 4 &&
    text.includes(state.name) &&
    /how does|plan to make money/i.test(text)
  ) {
    reasons.push(
      "The question interpolates the project title into a template.",
    );
  }

  return { accepted: reasons.length === 0, reasons };
}

export function isQuestionContextual(question: Question, state: ProjectState) {
  return validateQuestionQuality(question, state).accepted;
}
