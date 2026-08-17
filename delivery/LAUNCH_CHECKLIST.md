# Agentic V1 Review Checklist

## Product

- [ ] Decision Debt is explained consistently in README, PRD, positioning, and UI copy.
- [ ] The chat asks contextual questions instead of rendering a generic questionnaire.
- [ ] Confirmed decisions, assumptions, contradictions, provenance, and readiness remain visible.
- [ ] The app stops at BRD, PRD, and ERD generation and does not generate application source code.

## Local setup

- [ ] Fresh install works without an account, payment, external database, object storage, or Docker.
- [ ] SQLite migration and project persistence pass on Windows.
- [ ] Previous Alpha database is documented as not automatically migrated.
- [ ] Provider credentials are not stored in canonical project state or exports.

## Agent safety

- [ ] Structured actions validate before state mutation.
- [ ] User decisions cannot be silently overwritten.
- [ ] Website and GitHub content is untrusted evidence.
- [ ] Private-network fetches, remote code execution, and secret logging are blocked.

## UI

- [ ] First launch is a centered idea composer.
- [ ] Sidebar, conversation, composer, tool activity, drawers, documents, provider settings, and mobile states work.
- [ ] Error messages are human-readable and do not leak stack traces or provider payloads.

## Quality

- [ ] Core unit tests pass.
- [ ] Integration tests pass.
- [ ] Deterministic mock-provider E2E passes.
- [ ] Format, lint, typecheck, and build pass.
- [ ] Real-provider smoke test is run only when credentials are intentionally configured, otherwise reported as skipped.

## GitHub

- [ ] Repository description and topics match Agentic V1, or the exact proposed values are reported when authentication is unavailable.
- [ ] No release is created and `main` is not merged.
