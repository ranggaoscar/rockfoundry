import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createInitialProjectState,
  detectContradictions,
  evaluateDecisionDebt,
  evaluateGeneralizationBlindSet,
  extractStructuralContext,
  GENERALIZATION_BLIND_FIXTURES,
  generateGenericDecisionCandidates,
  genericQuestionForTopic,
  QuestionEngine,
  recordDecision,
  renderArtifacts,
} from "../index";

function blindState(rawIdea: string) {
  return createInitialProjectState({
    id: "generalization",
    name: "Unfamiliar product",
    rawIdea,
  });
}

describe("generic structural discovery", () => {
  it("does not add fixture-specific production catalogs", () => {
    const productionFiles = [
      "context-extractor.ts",
      "archetypes.ts",
      "artifact-gap-signals.ts",
      "candidate-generator.ts",
      "candidate-ranker.ts",
    ];
    const source = productionFiles
      .map((file) =>
        readFileSync(resolve(process.cwd(), "src/questions", file), "utf8"),
      )
      .join("\\n");

    expect(source).not.toMatch(
      /\\bclinic\\b|\\bdental\\b|\\beducation\\b|\\bstudent\\b|\\bcohort\\b|\\bstudio\\b|\\bvolunteer\\b/i,
    );
  });

  it("extracts structural context from unfamiliar raw language without mutating canonical state", () => {
    const fixture = GENERALIZATION_BLIND_FIXTURES[0];
    const state = blindState(fixture.rawIdea);
    const context = extractStructuralContext(state);

    expect(context.entities.length).toBeGreaterThanOrEqual(4);
    expect(context.roles.length).toBeGreaterThan(0);
    expect(context.signals.scheduling).toBe(true);
    expect(context.signals.resourceConstraint).toBe(true);
    expect(context.signals.history).toBe(true);
    expect(state.entities).toEqual([]);
    expect(state.decisions).toEqual([]);
  });

  it("keeps generic unresolved decisions visible to Decision Debt", () => {
    const state = blindState(GENERALIZATION_BLIND_FIXTURES[0].rawIdea);
    const debt = evaluateDecisionDebt(state);

    expect(debt.unresolvedHighRiskCount).toBeGreaterThan(0);
    expect(debt.score).toBeGreaterThan(0);
    expect(debt.inventionRisk).not.toBe("LOW");
  });

  it("generates generic candidates with risk and blast-radius metadata", () => {
    const fixture = GENERALIZATION_BLIND_FIXTURES[1];
    const state = blindState(fixture.rawIdea);
    const candidates = generateGenericDecisionCandidates(state);

    expect(candidates.length).toBeGreaterThanOrEqual(5);
    expect(
      candidates.slice(0, 5).every((candidate) => candidate.affects.length > 2),
    ).toBe(true);
    expect(
      candidates.some((candidate) => candidate.topic === "visibility_boundary"),
    ).toBe(true);
    expect(
      candidates.some(
        (candidate) => candidate.topic === "completion_semantics",
      ),
    ).toBe(true);
    expect(
      candidates.every(
        (candidate) => candidate.domainSpecificity === "GENERIC",
      ),
    ).toBe(true);
  });

  it("passes the blind evaluation threshold without fixture-specific production catalogs", () => {
    const result = evaluateGeneralizationBlindSet();

    expect(result.evaluations).toHaveLength(4);
    expect(
      result.evaluations.every(
        (evaluation) => evaluation.questions.length >= 5,
      ),
    ).toBe(true);
    expect(result.averageContextualRelevance).toBeGreaterThanOrEqual(4);
    expect(result.averageHiddenDecisionValue).toBeGreaterThanOrEqual(3.5);
    expect(result.averageGenericQuestionRisk).toBeLessThanOrEqual(2);
    expect(result.passes).toBe(true);
    for (const evaluation of result.evaluations) {
      expect(evaluation.firstFiveThemes.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("rejects technical questions while accepting grounded archetype questions", () => {
    const state = blindState(GENERALIZATION_BLIND_FIXTURES[2].rawIdea);
    const engine = new QuestionEngine();
    const questions = engine.generateQuestions(state, [], 5);

    expect(
      questions.every(
        (question) =>
          !/database|postgres|sqlite|orm|tech stack/i.test(question.text),
      ),
    ).toBe(true);
    expect(
      questions.every((question) => question.contextReferences.length > 0),
    ).toBe(true);
    expect(
      questions.every((question) => question.relatedRequirementIds.length > 0),
    ).toBe(true);
  });

  it("keeps domain priors as boosters while generic candidates remain in the CRM graph", () => {
    const state = blindState(
      "CRM for five brands with sales teams, leads, customers, quotations, and owner visibility.",
    );
    state.entities = ["Customer", "Lead", "Quotation", "Brand"];
    state.targetUsers = ["Sales", "Owner"];
    state.workflows = ["Capture a lead and schedule a follow-up"];
    const topics = new QuestionEngine()
      .generateQuestions(state, [], 5)
      .map((item) => item.topic);
    const genericTopics = generateGenericDecisionCandidates(state).map(
      (candidate) => candidate.topic,
    );

    expect(topics.slice(0, 3)).toEqual([
      "customer_identity",
      "sales_visibility",
      "lead_ownership",
    ]);
    expect(genericTopics).toContain("visibility_boundary");
    expect(genericTopics).toContain("lifecycle_transitions");
  });
});

describe("generic answer ownership and ambiguity", () => {
  it("records a natural-language decision with graph affects edges", () => {
    const state = blindState(GENERALIZATION_BLIND_FIXTURES[0].rawIdea);
    const engine = new QuestionEngine();
    const first = engine.generateQuestions(state, [], 1)[0];
    expect(first).toBeTruthy();

    const processed = engine.processAnswer(
      state,
      first.id,
      "Sebenernya semua dokter boleh lihat histori pasien kalau pasien sedang ditangani di cabang yang sama, tapi dokter luar cabang jangan.",
      first,
    );

    expect(processed.decision?.topic).toBe(first.topic);
    expect(processed.decision?.status).toBe("ACCEPTED");
    expect(processed.decision?.confidence).toBe("EXPLICIT");
    expect(processed.updatedState.decisionGraph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relation: "AFFECTS",
          to: "permissions",
        }),
      ]),
    );
    expect(
      engine.generateQuestions(processed.updatedState, [], 1)[0]?.topic,
    ).not.toBe(first.topic);
  });

  it("keeps ambiguous natural language unresolved and asks a focused follow-up", () => {
    const state = blindState(GENERALIZATION_BLIND_FIXTURES[1].rawIdea);
    const engine = new QuestionEngine();
    const first = engine.generateQuestions(state, [], 1)[0];
    const processed = engine.processAnswer(
      state,
      first.id,
      "Kayaknya tergantung kasus.",
      first,
    );
    const followUp = engine.generateQuestions(processed.updatedState, [], 1)[0];

    expect(processed.decision).toBeUndefined();
    expect(processed.updatedState.decisions).toHaveLength(0);
    expect(processed.updatedState.openQuestions).toContain(first.text);
    expect(followUp?.topic).toBe(first.topic);
    expect(followUp?.text.toLowerCase()).toMatch(/aturan|rule|contoh/);
  });

  it("uses an artifact gap as a question and improves only the decided section", () => {
    const state = blindState(GENERALIZATION_BLIND_FIXTURES[0].rawIdea);
    state.entities = ["Appointment", "Treatment plan"];
    state.roles = ["Doctor"];
    state.workflows = ["Manage appointments and treatment plans"];
    const engine = new QuestionEngine();
    const question = genericQuestionForTopic(state, "lifecycle_transitions");
    expect(question).toBeTruthy();
    const before = renderArtifacts(state);
    const beforeDebt = evaluateDecisionDebt(state);
    expect(before.PRD).toMatch(/## 11\. States and Statuses\n\n\[UNRESOLVED\]/);

    const afterState = engine.processAnswer(
      state,
      question!.id,
      "Scheduled, in progress, completed, cancelled, and can be reopened after review.",
      question!,
    ).updatedState;
    const after = renderArtifacts(afterState);
    const afterDebt = evaluateDecisionDebt(afterState);

    expect(after.PRD).toContain("lifecycle_transitions");
    expect(afterDebt.unresolvedArtifactSectionCount).toBeLessThan(
      beforeDebt.unresolvedArtifactSectionCount,
    );
    expect(after.ERD).toContain("lifecycle_transitions");
    expect(after.ERD).toContain("[UNRESOLVED]");
    expect(after.ERD).not.toContain("string id");
  });

  it("keeps generic decision revision semantics intact", () => {
    let state = blindState(GENERALIZATION_BLIND_FIXTURES[0].rawIdea);
    const engine = new QuestionEngine();
    const first = engine.generateQuestions(state, [], 1)[0];
    state = engine.processAnswer(
      state,
      first.id,
      "Only the assigned role sees the detailed history.",
      first,
    ).updatedState;
    const revision = engine.generateRevisionQuestion(state, first.topic!);
    expect(revision).toBeTruthy();
    const revised = engine.processAnswer(
      state,
      revision!.id,
      "Authorized roles in the same unit can see the shared history.",
      revision!,
    );
    expect(
      revised.updatedState.decisions.some(
        (decision) =>
          decision.topic === first.topic && decision.status === "SUPERSEDED",
      ),
    ).toBe(true);
    expect(
      revised.updatedState.decisions.some(
        (decision) =>
          decision.topic === first.topic && decision.status === "ACCEPTED",
      ),
    ).toBe(true);
  });
});

describe("generic contradiction semantics", () => {
  it("detects global visibility paired with strict ownership isolation", () => {
    let state = blindState(GENERALIZATION_BLIND_FIXTURES[2].rawIdea);
    ({ state } = recordDecision(state, {
      topic: "visibility_boundary",
      decision: "Everyone can see the full shared record.",
    }));
    ({ state } = recordDecision(state, {
      topic: "ownership_boundary",
      decision: "Only one owner can access and change the record.",
    }));

    expect(detectContradictions(state)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "generic-global-visibility-vs-strict-isolation",
        }),
      ]),
    );
  });

  it("detects immutable history paired with permanent deletion", () => {
    let state = blindState(GENERALIZATION_BLIND_FIXTURES[0].rawIdea);
    ({ state } = recordDecision(state, {
      topic: "history_auditability",
      decision: "History is immutable and always kept for audit.",
    }));
    ({ state } = recordDecision(state, {
      topic: "retention_deletion",
      decision: "Permanent delete removes all linked history.",
    }));

    expect(detectContradictions(state)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "generic-immutable-history-vs-hard-delete",
          severity: "BLOCKING",
        }),
      ]),
    );
  });
});
