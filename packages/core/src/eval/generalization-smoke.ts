import { evaluateGeneralizationBlindSet } from "./generalization";

const result = evaluateGeneralizationBlindSet();
for (const evaluation of result.evaluations) {
  console.log(
    `${evaluation.fixture.label}: ${evaluation.scores
      .map((score) => score.topic)
      .join(" → ")}`,
  );
  console.log(
    `  contextual ${evaluation.averages.contextualRelevance}/5 · hidden ${evaluation.averages.hiddenDecisionValue}/5 · generic risk ${evaluation.averages.genericQuestionRisk}/5`,
  );
  console.log(`  themes: ${evaluation.firstFiveThemes.join(", ")}`);
}
console.log(
  `GENERALIZATION ${result.passes ? "PASS" : "FAIL"} · contextual ${result.averageContextualRelevance}/5 · hidden ${result.averageHiddenDecisionValue}/5 · generic risk ${result.averageGenericQuestionRisk}/5`,
);

if (!result.passes) process.exitCode = 1;
