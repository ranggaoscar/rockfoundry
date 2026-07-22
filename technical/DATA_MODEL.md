# Data Model

## Database Technology
- **Engine**: PostgreSQL
- **ORM**: Prisma

## Table Strategy
Use strict relational tables for static entities and relationships.
Use `JSONB` columns exclusively for highly dynamic schemas that require flexibility without schema migrations.

### Relational Entities
- `User`: Core identity.
- `Session`, `Account`, `Verification`: Better Auth tables.
- `Project`: Core boundary for a build package.
- `ProjectMember`: Links Users to Projects with roles (prepares for future team capabilities).
- `GeneratedDocument`: Records of exported packages (ZIPs/Markdown).
- `Reference`: URLs or GitHub repos attached to a Project.
- `Subscription`: User entitlements.
- `Payment`: SumoPod QRIS invoice tracking.
- `UsageEvent`: Metering for AI budget bounds.
- `BackgroundJob`: State tracking for queued tasks.

### JSONB Usage
- `Project.canonicalState`: The canonical state of the idea, decisions, contradictions, and readiness graph.
- `GeneratedDocument.snapshot`: The static snapshot of project state at the time of export.
- `Reference.metadata`: Dynamic extraction results from external URLs/Repos.
- `UsageEvent.metadata` & `Payment.metadata`: Provider-specific response payloads.
- `BackgroundJob.payload` & `BackgroundJob.result`: Queue arguments and return values.

## Avoid Anti-Patterns
- Do not store the entire system in a single JSON document.
- Do not store generated Markdown directly in relational columns as the primary source of truth (always render from `canonicalState`).