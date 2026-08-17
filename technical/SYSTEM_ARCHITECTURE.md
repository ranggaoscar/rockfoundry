# System Architecture

## Core stack

- **Framework**: Next.js App Router in a pnpm monorepo.
- **Language**: TypeScript with strict mode.
- **UI**: Tailwind CSS and owned UI primitives.
- **Persistence**: SQLite with Prisma, stored in an OS-aware local app-data directory.
- **Filesystem**: local project/artifact directory for exports and non-secret metadata.
- **AI**: provider-neutral adapters with explicit BYOK configuration and Mock Provider.
- **Runtime**: deterministic local agent loop, tool registry, state handlers, and artifact renderers.

## Architecture shape

```text
Browser
  │ local HTTP
Next.js App Router
  ├── chat-first workspace
  ├── project/conversation routes
  ├── provider settings routes
  └── document preview/download routes
        │
        ├── packages/core
        │     ├── canonical project state
        │     ├── requirements graph
        │     ├── decision relationships
        │     ├── contextual questions
        │     ├── contradictions
        │     ├── readiness
        │     ├── tool registry
        │     └── BRD/PRD/ERD renderers
        │
        ├── packages/ai
        │     ├── OpenAI-compatible adapter
        │     ├── Anthropic adapter
        │     ├── Gemini adapter
        │     └── structured action prompts
        │
        ├── packages/db
        │     ├── Prisma schema
        │     └── SQLite client
        │
        └── apps/web
              ├── routes
              ├── browser-safe UI
              └── local provider/config boundary
```

## Agent loop

```ts
while (!stopCondition(state)) {
  const current = readCanonicalState(projectId);
  const gaps = evaluateRequirements(current);
  const contradictions = checkContradictions(current);

  const proposed = await provider.runAgent({
    current,
    gaps,
    contradictions,
    tools,
  });
  const action = validateActionSchema(proposed);
  const permission = validateActionPermission(action, current);
  const observation = await executeValidatedAction(action, permission);
  updateCanonicalState(observation);
}
```

The LLM proposes actions. It never directly mutates the database. The application validates the action schema, checks permission and human-approval requirements, executes a deterministic handler, records provenance, and creates a revision.

## Canonical state

Canonical state is the source of truth for identity, raw idea, normalized summary, business context, users, problems, objectives, workflows, features, entities, roles, permissions, integrations, design, platforms, scale, security, deployment, business rules, assumptions, decisions, contradictions, open questions, references, readiness, and provenance.

Generated Markdown is a versioned view of state. It is not the database.

## Decision Graph

V1 uses typed relationships inside project state rather than a graph database:

```text
Decision
  ├── affects -> Requirement
  ├── affects -> Entity
  ├── affects -> Workflow
  ├── affects -> Permission
  ├── affects -> BusinessRule
  └── supersedes -> Decision
```

Changing a confirmed decision creates a historical revision and marks affected requirements/artifacts stale. Confirmed user decisions cannot be silently overwritten.

## Tool boundary

Tools are registered with name, description, input schema, output schema, and execute handler. Public reference tools are read-only. State mutation tools accept proposed patches only through deterministic validation.

## Trust boundaries

- The local machine and OS account are the primary access boundary. V1 has no RockFoundry account or hosted authorization layer.
- Provider keys are local secrets and never enter project state, artifacts, logs, tool output, exports, or Git.
- Prompts sent to a remote provider leave the machine and follow that provider's data policy.
- Website and GitHub content is untrusted evidence. It is never executable instructions.
- Public fetchers enforce URL scheme, DNS/IP, redirect, timeout, and response-size restrictions.
- GitHub inspection never reads `.env` files or executes repository code.

## Persistence

SQLite + Prisma is the default. Local records cover projects, conversation messages, decisions, assumptions, contradictions, requirements, references, tool runs, agent runs, artifacts, provider profile metadata, and versioned state snapshots.

Previous Alpha PostgreSQL data is not automatically migrated into Agentic V1. Docker support is intentionally outside the active V1 tree and is not a prerequisite.

## Background execution

V1 does not require Redis, Inngest, MinIO, cloud queues, or hosted storage. Long-running local work records status, start/end timestamps, failure reason, and retry count in SQLite.

