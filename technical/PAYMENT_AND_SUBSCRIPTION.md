# Payment and Subscription

Cloud Starter costs **Rp49,000 for 30 days**. This is a prepaid access term, not a promised auto-renewing subscription.

## Provider adapter

Implement one `PaymentProvider` contract: `createInvoice`, `verifyWebhook`, `getInvoiceStatus`, and `refund` (may return unsupported initially). Implement the SumoPod adapter first.

## Invoice flow

1. Server creates a local invoice with amount `49000`, status `pending`, and expiry.
2. Adapter creates a QRIS payment request and returns payment data.
3. Server displays it to the signed-in owner.
4. Webhook verifies provider signature, provider event ID, invoice reference, currency, amount, and successful status.
5. Transactionally persist a unique payment event and extend entitlement by 30 days.

Duplicate callbacks must be harmless. Expired/failed invoices never grant access. Confirm current SumoPod fields and signature procedure before implementation; do not infer them from screenshots.
