"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type BillingStatus = {
  active: boolean;
  subscription: { id: string; plan: string; status: string; expiresAt: string | null } | null;
  pendingPayment: { id: string; amount: number; status: string; subscriptionId: string } | null;
  usage: { projects: number; exports: number; references: number; aiCalls: number };
  limits: { projects: number; exports: number; references: number; aiCalls: number };
  simulationEnabled: boolean;
};

export default function AccountPage() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/billing");
      if (!response.ok) throw new Error("Unable to load subscription details");
      setStatus(await response.json());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load subscription details");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function createInvoice() {
    setPaying(true);
    setError("");
    try {
      const response = await fetch("/api/billing", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create invoice");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create invoice");
    } finally {
      setPaying(false);
    }
  }

  async function simulatePayment() {
    if (!status?.pendingPayment) return;
    setPaying(true);
    setError("");
    try {
      const response = await fetch("/api/webhooks/sumopod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "payment.success",
          data: {
            invoiceId: status.pendingPayment.id,
            amount: status.pendingPayment.amount,
            subscriptionId: status.pendingPayment.subscriptionId,
          },
        }),
      });
      if (!response.ok) throw new Error("Payment simulation failed");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment simulation failed");
    } finally {
      setPaying(false);
    }
  }

  if (loading) return <main className="min-h-screen grid place-items-center" role="status">Loading subscription...</main>;
  if (!status) return <main className="min-h-screen grid place-items-center" role="alert">{error || "Subscription unavailable"}</main>;

  const planName = status.subscription?.plan === "cloud_starter" ? "Cloud Starter" : "Community";
  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <nav><Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">Projects</Link></nav>
        <header><h1 className="text-2xl font-bold">Account and subscription</h1><p className="mt-1 text-sm text-gray-600">Cloud Starter is a development payment simulation in this alpha.</p></header>
        {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
        <section className="rounded-lg border bg-white p-5 space-y-2">
          <h2 className="font-semibold">{planName}</h2>
          <p className="text-sm">Status: <strong>{status.subscription?.status || "community"}</strong></p>
          <p className="text-sm">Expires: {status.subscription?.expiresAt ? new Date(status.subscription.expiresAt).toLocaleDateString() : "No expiry"}</p>
          {!status.active && !status.pendingPayment && status.simulationEnabled && <Button onClick={createInvoice} disabled={paying}>Upgrade to Cloud Starter</Button>}
        </section>
        {status.pendingPayment && <section className="rounded-lg border bg-white p-5 space-y-3">
          <h2 className="font-semibold">Pending invoice</h2>
          <p className="text-sm">QRIS checkout placeholder: Rp{status.pendingPayment.amount.toLocaleString("id-ID")}</p>
          <p className="text-xs text-gray-500">Invoice status: {status.pendingPayment.status}</p>
          {status.simulationEnabled && <Button onClick={simulatePayment} disabled={paying}>Simulate successful payment</Button>}
        </section>}
        <section className="rounded-lg border bg-white p-5"><h2 className="font-semibold mb-3">Usage</h2><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt>Projects</dt><dd>{status.usage.projects} / {status.limits.projects}</dd></div><div><dt>Exports (30 days)</dt><dd>{status.usage.exports} / {status.limits.exports}</dd></div><div><dt>References</dt><dd>{status.usage.references} / {status.limits.references}</dd></div><div><dt>Managed AI</dt><dd>{status.usage.aiCalls} / {status.limits.aiCalls}</dd></div></dl></section>
      </div>
    </main>
  );
}
