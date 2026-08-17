# Changelog

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
