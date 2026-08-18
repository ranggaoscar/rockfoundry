import type { ProjectState } from "../schema";
import {
  createInitialProjectState,
  deriveProjectTitle,
} from "../schema/project";
import { generateGenericDecisionCandidates } from "../questions/candidate-generator";
import { extractStructuralContext } from "../questions/context-extractor";
import { QuestionEngine } from "../questions/engine";

export type BlindFixture = {
  id: string;
  label: string;
  rawIdea: string;
  expectedThemes: string[];
};

export const GENERALIZATION_BLIND_FIXTURES: BlindFixture[] = [
  {
    id: "dental-clinic",
    label: "Dental clinic",
    rawIdea:
      "Gua mau bikin sistem operasional klinik gigi dengan beberapa dokter, appointment, treatment plan, pembayaran, dan histori pasien.",
    expectedThemes: [
      "visibility",
      "conflict",
      "lifecycle",
      "ownership",
      "history",
      "money",
    ],
  },
  {
    id: "online-learning",
    label: "Online learning",
    rawIdea:
      "Gua mau bikin platform untuk mengelola kelas online, instructor, cohort, assignment, progress siswa, dan sertifikat.",
    expectedThemes: [
      "visibility",
      "lifecycle",
      "ownership",
      "assignment",
      "completion",
      "identity",
    ],
  },
  {
    id: "recording-studio",
    label: "Recording studio",
    rawIdea:
      "Gua mau bikin sistem studio rekaman yang punya beberapa room, engineer, booking session, equipment, client, deposit, dan reschedule.",
    expectedThemes: [
      "conflict",
      "ownership",
      "lifecycle",
      "money",
      "assignment",
      "visibility",
    ],
  },
  {
    id: "volunteer-events",
    label: "Volunteer events",
    rawIdea:
      "Gua mau bikin platform volunteer untuk event besar. Volunteer bisa daftar beberapa event, organizer punya beberapa team, ada shift, capacity, check-in, dan sertifikat volunteer.",
    expectedThemes: [
      "conflict",
      "visibility",
      "lifecycle",
      "ownership",
      "completion",
      "assignment",
    ],
  },
];

export type BlindQuestionScore = {
  topic: string;
  text: string;
  contextualRelevance: number;
  hiddenDecisionValue: number;
  blastRadiusImportance: number;
  genericQuestionRisk: number;
  matchedThemes: string[];
};

export type BlindEvaluation = {
  fixture: BlindFixture;
  context: ReturnType<typeof extractStructuralContext>;
  questions: ReturnType<QuestionEngine["generateQuestions"]>;
  scores: BlindQuestionScore[];
  averages: {
    contextualRelevance: number;
    hiddenDecisionValue: number;
    blastRadiusImportance: number;
    genericQuestionRisk: number;
  };
  firstFiveThemes: string[];
  passes: boolean;
};

function blindState(fixture: BlindFixture): ProjectState {
  return createInitialProjectState({
    id: `blind-${fixture.id}`,
    name: deriveProjectTitle(fixture.rawIdea),
    rawIdea: fixture.rawIdea,
  });
}

function themePatterns(theme: string) {
  const patterns: Record<string, RegExp> = {
    identity: /identity|identitas|same|duplicate|record terpisah|satu record/i,
    visibility: /visibility|lihat|see|histori lengkap|access|akses|privacy/i,
    conflict:
      /conflict|slot|resource|capacity|permintaan|menolak|mengantri|override/i,
    lifecycle:
      /lifecycle|status|state|transisi|selesai|complete|cancel|dibatalkan/i,
    ownership: /ownership|pemilik|owner|tanggung jawab|responsibility/i,
    history: /history|histori|audit|perubahan|record/i,
    money: /money|payment|pembayaran|deposit|refund|dispute/i,
    assignment: /assignment|ditangani|assigned|pindah|dipindahkan/i,
    completion: /completion|selesai|bukti|outcome|berhasil|complete/i,
  };
  return patterns[theme] || new RegExp(theme, "i");
}

