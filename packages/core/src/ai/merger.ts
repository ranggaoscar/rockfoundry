import { ProjectState, Assumption, Contradiction } from "../schema";
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
  const normalized = String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${prefix}-${normalized || "item"}`;
}

export function mergeExtraction(
  currentState: ProjectState,
  draft: InitialIdeaExtraction
): MergeResult {

  // Clone to avoid mutation
  const nextState = JSON.parse(JSON.stringify(currentState)) as ProjectState;
  
  const result: MergeResult = {
    state: nextState,
    appliedChanges: [],
    skippedChanges: [],
    assumptionsCreated: 0,
    questionsCreated: 0,
    conflictsDetected: 0
  };

  const processItemArray = (
    items: ExtractedItem[], 
    targetArray: string[], 
    targetName: string
  ) => {
    for (const item of items) {
      const valStr = String(item.value);
      if (item.confidence === "EXPLICIT") {
        if (!targetArray.includes(valStr)) {
          targetArray.push(valStr);
          result.appliedChanges.push(`Added explicit ${targetName}: ${valStr}`);
        } else {
          result.skippedChanges.push(`Already had ${targetName}: ${valStr}`);
        }
      } else if (item.confidence === "STRONGLY_INFERRED") {
        const statement = `Assume ${targetName} includes ${valStr} because: ${item.extractionReason}`;
        if (!nextState.assumptions.some((assumption) => assumption.statement === statement)) {
          nextState.assumptions.push({
            id: stableId("assump", statement),
            statement,
            confidence: "MEDIUM",
            impact: "MEDIUM"
          });
          result.assumptionsCreated++;
          result.appliedChanges.push(`Added strong inference as assumption for ${targetName}: ${valStr}`);
        } else {
          result.skippedChanges.push(`Already had assumption for ${targetName}: ${valStr}`);
        }
      } else if (item.confidence === "WEAKLY_INFERRED") {
        const question = `Verify ${targetName}: Do you need ${valStr}? (Reason: ${item.extractionReason})`;
        if (!nextState.openQuestions.includes(question)) {
          nextState.openQuestions.push(question);
          result.questionsCreated++;
          result.appliedChanges.push(`Added weak inference as question for ${targetName}: ${valStr}`);
        } else {
          result.skippedChanges.push(`Already had question for ${targetName}: ${valStr}`);
        }
      }
    }
  };

  // Base
  if (draft.normalizedSummary?.confidence === "EXPLICIT") {
    nextState.normalizedSummary = draft.normalizedSummary.value;
    result.appliedChanges.push("Updated normalized summary.");
  }
  
  if (draft.productType?.confidence === "EXPLICIT" && !nextState.productType) {
    nextState.productType = draft.productType.value;
    result.appliedChanges.push(`Updated product type to ${draft.productType.value}`);
  }

  // Arrays
  processItemArray(draft.primaryUsers, nextState.targetUsers, "user");
  processItemArray(draft.coreEntities, nextState.entities, "entity");
  processItemArray(draft.proposedCapabilities, nextState.features, "feature");
  processItemArray(draft.objectives, nextState.objectives, "objective");
  processItemArray(draft.constraints, nextState.constraints, "constraint");
  processItemArray(draft.integrationsMentioned, nextState.integrations, "integration");

  // Ambiguities become questions
  for (const amb of draft.ambiguities) {
    const question = `Clarify ambiguity: ${amb.value} (${amb.extractionReason})`;
    if (!nextState.openQuestions.includes(question)) {
      nextState.openQuestions.push(question);
      result.questionsCreated++;
    }
  }
  
  // Possible contradictions become soft warnings or contradictions
  for (const contra of draft.possibleContradictions) {
    const explanation = `AI noted potential conflict: ${contra.value}. Reason: ${contra.extractionReason}`;
    if (!nextState.contradictions.some((existing) => existing.explanation === explanation)) {
      nextState.contradictions.push({
        id: stableId("contra", explanation),
        severity: "WARNING",
        conflictingFields: [],
        explanation,
        recommendedResolution: "Review project scope to resolve this tension."
      });
      result.conflictsDetected++;
    }
  }

  return result;
}
