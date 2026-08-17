# Data Model

## Database technology

- **Engine**: SQLite.
- **ORM**: Prisma.
- **Location**: OS-aware local application-data directory.
- **Source of truth**: typed canonical project state plus normalized first-class records.

Previous Alpha PostgreSQL data is not automatically migrated into Agentic V1.

## Core models

| Model                 | Purpose                                                                              |
| --------------------- | ------------------------------------------------------------------------------------ |
| `Project`             | Local product-discovery boundary and current state/version                           |
| `ConversationMessage` | User, agent, tool, warning, decision, and artifact messages                          |
| `Decision`            | User-controlled product decision with source, confidence, rationale, and graph edges |
| `Assumption`          | Inference that still needs confirmation or can safely remain provisional             |
| `OpenQuestion`        | Contextual question tied to an unresolved requirement                                |
| `Contradiction`       | Conflict between facts, decisions, requirements, or constraints                      |
| `Requirement`         | Coverage unit with category, risk, status, and affected concepts                     |
| `Reference`           | Public URL/GitHub evidence and analysis status                                       |
| `ToolRun`             | Validated tool invocation, status, safe summary, and timestamps                      |
| `AgentRun`            | Provider interaction metadata without secrets or raw sensitive payloads              |
| `Artifact`            | BRD, PRD, or ERD snapshot/status/content metadata                                    |
| `ProviderProfile`     | Non-secret active provider metadata; secret values stay outside project state        |
| `ProjectRevision`     | Versioned canonical state snapshot for history and rollback                          |

## Canonical state shape

```ts
ProjectState {
  identity
  rawIdea
  normalizedSummary
  business
  users
  problems
  objectives
  workflows
  features
  entities
  roles
  permissions
  integrations
  design
  platforms
  scale
  security
  deployment
  businessRules
  assumptions
  decisions
  contradictions
  openQuestions
  references
  readiness
  provenance
  decisionGraph
}
```

## Provenance

Every fact, assumption, decision, requirement, and reference-derived observation should carry one of:

```text
USER
AGENT_INFERENCE
REFERENCE_WEBSITE
REFERENCE_GITHUB
TOOL
SYSTEM
```

Confidence is one of:

```text
EXPLICIT
STRONGLY_INFERRED
WEAKLY_INFERRED
UNKNOWN
```

Rules:

- `EXPLICIT` may become a canonical fact.
- `STRONGLY_INFERRED` becomes an assumption requiring confirmation unless the user accepts it.
- `WEAKLY_INFERRED` becomes an open question.
- `UNKNOWN` remains unresolved.

## Decision graph

```text
Decision
  ├── affects -> Requirement
  ├── affects -> Entity
  ├── affects -> Workflow
  ├── affects -> Permission
  └── supersedes -> Decision
```

Do not silently overwrite a confirmed decision. Record a new revision and preserve the historical value.

## JSON usage

Use JSON for evolving project state, structured tool metadata, provider capability metadata, and artifact snapshots. Keep searchable and frequently validated relationships in first-class tables where useful. Do not turn the entire system into an opaque JSON blob.

## Secret boundary

No API key, token, cookie, authorization header, or credential belongs in SQLite project records, conversation messages, artifacts, logs, tool runs, or exports. The local provider configuration service owns secret storage.

## Lifecycle

- Projects can be created, reopened, renamed, exported, and locally deleted.
- Messages append in order and are not rewritten when a decision changes.
- Decisions can be superseded, never silently erased.
- Tool runs record `queued`, `running`, `completed`, or `failed`, with safe summaries.
- Artifacts record `DRAFT`, `READY`, or `NEEDS_DECISIONS` and the canonical state version used.
- Revisions preserve state required to explain why an artifact changed.

## Retention

Local project history remains until the user deletes it. Generated artifacts are local files. Remote provider retention is outside RockFoundry's control and must be described honestly.

## Migration guardrail

Start Agentic V1 with a new SQLite database. Do not delete Docker volumes, reset the old database, or run destructive schema commands against the Alpha PostgreSQL instance.
