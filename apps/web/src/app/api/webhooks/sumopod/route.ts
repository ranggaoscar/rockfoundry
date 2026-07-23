import { NextRequest } from "next/server";
import { prisma } from "@rockfoundry/db";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return new Response("Webhook simulation disabled in production", { status: 403 });
  try {
    const payload = await req.json();
    if (payload.event !== "payment.success") return new Response("Event ignored", { status: 200 });
    const { invoiceId, amount, subscriptionId } = payload.data || {};
    if (!invoiceId || !subscriptionId || typeof amount !== "number") return new Response("Invalid webhook payload", { status: 400 });

    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: invoiceId } });
      if (!payment || payment.subscriptionId !== subscriptionId || payment.amount !== amount) throw new Error("Invoice does not match subscription");
      // A second delivery must not alter expiry. The paid transition is the idempotency gate.
      const paid = await tx.payment.updateMany({ where: { id: invoiceId, status: "pending" }, data: { status: "paid" } });
      if (!paid.count) return;
      await tx.subscription.update({
        where: { id: subscriptionId },
        data: { status: "active", startsAt: new Date(), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      });
    });
    return new Response("Webhook processed", { status: 200 });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Webhook failed", { status: 400 });
  }
}
