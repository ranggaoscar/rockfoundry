import { getPlan, PlanConfig } from "./plans";

export interface EntitlementResult {
  allowed: boolean;
  reason?: string;
  limit?: number;
  current?: number;
  remaining?: number;
}

export interface SubscriptionInfo {
  plan: string;
  status: "active" | "expired" | "canceled";
  expiresAt: Date | null;
  projectsUsed: number;
  exportsUsed: number;
  referencesUsed: number;
  aiCallsUsed: number;
}

/**
 * Server-side entitlement enforcement.
 * All limits are checked here, never on the client.
 */
export class EntitlementService {
  /**
   * Check if user can create a new project.
   */
  checkProjectLimit(subscription: SubscriptionInfo): EntitlementResult {
    const plan = getPlan(subscription.plan);

    if (subscription.status === "expired") {
      return {
        allowed: false,
        reason: "Your subscription has expired. Renew to create new projects.",
      };
    }

    if (subscription.projectsUsed >= plan.maxActiveProjects) {
      return {
        allowed: false,
        reason: `You have reached the maximum of ${plan.maxActiveProjects} active projects for the ${plan.name} plan.`,
        limit: plan.maxActiveProjects,
        current: subscription.projectsUsed,
      };
    }

    return {
      allowed: true,
      remaining: plan.maxActiveProjects - subscription.projectsUsed,
      limit: plan.maxActiveProjects,
      current: subscription.projectsUsed,
    };
  }

  /**
   * Check if user can generate an export.
   */
  checkExportLimit(subscription: SubscriptionInfo): EntitlementResult {
    const plan = getPlan(subscription.plan);

    if (subscription.status === "expired") {
      return {
        allowed: false,
        reason: "Your subscription has expired. Renew to generate exports.",
      };
    }

    if (subscription.exportsUsed >= plan.maxExportsPerPeriod) {
      return {
        allowed: false,
        reason: `You have reached the maximum of ${plan.maxExportsPerPeriod} exports for this period.`,
        limit: plan.maxExportsPerPeriod,
        current: subscription.exportsUsed,
      };
    }

    return {
      allowed: true,
      remaining: plan.maxExportsPerPeriod - subscription.exportsUsed,
      limit: plan.maxExportsPerPeriod,
      current: subscription.exportsUsed,
    };
  }

  /**
   * Check if user can add a reference.
   */
  checkReferenceLimit(subscription: SubscriptionInfo): EntitlementResult {
    const plan = getPlan(subscription.plan);

    if (subscription.referencesUsed >= plan.maxReferences) {
      return {
        allowed: false,
        reason: `You have reached the maximum of ${plan.maxReferences} references for the ${plan.name} plan.`,
        limit: plan.maxReferences,
        current: subscription.referencesUsed,
      };
    }

    return {
      allowed: true,
      remaining: plan.maxReferences - subscription.referencesUsed,
      limit: plan.maxReferences,
      current: subscription.referencesUsed,
    };
  }

  /**
   * Check if user can make an AI call.
   */
  checkAiLimit(subscription: SubscriptionInfo): EntitlementResult {
    const plan = getPlan(subscription.plan);

    if (subscription.aiCallsUsed >= plan.maxAiCalls) {
      return {
        allowed: false,
        reason: `You have reached the maximum of ${plan.maxAiCalls} AI calls for the ${plan.name} plan.`,
        limit: plan.maxAiCalls,
        current: subscription.aiCallsUsed,
      };
    }

    return {
      allowed: true,
      remaining: plan.maxAiCalls - subscription.aiCallsUsed,
      limit: plan.maxAiCalls,
      current: subscription.aiCallsUsed,
    };
  }

  /**
   * Validate that a subscription is active.
   */
  checkSubscriptionActive(subscription: SubscriptionInfo): EntitlementResult {
    const plan = getPlan(subscription.plan);

    // Community plan is always active
    if (subscription.plan === "community") {
      return { allowed: true };
    }

    if (subscription.status === "expired") {
      return {
        allowed: false,
        reason: "Your Cloud Starter subscription has expired. Renew to continue using cloud features.",
      };
    }

    if (subscription.expiresAt && new Date(subscription.expiresAt) < new Date()) {
      return {
        allowed: false,
        reason: "Your subscription period has ended. Renew to continue.",
      };
    }

    return { allowed: true };
  }
}
