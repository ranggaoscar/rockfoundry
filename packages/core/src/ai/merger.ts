import {
  ProjectState,
  Contradiction,
  Assumption,
  ProvenanceSource,
} from "../schema";
import { InitialIdeaExtraction, ExtractedItem } from "./schema";

export type MergeResult = {
  state: ProjectState;
  appliedChanges: string[];
  skippedChanges: string[];
  assumptionsCreated: number;
  questionsCreated: number;
  conflictsDetected: number;
};

function stableId(prefix: string, value: unknown): string {
  const normalized = String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${prefix}-${normalized || "item"}`;
}

function asText(value: unknown) {
  return String(value).trim();
}

export function mergeExtraction(
  currentState: ProjectState,
  draft: InitialIdeaExtraction,
): MergeResult {
  const nextState = JSON.parse(JSON.stringify(currentState)) as ProjectState;
  const result: MergeResult = {
    state: nextState,
    appliedChanges: [],
    skippedChanges: [],
    assumptionsCreated: 0,
    questionsCreated: 0,
    conflictsDetected: 0,
  };

  const addProvenance = (key: string, item: ExtractedItem) => {
    nextState.provenance[key] = {
      source:
        item.confidence === "EXPLICIT"
          ? "USER"
          : ("AGENT_INFERENCE" as ProvenanceSource),
      confidence: item.confidence,
      evidence: item.evidenceText || item.extractionReason,
    };
  };

  const processItemArray = (
    items: ExtractedItem[],
    targetArray: string[],
    targetName: string,
  ) => {
    for (const item of items) {
      const value = asText(item.value);
      if (!value) continue;
      const key = `${targetName}.${value}`;
      addProvenance(key, item);
      if (item.confidence === "EXPLICIT") {
        if (!targetArray.includes(value)) {
          targetArray.push(value);
          result.appliedChanges.push(`Added explicit ${targetName}: ${value}`);
        } else {
          result.skippedChanges.push(`Already had ${targetName}: ${value}`);
        }
        continue;
      }

      if (item.confidence === "STRONGLY_INFERRED") {
        const statement = `The project may include ${value} as ${targetName}. Reason: ${item.extractionReason}`;
        if (
          !nextState.assumptions.some(
            (assumption) => assumption.statement === statement,
          )
        ) {
          const assumption: Assumption = {
            id: stableId("assump", statement),
            statement,
            confidence: "STRONGLY_INFERRED",
            impact: "MEDIUM",
            source: "AGENT_INFERENCE",
            validationStrategy:
              "Confirm this during discovery before treating it as a product rule.",
            resolved: false,
          };
          nextState.assumptions.push(assumption);
          result.assumptionsCreated += 1;
          result.appliedChanges.push(
            `Recorded inference as an assumption for ${targetName}: ${value}`,
          );
        }
        continue;
      }

      if (
        item.confidence === "WEAKLY_INFERRED" ||
        item.confidence === "UNKNOWN"
      ) {
        const question = `Should ${targetName} include ${value}? This was not explicit in the idea. Reason: ${item.extractionReason}`;
        if (!nextState.openQuestions.includes(question)) {
          nextState.openQuestions.push(question);
          result.questionsCreated += 1;
          result.appliedChanges.push(
            `Added unresolved question for ${targetName}: ${value}`,
          );
        }
      }
    }
  };

  if (draft.normalizedSummary?.confidence === "EXPLICIT") {
    nextState.normalizedSummary = asText(draft.normalizedSummary.value);
    addProvenance("normalizedSummary", draft.normalizedSummary);
    result.appliedChanges.push("Updated normalized summary.");
  }
  if (draft.productType?.confidence === "EXPLICIT" && !nextState.productType) {
    nextState.productType = asText(draft.productType.value);
    addProvenance("productType", draft.productType);
    result.appliedChanges.push(
      `Updated product type to ${nextState.productType}`,
    );
  }

  processItemArray(draft.primaryUsers, nextState.targetUsers, "user");
  processItemArray(draft.userProblems, nextState.problems, "problem");
  processItemArray(draft.coreEntities, nextState.entities, "entity");
  processItemArray(draft.proposedCapabilities, nextState.features, "feature");
  processItemArray(draft.objectives, nextState.objectives, "objective");
  processItemArray(draft.expectedWorkflows, nextState.workflows, "workflow");
  processItemArray(
    draft.integrationsMentioned,
    nextState.integrations,
    "integration",
  );
  processItemArray(draft.platforms, nextState.platforms, "platform");
  processItemArray(draft.constraints, nextState.constraints, "constraint");

  for (const ambiguity of draft.ambiguities) {
    const question = `Clarify: ${asText(ambiguity.value)}. Reason: ${ambiguity.extractionReason}`;
    if (!nextState.openQuestions.includes(question)) {
      nextState.openQuestions.push(question);
      result.questionsCreated += 1;
    }
  }

  for (const contra of draft.possibleContradictions) {
    const explanation = `Potential conflict: ${asText(contra.value)}. Reason: ${contra.extractionReason}`;
    if (
      !nextState.contradictions.some(
        (existing) => existing.explanation === explanation,
      )
    ) {
      const contradiction: Contradiction = {
        id: stableId("contra", explanation),
        severity: "WARNING",
        conflictingFields: [],
        explanation,
        recommendedResolution:
          "Ask the user to choose which behavior should be canonical.",
        status: "OPEN",
      };
      nextState.contradictions.push(contradiction);
      result.conflictsDetected += 1;
    }
  }

  return result;
}
