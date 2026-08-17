# Decision Log

## Agentic V1 reset decisions

- **D-100**: RockFoundry is a free, open-source, local-first agentic product discovery system, not a hosted SaaS.
  - _Reason_: The product exists to reduce Decision Debt before implementation.
- **D-101**: The chat is the primary UI.
  - _Reason_: Discovery should feel like a focused AI conversation, not a dashboard or form wizard.
- **D-102**: SQLite + Prisma is the default persistence layer.
  - _Reason_: Local setup must work without PostgreSQL, MinIO, Docker, or a RockFoundry account.
- **D-103**: User-provided provider keys are supported through a provider-neutral BYOK abstraction.
  - _Reason_: Users should control model choice, privacy, and cost without managed AI billing.
- **D-104**: Canonical typed project state is the source of truth; BRD, PRD, and ERD are rendered artifacts.
  - _Reason_: Documents must remain consistent and regenerable as decisions change.
- **D-105**: Material agent actions require structured validation and human approval where they change product meaning.
  - _Reason_: RockFoundry must not silently invent the user's product.
- **D-106**: Decision relationships are represented as typed edges inside project state.
  - _Reason_: V1 needs affected-concept traceability without introducing a graph database.
- **D-107**: Public websites and GitHub repositories are evidence only and are treated as untrusted content.
  - _Reason_: Reference content may contain prompt injection and must never become agent instructions.
- **D-108**: The default user-facing export contains exactly `BRD.md`, `PRD.md`, and `ERD.md`.
  - _Reason_: Coding agents need a small, durable handoff rather than a 30-document package.

## Superseded Alpha decisions

The previous Alpha choices for Better Auth, PostgreSQL, Inngest, S3/MinIO, SumoPod, Cloud Starter, subscriptions, entitlements, and managed AI are retained in Git history only. They are not Agentic V1 requirements.

## Change protocol

A changed decision creates a new revision, records what it supersedes, and marks affected requirements and artifact sections stale. Do not rewrite history silently.

## Current status

This log is the product decision history for the reset. Implementation status belongs in code/tests, not here.