function average(values: number[]) {
  return values.length
    ? Number(
        (
          values.reduce((total, value) => total + value, 0) / values.length
        ).toFixed(2),
      )
    : 0;
}

function scoreQuestion(
  state: ProjectState,
  fixture: BlindFixture,
  question: ReturnType<QuestionEngine["generateQuestions"]>[number],
): BlindQuestionScore {
  const context = extractStructuralContext(state);
  const candidates = generateGenericDecisionCandidates(state);
  const candidate = candidates.find((item) => item.topic === question.topic);
  const contextTerms = [
    ...context.roles,
    ...context.entities,
    ...context.workflows,
    ...context.channels,
  ].map((item) => item.value.toLowerCase());
  const lower = question.text.toLowerCase();
  const matchedContext = contextTerms.filter(
    (term) => term.length > 3 && lower.includes(term),
  );
  const matchedThemes = fixture.expectedThemes.filter((theme) =>
    themePatterns(theme).test(`${question.topic} ${question.text}`),
  );
  const technical =
    /database|postgres|sqlite|orm|graphql|tech stack|framework/i.test(
      question.text,
    );
  return {
    topic: question.topic || "unknown",
    text: question.text,
    contextualRelevance: Math.max(
      1,
      Math.min(
        5,
        matchedContext.length >= 2 ? 5 : matchedContext.length ? 4 : 2,
      ),
    ),
    hiddenDecisionValue: candidate
      ? Math.max(
          1,
          Math.min(
            5,
            Math.round((candidate.priority + candidate.riskWeight) / 4),
          ),
        )
      : 2,
    blastRadiusImportance: candidate
      ? Math.max(1, Math.min(5, Math.round(candidate.affects.length / 2)))
      : 2,
    genericQuestionRisk: technical
      ? 5
      : matchedContext.length >= 2
        ? 1
        : matchedContext.length
          ? 2
          : 4,
    matchedThemes,
  };
}

export function evaluateBlindFixture(fixture: BlindFixture): BlindEvaluation {
  const state = blindState(fixture);
  const context = extractStructuralContext(state);
  const questions = new QuestionEngine().generateQuestions(state, [], 5);
  const scores = questions.map((question) =>
    scoreQuestion(state, fixture, question),
  );
  const averages = {
    contextualRelevance: average(
      scores.map((score) => score.contextualRelevance),
    ),
    hiddenDecisionValue: average(
      scores.map((score) => score.hiddenDecisionValue),
    ),
    blastRadiusImportance: average(
      scores.map((score) => score.blastRadiusImportance),
    ),
    genericQuestionRisk: average(
      scores.map((score) => score.genericQuestionRisk),
    ),
  };
  const firstFiveThemes = [
    ...new Set(scores.flatMap((score) => score.matchedThemes)),
  ];
  return {
    fixture,
    context,
    questions,
    scores,
    averages,
    firstFiveThemes,
    passes:
      scores.length >= 3 &&
      averages.contextualRelevance >= 4 &&
      averages.hiddenDecisionValue >= 3.5 &&
      averages.genericQuestionRisk <= 2,
  };
}

export function evaluateGeneralizationBlindSet() {
  const evaluations = GENERALIZATION_BLIND_FIXTURES.map(evaluateBlindFixture);
  return {
    evaluations,
    passes: evaluations.every((evaluation) => evaluation.passes),
    averageContextualRelevance: average(
      evaluations.map((evaluation) => evaluation.averages.contextualRelevance),
    ),
    averageHiddenDecisionValue: average(
      evaluations.map((evaluation) => evaluation.averages.hiddenDecisionValue),
    ),
    averageGenericQuestionRisk: average(
      evaluations.map((evaluation) => evaluation.averages.genericQuestionRisk),
    ),
  };
}
