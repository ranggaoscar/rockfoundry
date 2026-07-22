# Deployment Plan

## Hosted SaaS MVP (Cloud Starter)
- **Application**: Vercel (Next.js Edge/Serverless)
- **Database**: Supabase PostgreSQL
- **Object Storage**: Supabase Storage
- **Background Jobs**: Inngest (Triggered via Vercel Route Handlers)
- **AI Gateway**: Private 9Router deployment (Server-to-Server)
- **Payments**: SumoPod

## Open-Source Self-Hosted (Community)
- **Orchestration**: Docker Compose
- **Application**: Next.js standalone container
- **Database**: PostgreSQL official container
- **Object Storage**: MinIO container
- **Background Jobs**: Local execution runner (fallback for Inngest) or simple queue via Postgres.
- **AI Gateway**: Optional external 9Router or OpenAI-compatible endpoint directly configured via env vars.

## Scale Targets (MVP)
Designed to handle:
- 1,000 registered accounts.
- 100 active users per day.
- Maximum 20 concurrent AI generation jobs.
Premature optimization beyond these targets is out of scope.