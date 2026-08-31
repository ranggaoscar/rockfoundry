import type { ProjectState } from "@rockfoundry/core";

const NON_PRODUCT_TRUTH_FIELDS = new Set([
  "id",
  "name",
  "studio",
  "generationMetadata",
  "readiness",
  "draftSpecReady",
  "readinessScore",
  "readinessBreakdown",
  "decisionDebt",
  "discovery",
]);

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  return value;
}

export function productTruthFingerprint(state: ProjectState) {
  const productTruth = Object.fromEntries(
    Object.entries(state).filter(
      ([key]) => !NON_PRODUCT_TRUTH_FIELDS.has(key),
    ),
  );
  return JSON.stringify(stableValue(productTruth));
}

export function isProductDraftCurrent(
  draftState: ProjectState,
  currentState: ProjectState,
) {
  return productTruthFingerprint(draftState) === productTruthFingerprint(currentState);
}
