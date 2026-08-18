# Changelog

## STRONG DEMO P1 trust fixes

- Replaced first-match domain regex with weighted multi-signal scoring (`scoreDiscoveryDomains`) so weak terms like `quotation` cannot misroute inventory/rental ideas to CRM.
- Fixed Decision Debt math: residual unresolved artifact sections now count; finishing the discovery queue can no longer clamp debt to `0/100 LOW` while BRD/PRD/ERD gaps remain.
- Exposed decision revision in the Context drawer (`Revise`) using core `SUPERSEDED` support; questions API accepts `mode: "revise"` + topic.
- Cleaned GENERAL fallback question copy so raw project names are not interpolated into broken English.
- Added contradiction rule for shared sales pool vs brand-scoped visibility.
- Added `packages/core/src/tests/strong-demo-p1.test.ts` regression coverage.

## Agentic V1 demo-ready distribution pass

- Fixed landing settings dead-end with a local BYOK drawer.
- Loaded recent projects on landing and project sidebars.
- Replaced fake provider form with honest env-based setup copy.
- Added `DEMO.md` share script and demo-pass report.
- Updated package metadata keywords/homepage for GitHub discovery.

## Agentic V1 week 4 — beachhead polish and freeze

- Clarified Decision Debt vs build readiness copy in the workspace UI.
- Reworked landing/empty-state messaging to teach the category in one glance.
- Added rental + inventory support-domain regression tests (no new beachhead).
- Added OSS demo launch checklist and Week 4 scope freeze decision.

## Agentic V1 week 3 — coding-agent win proof

- Added a deterministic invention-risk harness comparing raw idea vs RockFoundry handoff.
- Added `pnpm eval:invention` CRM benchmark (exit check: ≥3/5 wins).
- Tuned `AGENT_HANDOFF.md` with Claude Code, Codex, and Cursor prompts.
- Derived PRD/ERD permissions, ownership, relationships, and edge cases from accepted decisions.

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
