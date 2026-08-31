import { describe, expect, it } from "vitest";
import { createInitialProjectState } from "@rockfoundry/core";
import { isProductDraftCurrent } from "./project-truth";

describe("Product Draft currentness", () => {
  it("keeps a draft current after design-only changes", () => {
    const draftState = createInitialProjectState({
      id: "project-1",
      name: "Gorengan",
      rawIdea: "Order gorengan from a seller.",
    });
    const currentState = structuredClone(draftState);
    currentState.studio.status = "NEEDS_REVIEW";
    currentState.studio.currentVersion = 1;
    currentState.generationMetadata.designQualityReview = { accepted: false };

    expect(isProductDraftCurrent(draftState, currentState)).toBe(true);
  });

  it("marks a draft stale for a user-confirmed product rule", () => {
    const draftState = createInitialProjectState({
      id: "project-1",
      name: "Orders",
      rawIdea: "Manage local orders.",
    });
    const currentState = structuredClone(draftState);
    const instruction =
      "Only the seller/owner can confirm an order. Customers cannot edit an order after payment.";
    currentState.businessRules = [
      "Only the seller/owner can confirm an order.",
      "Customers cannot edit an order after payment.",
    ];
    currentState.provenance[
      "businessRules.Only the seller/owner can confirm an order."
    ] = { source: "USER", confidence: "EXPLICIT", evidence: instruction };
    currentState.provenance[
      "businessRules.Customers cannot edit an order after payment."
    ] = { source: "USER", confidence: "EXPLICIT", evidence: instruction };

    expect(isProductDraftCurrent(draftState, currentState)).toBe(false);
  });

  it("marks a draft stale when product truth changes", () => {
    const draftState = createInitialProjectState({
      id: "project-1",
      name: "Gorengan",
      rawIdea: "Order gorengan from a seller.",
    });
    const currentState = structuredClone(draftState);
    currentState.decisions.push({
      id: "delivery",
      topic: "delivery",
      decision: "Sellers offer delivery.",
      source: "USER",
      confidence: "EXPLICIT",
      status: "ACCEPTED",
      affects: [],
    });

    expect(isProductDraftCurrent(draftState, currentState)).toBe(false);
  });
});