## Source layout

```text
apps/web/       Next.js delivery and chat-first UI
packages/core/  product state and deterministic domain logic
packages/ai/    provider adapters and structured prompts
packages/db/   Prisma schema and local SQLite client
docs/           product, architecture, provider, privacy, and UI documentation
```

Do not reintroduce legacy auth, billing, hosted storage, or managed-AI infrastructure into this architecture.

### Decision graph contract

A `Decision` should keep a stable id, topic, value, reason, source, confidence, affected concept ids, and supersession metadata. An affected concept may be a requirement, entity, workflow, permission, or artifact section. A graph query answers which requirements and artifacts must be reconsidered when a decision changes.

### Stop conditions

The agent stops when the user must decide, when a blocking contradiction exists, when a tool requires permission, when readiness is sufficient for the requested artifact, or when the user explicitly asks to pause. The runtime must not keep asking questions merely to increase a score.

### Local config boundary

Provider secrets belong in the local configuration boundary, not the Prisma project database. The app may store non-secret provider metadata in `ProviderProfile`, while secret material is resolved through the OS-aware configuration service.

### Artifact boundary

`BRD.md`, `PRD.md`, and `ERD.md` are the only default user-facing artifacts. Internal state, tool activity, revisions, and provider metadata remain supporting implementation state.

### Safety note

Do not execute destructive database operations, delete old Docker volumes, or automatically migrate the Alpha PostgreSQL database. Agentic V1 starts with a new local SQLite store.

### Document status

This document supersedes the old hosted SaaS architecture that referenced Better Auth, PostgreSQL, Inngest, MinIO, S3, SumoPod, or Cloud Starter.

### Verification expectations

Every implementation change should run the relevant typecheck, test, lint, and build checks. UI changes require real-browser verification at desktop and mobile widths, not only compilation.

### Open architecture decisions

- Exact OS credential-store implementation may be upgraded after the local config boundary is stable.
- Streaming transport can begin with request/response and evolve to a provider capability when the runtime contract is stable.
- Local export layout may use a project folder first and add ZIP convenience without changing the three-document default.

### Compatibility note

The monorepo and previous Alpha commits remain recoverable. Compatibility with the old SaaS database or account system is intentionally not a V1 requirement.

### Implementation guardrail

Preserve generic core graph, reference safety, question, readiness, and artifact logic where it serves the reset. Remove only code whose only purpose is hosted SaaS identity, billing, entitlements, payment, managed AI, or cloud infrastructure.

### Final architecture sentence

RockFoundry is a local conversational shell around a deterministic product-understanding engine, with provider adapters on one side and three validated Markdown artifacts on the other.

### Review checklist

- [ ] Local SQLite works without Docker.
- [ ] No route requires account authentication.
- [ ] No project creation checks a plan or quota.
- [ ] No AI request silently selects managed credentials.
- [ ] Tools are schema-validated and permission-checked.
- [ ] External references are isolated as untrusted data.
- [ ] Canonical state remains authoritative over generated documents.
- [ ] Decision changes preserve history and affected concepts.
- [ ] Artifact consistency is deterministic.
- [ ] The browser cannot read provider secrets.

### Explicitly removed from the target architecture

`Better Auth`, `User`, `Session`, `Account`, `Verification`, `ProjectMember`, `Subscription`, `Payment`, `UsageEvent` for quotas, `PrismaPg`, PostgreSQL, MinIO, S3, Redis, Inngest, SumoPod, Cloud Starter, and managed AI billing are not Agentic V1 architecture dependencies.

### Related documents

- `docs/PRODUCT_VISION.md`
- `docs/PRODUCT_POSITIONING.md`
- `docs/AI_PROVIDERS.md`
- `docs/PRIVACY.md`
- `design/DESIGN_DIRECTION.md`
- `PRD.md`

### Maintainer note

Keep this architecture short enough to be read before coding. Detailed contracts belong in `technical/API_CONTRACTS.md` and package code.

### Version

Agentic V1 reset, 2026.

### End

The next implementation work should make this architecture true in code, not add more legacy compatibility layers.
