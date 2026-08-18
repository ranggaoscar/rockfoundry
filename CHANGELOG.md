# Changelog

## Agentic V1 week 2 — CRM magic moment

- Extracted a stable CRM decision catalog and queue: identity → visibility → ownership → quotation → duplicates.
- Added CRM contradiction rules for identity/visibility/duplicate conflicts.
- Returned decision impact (blast radius) from answer processing into the workspace chat.
- Added CRM golden fixtures/tests for five multi-brand ideas.
- Rewrote the public README to be shorter and clearer for GitHub visitors.

## Agentic V1 wedge foundations

- Locked the beachhead wedge around multi-brand / multi-unit decision discovery.
- Added Decision Debt scoring as a first-class product signal (higher = more invention risk).
- Expanded export from BRD/PRD/ERD into an anti-invention handoff package:
  `DO_NOT_INVENT.md`, `DECISIONS.md`, `decisions.json`, `INVARIANTS.md`, `READINESS.md`, and `AGENT_HANDOFF.md`.
- Surfaced Decision Debt and top invention risks in the project workspace.
- Added wedge strategy, gap map, and 30-day build plan under `product/` and `delivery/`.

## Agentic V1 product reset

RockFoundry is being reset from the cancelled Alpha SaaS direction to a free, open-source, local-first agentic product discovery system.

- Reframed the product around Decision Debt and hidden product decisions.
- Removed product requirements for accounts, authentication, subscriptions, billing, payments, SumoPod, Cloud Starter, entitlements, usage credits, and managed AI.
- Replaced the required hosted PostgreSQL/MinIO architecture with SQLite, Prisma, and local filesystem persistence.
- Established BYOK provider neutrality for OpenAI, Anthropic, Gemini, OpenRouter, Ollama, 9Router, and custom OpenAI-compatible APIs.
- Reduced user-facing artifacts to `BRD.md`, `PRD.md`, and `ERD.md`.
- Added the chat-first workspace direction with progressive disclosure for context, tools, readiness, documents, and provider settings.
- Defined structured agent actions, deterministic state mutation, provenance, Decision Graph relationships, safe reference tools, and cross-document consistency validation.

This branch is active development. Previous Alpha SaaS work remains recoverable in Git history and is not a compatibility target for Agentic V1.
