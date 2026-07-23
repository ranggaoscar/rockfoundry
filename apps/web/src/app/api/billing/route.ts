export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";
import { requireAuth, AuthError, jsonError } from "@/lib/auth-helpers";
import { getSubscriptionInfo } from "@/lib/entitlements";

const simulationEnabled = () => process.env.NODE_ENV !== "production";

export async function POST(req: NextRequest) {
  try {
    if (!simulationEnabled()) return jsonError("Billing simulation is unavailable in production", 404);
    const session = await requireAuth(req);
    const pending = await prisma.payment.findFirst({
      where: { subscription: { userId: session.user.id }, status: "pending", provider: "sumopod_simulated" },
      orderBy: { createdAt: "desc" },
    });
    if (pending) return Response.json({ payment: pending, duplicate: true });

    const subscription = await prisma.subscription.create({
      data: { userId: session.user.id, plan: "cloud_starter", status: "pending", startsAt: new Date(), expiresAt: new Date() },
    });
    const invoiceId = `inv_${crypto.randomUUID()}`;
    const payment = await prisma.payment.create({
      data: { id: invoiceId, subscriptionId: subscription.id, provider: "sumopod_simulated", amount: 49000, currency: "IDR", status: "pending", metadata: { simulated: true } },
    });
    return Response.json({ checkoutUrl: `/account?invoiceId=${invoiceId}`, subscription, payment }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return jsonError(error.message, error.status);
    return jsonError("Unable to create invoice", 500);
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const { info, subscription, plan } = await getSubscriptionInfo(session.user.id);
    const pendingPayment = await prisma.payment.findFirst({
      where: { subscription: { userId: session.user.id }, status: "pending" },
      select: { id: true, amount: true, status: true, subscriptionId: true },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({
      active: info.status === "active" && subscription?.plan === "cloud_starter",
      subscription: subscription ? { id: subscription.id, plan: subscription.plan, status: info.status, expiresAt: subscription.expiresAt } : null,
      pendingPayment,
      usage: { projects: info.projectsUsed, exports: info.exportsUsed, references: info.referencesUsed, aiCalls: info.aiCallsUsed },
      limits: { projects: plan.maxActiveProjects, exports: plan.maxExportsPerPeriod, references: plan.maxReferences, aiCalls: plan.maxAiCalls },
      simulationEnabled: simulationEnabled(),
    });
  } catch (error) {
    if (error instanceof AuthError) return jsonError(error.message, error.status);
    return jsonError("Unable to load billing status", 500);
  }
}
