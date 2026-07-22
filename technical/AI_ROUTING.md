# AI Routing

The AI gateway selects approved models by task, plan, privacy policy, health, and budget. 9Router is an internal routing implementation detail; it does not authorize users, meter plans, or expose shared consumer subscriptions.

| Task | Model tier | Output constraint |
|---|---|---|
| Extract project profile | low-cost | JSON schema |
| Draft contextual question | standard | JSON schema + project nouns |
| Analyze trade-off/conflict | stronger | cited state evidence |
| Render Markdown | low-cost or deterministic | manifest-validated |
| Reference summary | standard | no source-code reproduction |

## Safety controls

- Cloud calls use server-held business API credentials only.
- BYOK secrets are encrypted, scoped to the workspace, and never returned to the browser after save.
- Enforce per-workspace budgets, request limits, timeouts, and provider fallback.
- Never promise unlimited AI. If managed allowance ends, offer BYOK or renewal.
- Redact secrets and access tokens before model calls and logs.
