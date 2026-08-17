# RockFoundry Agentic V1 Architecture

## System shape

RockFoundry is a local-first Next.js application with a SQLite database, local filesystem, provider adapters, deterministic agent runtime, extensible tool registry, and artifact renderers.

```text
Browser
  │ local HTTP
Next.js App Router
  ├── chat-first workspace
  ├── local project routes
  ├── provider settings routes
  └── artifact preview/download routes
        │
        ├── Agent Runtime
        │     ├── canonical state reader
        │     ├── requirements evaluator
        │     ├── contradiction checker
        │     ├── decision graph
        │     ├── next-action selector
        │     └── human approval gate
        │
        ├── Tool Registry
        │     ├── project_state_read
        │     ├── project_state_patch
        │     ├── decision_record
        │     ├── requirements_check
        │     ├── contradiction_check
        │     ├── web_reference_inspect
        │     ├── github_reference_inspect
        │     └── artifact_generate
        │
        ├── Provider Adapters
        │     ├── OpenAI-compatible
        │     ├── Anthropic
        │     └── Gemini
        │
        ├── Prisma Client
        │     └── SQLite in OS-aware app-data directory
        │
        └── Artifact Renderers
              ├── BRD.md
              ├── PRD.md
              └── ERD.md + Mermaid
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
  const observation = await executeDeterministicHandler(action, permission);
  updateCanonicalState(observation);
}
```

The model proposes structured actions. It does not directly write database records. Every mutation passes schema validation, permission validation, deterministic handling, provenance checks, and revision recording.

## Canonical state

Canonical state contains identity, raw idea, normalized understanding, business context, users, workflows, features, entities, roles, permissions, integrations, constraints, assumptions, decisions, contradictions, open questions, references, readiness, provenance, and decision relationships.

Generated Markdown is a view of state. It is never the database.

## Decision Graph

V1 uses typed relationships inside project state instead of a graph database:

```text
Decision
  ├── affects -> Requirement
  ├── affects -> Entity
  ├── affects -> Workflow
  ├── affects -> Permission
  └── supersedes -> Decision
```

A changed decision creates a revision and marks affected requirements/artifacts stale. Confirmed user decisions cannot be silently overwritten.

## Trust boundaries

- The local machine is the primary access boundary. V1 has no RockFoundry account or hosted authorization layer.
- Provider API keys live in local configuration, never in project state, artifacts, logs, tool output, or Git.
- Prompts sent to a selected provider leave the machine and are subject to that provider's terms.
- Website and GitHub content is untrusted reference data. It is never executable instructions.
- Public fetchers enforce URL scheme, DNS/IP, redirect, timeout, and response-size restrictions.
- GitHub inspection never reads `.env` files or executes repository code.
- External tools are read-only unless a specific deterministic state action is approved.

## Persistence

SQLite + Prisma is the default. Projects, messages, decisions, assumptions, contradictions, requirements, references, tool runs, agent runs, artifacts, and provider profile metadata are local records. Secret values should be stored in an OS-aware config path or secure OS credential store when available.

Previous Alpha PostgreSQL data is not automatically migrated into Agentic V1. Docker is optional.

## Background execution

V1 does not require Redis, Inngest, MinIO, cloud queues, or hosted storage. Long-running local work records status, start/end timestamps, failure reason, and retry count in local state.
