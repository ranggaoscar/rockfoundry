import type { ProjectState } from "../schema";
import type { Question } from "../schema/question";

export type QuestionQualityResult = { accepted: boolean; reasons: string[] };

const genericPatterns = [
  /^who are (your|the) target users\??$/i,
  /^do you need authentication\??$/i,
  /^what database do you prefer\??$/i,
  /^do you need an api\??$/i,
  /^what is the tech stack\??$/i,
];

export function validateQuestionQuality(
  question: Question,
  state: ProjectState,
): QuestionQualityResult {
  const reasons: string[] = [];
  if (genericPatterns.some((pattern) => pattern.test(question.text.trim())))
    reasons.push(
      "This question can be asked unchanged for unrelated products.",
    );
  if (
    question.relatedRequirementIds.length === 0 &&
    question.contextReferences.length === 0
  )
    reasons.push(
      "The question is not mapped to a known requirement or context field.",
    );
  const nouns = [
    state.name,
    ...state.targetUsers,
    ...state.entities,
    ...state.features,
    ...state.workflows,
  ]
    .filter(Boolean)
    .map((value) => value.toLowerCase());
  const text = question.text.toLowerCase();
  if (
    nouns.length > 0 &&
    !nouns.some((noun) => noun.length > 2 && text.includes(noun))
  )
    reasons.push("The question does not use a known project noun.");
  return { accepted: reasons.length === 0, reasons };
}

export function isQuestionContextual(question: Question, state: ProjectState) {
  return validateQuestionQuality(question, state).accepted;
}
