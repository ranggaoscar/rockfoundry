# Agentic V1 Acceptance Criteria

## Product and local setup

- Given a clean machine with Node.js and pnpm, the repository can install and start without PostgreSQL, MinIO, Docker, account creation, payment, or hosted RockFoundry services.
- Given an existing Alpha PostgreSQL volume, Agentic V1 does not delete it or migrate it automatically.
- Given no provider credentials, the user can explicitly choose Mock Provider for offline demo and tests.

## Discovery

- Given a rough idea containing project nouns, the first agent question references known context.
- Given a question that could be asked unchanged for unrelated products, quality validation rejects it.
- Given a material decision, RockFoundry recommends an option, explains why it matters, and waits for user confirmation.
- Given a strong inference, it is recorded as an assumption until confirmed.
- Given a weak inference or unknown, it remains an open question.
- Given a changed decision, history remains available and affected concepts become stale/recheckable.

## Agent actions and tools

- Every supported action validates against a schema before execution.
- State mutation occurs only in deterministic handlers.
- Tool activity exposes safe summaries only, never raw JSON, secrets, or chain-of-thought.
- Public reference content is treated as untrusted and downloaded code is never executed.
- Website inspection blocks SSRF targets, oversized responses, redirect abuse, and long-running fetches.
- GitHub inspection never reads `.env` files and reports license evidence.

## Readiness and artifacts

- Readiness shows Business, Product, and Data coverage plus blocking decisions.
- Readiness is not calculated only from questions answered.
- A user may generate draft artifacts before build readiness is complete.
- BRD, PRD, and ERD render from canonical state and preserve unresolved decisions visibly.
- ERD includes Mermaid.
- Cross-document validation returns `PASS`, `WARNING`, or `BLOCKING` for mismatches.

## UI

- First launch shows a minimal centered idea composer and examples, not a dashboard, billing portal, account form, or technical setup.
- Active projects use a compact sidebar, wide conversation, sticky composer, inline question options, compact tool activity, and progressive-disclosure drawers.
- Documents are accessible through one clear action and can be previewed, regenerated, copied, and downloaded.
- Provider settings are available when needed and keys never appear in project output.
- Mobile uses conversation-first layout with sidebar/documents in drawers or sheets.
- Provider and tool errors are actionable and do not expose raw stack traces.

## Reliability

- Projects, messages, state, decisions, references, tool runs, and artifact statuses survive app restart.
- Mock-provider E2E completes idea → contextual question → decision → reference → artifacts → export → reopen without HTTP 500.
