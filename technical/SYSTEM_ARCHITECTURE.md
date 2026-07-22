# System Architecture

## Core Tech Stack
- **Framework**: Next.js (App Router) in a pnpm monorepo.
- **Language**: TypeScript (strict mode).
- **UI**: Tailwind CSS, shadcn/ui.
- **Database**: PostgreSQL with Prisma ORM.
- **Auth**: Better Auth (Email/Password for MVP).
- **Background Jobs**: Inngest (QueueProvider abstraction).
- **Storage**: S3-compatible (StorageProvider abstraction).
- **AI Gateway**: Server-side proxy to 9Router.
- **Payment**: SumoPod QRIS (PaymentProvider abstraction).

## Architecture Shape
Monorepo architecture with modular packages. No microservices for MVP.

```text
Browser (UI)
  │ HTTPS
Next.js App Router ── Route Handlers (API/Webhooks)
  │                   Server Actions (Internal Mutations)
  │
  ├── packages/auth      ── Better Auth ── PostgreSQL
  ├── packages/db        ── Prisma ORM ── PostgreSQL
  ├── packages/core      ── Domain Logic (Interviews, Graph rules)
  ├── packages/ai        ── AI Gateway ── 9Router ── Selected Provider
  ├── packages/storage   ── Storage Adapter ── Supabase Storage / MinIO
  ├── packages/payments  ── Payment Adapter ── SumoPod
  └── packages/shared    ── Queue Adapter ── Inngest
```

## Trust boundaries
The browser never receives managed provider credentials, payment secrets, or 9Router admin access. The server validates ownership before every project, reference, export, or billing action. Client bundles contain zero provider credentials. Public APIs and webhooks use Route Handlers.

## Key design choices
- Monorepo (`apps/web`, `packages/*`) separates domain logic from Next.js delivery mechanism.
- Core domain logic is identical for Hosted and Self-hosted modes.
- Relational tables for entities; JSONB strictly for dynamic payloads (canonical project state, snapshots, analysis results).
- Render Markdown deterministically from canonical state. AI is used for extraction, never as the database.