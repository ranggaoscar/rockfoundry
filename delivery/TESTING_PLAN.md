# Agentic V1 Testing Plan

Run the smallest tests that protect product invariants, then run the full quality gate before review.

| Layer                   | Checks                                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core unit               | Canonical state, provenance, decisions, assumptions, decision graph, requirements, contradictions, readiness                                                                |
| Agent unit              | Action schema validation, permission validation, stop conditions, confirmed-decision protection, next-action selection                                                      |
| Question quality        | Contextual project nouns, material impact, generic-question rejection, domain fixture diversity                                                                             |
| Tool unit               | URL validation, SSRF/private IP blocking, redirect/size/timeout limits, GitHub URL/license handling, prompt-injection isolation                                             |
| Artifact unit           | BRD/PRD/ERD structure, Mermaid output, unresolved-decision visibility, cross-document consistency                                                                           |
| Persistence integration | SQLite create/reopen, message append, state revision, decision history, artifact status                                                                                     |
| Provider integration    | Explicit Mock Provider, adapter request normalization, safe failure, no silent mock fallback                                                                                |
| E2E                     | Start empty, create project, describe idea, contextual question, answer, readiness, paste URL, inspect reference, generate three artifacts, preview, export, restart/reopen |
| Browser manual          | Desktop, tablet, mobile, keyboard Enter/Shift+Enter, drawers, provider settings, loading, retry, error, tool activity disclosure                                            |
| Security                | Key redaction, no secrets in artifacts/logs, local path handling, no remote code execution                                                                                  |

## Domain fixtures

Use at least:

```text
marble warehouse inventory
rental car booking
WhatsApp sales CRM
school attendance
restaurant booking
marketplace
habit tracker
AI content tool
construction operations
field sales
```

Questions should materially differ between these projects.

## Commands

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

Run a real-provider smoke test only when credentials are explicitly configured. Otherwise report it as skipped, not passed.

Never run destructive Prisma resets or delete Docker volumes as part of tests.
