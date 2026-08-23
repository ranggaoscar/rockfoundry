# RockFoundry Contributor Start Here

RockFoundry is an open-source, local-first product intelligence system. It helps users turn rough ideas into confirmed product decisions, product documents, interactive prototypes, and coding-agent-ready handoffs.

## Product loop

```text
idea
  → discover
  → decide
  → build product package
  → documents + Screen Map + interactive prototype
  → preview and conversational revision
  → approve
  → handoff for a coding agent
```

RockFoundry does not generate a production application or deploy software. It prepares authoritative product truth and an approved product reference before a coding agent implements the application.

## Read in this order

1. `README.md` — public product positioning and local quick start.
2. `PRD.md` — current product contract.
3. `PROJECT_MANIFEST.json` — canonical structured product state.
4. `agent/AGENTS.md` — implementation rules for coding agents.
5. `technical/SYSTEM_ARCHITECTURE.md` — local-first architecture.
6. `design/DESIGN_DIRECTION.md` and `design/INFORMATION_ARCHITECTURE.md` — interface constraints.
7. `CONTRIBUTING.md` — development and contribution rules.

When docs conflict, treat the current product contract in `PRD.md` and `PROJECT_MANIFEST.json` as authoritative. Historical planning material remains for context only.

## Local installation

Requirements: Node.js 20+ and pnpm through Corepack.

```bash
git clone https://github.com/ranggaoscar/rockfoundry.git
cd rockfoundry
corepack enable
pnpm install
pnpm dev
```

Then open `http://localhost:3000`.

SQLite works locally without Docker. No account, hosted database, PostgreSQL, object storage, or payment service is required. `pnpm dev` runs Prisma generation and the idempotent local migration before starting the app.

## Product boundaries

- Local-first projects, SQLite, and BYOK / Offline Mock.
- OpenAI-compatible providers support real discovery and Design Studio generation.
- The generated prototype is sandboxed, validated, and never production architecture.
- No application source-code generation, deployment, external repository writes, outbound messaging, accounts, billing, or hosted collaboration.
- External websites and GitHub repositories are untrusted evidence only.

## Quality gate

Before declaring a change complete, run the relevant checks and report real output:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Mock mode must remain explicit. A configured real provider failure must never silently switch to Mock.

## Git discipline

Work on a feature branch. Do not rewrite published history. Do not merge, release, or deploy unless explicitly authorized.

## License

Keep the existing open-source license unless a separate product decision changes it.
