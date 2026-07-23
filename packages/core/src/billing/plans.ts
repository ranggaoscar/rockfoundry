/**
 * Centralized plan configuration.
 * All limits and pricing are defined here, not scattered across the codebase.
 */

export interface PlanConfig {
  id: string;
  name: string;
  price: number; // in IDR (Indonesian Rupiah)
  currency: string;
  accessPeriodDays: number;
  maxActiveProjects: number;
  maxExportsPerPeriod: number;
  maxReferences: number;
  maxAiCalls: number;
  features: string[];
}

export const PLANS: Record<string, PlanConfig> = {
  community: {
    id: "community",
    name: "Community",
    price: 0,
    currency: "IDR",
    accessPeriodDays: 0, // Unlimited
    maxActiveProjects: 10,
    maxExportsPerPeriod: 10,
    maxReferences: 20,
    maxAiCalls: 50, // With BYOK
    features: [
      "Self-hosted",
      "Bring your own AI key",
      "Unlimited local projects",
      "Community support",
    ],
  },
  cloud_starter: {
    id: "cloud_starter",
    name: "Cloud Starter",
    price: 49000,
    currency: "IDR",
    accessPeriodDays: 30,
    maxActiveProjects: 5,
    maxExportsPerPeriod: 3,
    maxReferences: 10,
    maxAiCalls: 100,
    features: [
      "Managed AI",
      "Cloud storage",
      "Reference analysis",
      "30-day access",
      "Email support",
    ],
  },
};

export const DEFAULT_PLAN = "community";

export function getPlan(planId: string): PlanConfig {
  return PLANS[planId] || PLANS[DEFAULT_PLAN];
}

export function getActivePlans(): PlanConfig[] {
  return Object.values(PLANS);
}
