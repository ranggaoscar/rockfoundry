import type { Question } from "../schema/question";

const STOP_WORDS = new Set([
  "a",
  "ada",
  "akan",
  "atau",
  "boleh",
  "dan",
  "di",
  "dengan",
  "ini",
  "itu",
  "juga",
  "ke",
  "lebih",
  "pada",
  "perlu",
  "saja",
  "untuk",
  "yang",
]);

function normalize(value: string) {
  return value
    .toLocaleLowerCase("id")
    .replace(/[“”'`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\bmelihat\b/g, "lihat")
    .replace(/\bsemuanya\b/g, "semua")
    .replace(/\bmemasang\b/g, "pasang")
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(value: string) {
  return new Set(
    normalize(value)
      .split(" ")
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
  );
}

function score(text: string, option: NonNullable<Question["options"]>[number]) {
  const input = normalize(text);
  const label = normalize(option.label);
  const description = normalize(option.description || "");
  const material = normalize(`${option.label} ${option.description || ""}`);
  if (!input || !label) return 0;
  if (input === label) return 1;
  if (material.includes(input)) return 0.94;
  const inputTokens = tokens(input);
  const materialTokens = tokens(material);
  const shared = [...inputTokens].filter((token) => materialTokens.has(token));
  if (inputTokens.size < 2 || shared.length < 2) return 0;
  const inputCoverage = shared.length / inputTokens.size;
  const labelCoverage = shared.length / Math.max(tokens(label).size, 1);
  const descriptionCoverage = description
    ? shared.length / Math.max(tokens(description).size, 1)
    : 0;
  return Math.min(
    0.9,
    inputCoverage * 0.72 + Math.max(labelCoverage, descriptionCoverage) * 0.28,
  );
}

/** Maps only a strong, unique natural-language match; otherwise returns null. */
export function matchNaturalAnswer(
  text: string,
  question: Question | null,
): string | null {
  if (!question) return null;
  const options = question.options || [];
  const normalizedInput = normalize(text);
  const exact = options.filter(
    (option) => normalize(option.label) === normalizedInput,
  );
  if (exact.length === 1) return exact[0].id;
  const ranked = options
    .map((option) => ({ option, score: score(text, option) }))
    .sort((a, b) => b.score - a.score);
  const winner = ranked[0];
  const runnerUp = ranked[1];
  if (!winner || winner.score < 0.78) return null;
  if (runnerUp && winner.score - runnerUp.score < 0.2) return null;
  return winner.option.id;
}
