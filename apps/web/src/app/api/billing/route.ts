import { NextRequest } from "next/server";
import { requireAuth, AuthError, jsonError } from "@/lib/auth-helpers";
import { prisma } from "@rockfoundry/db";

// POST /api/billing/simulate
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    
    // Simulate Cloud Starter invoice creation (Pending state)
    const sub = await prisma.subscription.create({
      data: {
        userId: session.user.id,
        plan: "cloud_starter",
        status: "pending",
        startsAt: new Date(),
        expiresAt: new Date(), 
      }
    });

    const invoiceId = `inv_${Date.now()}`;

    const payment = await prisma.payment.create({
      data: {
        id: invoiceId,
        subscriptionId: sub.id,
        provider: "sumopod_simulated",
        amount: 49000,
        currency: "IDR",
        status: "pending",
        metadata: { simulated: true }
      }
    });

    // In a real flow, we'd return a checkout URL here.
    // We return the pending entities. The client will call the mock webhook to simulate payment completion.
    return Response.json({ 
      checkoutUrl: `/simulate-checkout?invoiceId=${invoiceId}&subscriptionId=${sub.id}`,
      subscription: sub, 
      payment 
    });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    return jsonError("Internal error", 500);
  }
}

// GET /api/billing/status
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    
    const sub = await prisma.subscription.findFirst({
      where: {
        userId: session.user.id,
        status: "active",
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: "desc" }
    });

    return Response.json({ 
      active: !!sub,
      subscription: sub
    });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    return jsonError("Internal error", 500);
  }
}