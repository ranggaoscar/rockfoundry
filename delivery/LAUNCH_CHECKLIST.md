# Agentic V1 Review Checklist

For the public OSS demo path, also complete [`OSS_DEMO_LAUNCH_CHECKLIST.md`](OSS_DEMO_LAUNCH_CHECKLIST.md).

## Product

- [ ] Decision Debt is explained consistently in README, PRD, positioning, and UI copy.
- [ ] Build readiness and Decision Debt are not collapsed into one vague “score”.
- [ ] The chat asks contextual questions instead of rendering a generic questionnaire.
- [ ] Confirmed decisions, assumptions, contradictions, provenance, and readiness remain visible.
- [ ] The app stops at the anti-invention handoff package and does not generate application source code.
- [ ] Landing empty state teaches the category before the first idea is typed.

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
- [ ] README stays short and demo-oriented.
- [ ] Week 4 freeze decisions in `product/WEEK4_FREEZE.md` are respected.
