# Local Deployment Plan

## Primary developer experience

RockFoundry V1 runs as a local Next.js process with SQLite. Docker is optional and is not part of the first-run path.

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`.

## Local data boundary

- SQLite database: OS-aware RockFoundry application-data directory.
- Project artifacts: local project folder under the same application-data root.
- Provider credentials: local configuration or OS credential storage, separate from project state.
- No RockFoundry account or hosted database is required.

## Optional packaging

A future Docker image may package the app and a persistent app-data volume. It must not require a separate database, object store, cache, or remote queue for the default experience.

## Background work

Long-running local actions retain status, timestamps, failure reason, and retry capability through the local `AgentRun` and `ToolRun` records. V1 uses a lightweight local runner.

## Previous Alpha data

Previous Alpha PostgreSQL databases are not automatically migrated into Agentic V1. Do not delete old Docker volumes as part of this reset.

## Release boundary

This branch is for local open-source review. No hosted SaaS deployment, account service, payment service, or external repository write is part of the Agentic V1 deployment path.
