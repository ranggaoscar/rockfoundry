# Decision Log

## Architecture
- **D-005**: Use Next.js App Router, pnpm workspace, Prisma, PostgreSQL, Better Auth, and Inngest for MVP.
  - *Context*: Need a single full-stack framework with strong typing and modular boundaries.
  - *Decision*: Next.js monorepo with `apps/web` and `packages/*`.
- **D-006**: Better Auth instead of NextAuth/Auth.js.
  - *Context*: Auth.js App Router support can be rigid; Better Auth provides cleaner primitives and easier schema expansion for future workspaces.
- **D-007**: Relational tables with targeted JSONB.
  - *Context*: Cannot use standard SQL columns for deeply nested adaptive interview states, but need SQL for users and billing.
  - *Decision*: Prisma on PostgreSQL. `Project.canonicalState` is JSONB, `User`/`Payment` are relational.
- **D-008**: Inngest for background jobs.
  - *Context*: Need idempotent retries for long-running AI extraction and zip generation without maintaining a separate worker process.
  - *Decision*: Use Inngest (API-based queueing) with an abstract `QueueProvider` to allow self-hosted fallback.
- **D-009**: Provider Abstractions.
  - *Context*: Vendor lock-in prevents self-hosted community edition.
  - *Decision*: Isolate AI, Storage, Payment, and Queue into separate packages with strict interfaces.