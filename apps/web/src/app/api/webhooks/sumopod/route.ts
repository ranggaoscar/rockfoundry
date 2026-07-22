import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";

// POST /api/webhooks/sumopod (Simulated webhook endpoint)
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    
    // Simulate webhook signature verification in development
    if (process.env.NODE_ENV === "production") {
       return new Response("Webhook simulation disabled in production", { status: 403 });
    }

    const { event, data } = payload;

    if (event !== "payment.success") {
      return new Response("Event ignored", { status: 200 });
    }

    const { invoiceId, amount, subscriptionId } = data;

    // Verify idempotency
    const existingPayment = await prisma.payment.findUnique({
      where: { id: invoiceId } // Assuming invoiceId maps to our payment.id, or we search by metadata
    });

    if (existingPayment?.status === "paid") {
      return new Response("Already processed", { status: 200 });
    }

    // Process payment and activate subscription
    await prisma.$transaction(async (tx) => {
      // Create or update payment
      await tx.payment.upsert({
        where: { id: invoiceId },
        update: { status: "paid", amount },
        create: {
          id: invoiceId,
          subscriptionId,
          provider: "sumopod_simulated",
          amount,
          currency: "IDR",
          status: "paid"
        }
      });

      // Extend or activate subscription
      const sub = await tx.subscription.findUnique({ where: { id: subscriptionId } });
      if (sub) {
        // Activate for 30 days from now
        await tx.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: "active",
            startsAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          }
        });
      }
    });

    return new Response("Webhook processed", { status: 200 });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response("Internal error", { status: 500 });
  }
}
