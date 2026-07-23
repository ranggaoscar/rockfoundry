import { prisma } from "@rockfoundry/db";
import { DEFAULT_PLAN, EntitlementService, getPlan } from "@rockfoundry/core";

const entitlements = new EntitlementService();

export async function getSubscriptionInfo(userId: string) {
  const now = new Date();
  const subscription = await prisma.subscription.findFirst({
    where: { userId, status: "active" },
    orderBy: { createdAt: "desc" },
  });
  const expired = Boolean(subscription?.expiresAt && subscription.expiresAt <= now);
  const plan = subscription?.plan || DEFAULT_PLAN;
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [projectsUsed, exportsUsed, referencesUsed, aiCallsUsed] = await Promise.all([
    prisma.projectMember.count({ where: { userId, project: { deletedAt: null } } }),
    prisma.generatedDocument.count({ where: { project: { members: { some: { userId } } }, type: "ZIP_EXPORT", createdAt: { gte: since } } }),
    prisma.reference.count({ where: { project: { members: { some: { userId } } } } }),
    prisma.usageEvent.count({ where: { userId, createdAt: { gte: since }, type: { in: ["ai_generation", "ai_analysis"] } } }),
  ]);
  const info = {
    plan,
    status: expired ? "expired" as const : "active" as const,
    expiresAt: subscription?.expiresAt || null,
    projectsUsed,
    exportsUsed,
    referencesUsed,
    aiCallsUsed,
  };
  return { info, subscription, plan: getPlan(plan), service: entitlements };
}
