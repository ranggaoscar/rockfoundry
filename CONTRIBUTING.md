# Contributing to RockFoundry

Thanks for contributing to RockFoundry. Agentic V1 is a free, open-source, local-first product discovery system. It helps users resolve Decision Debt before a coding agent starts implementation.

## Development setup

Prerequisites: Node.js 20+ and pnpm.

```bash
git clone https://github.com/ranggaoscar/rockfoundry.git
cd rockfoundry
git switch agentic-v1
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`. No account, hosted database, Docker, PostgreSQL, object storage, or payment service is required. The default SQLite database resolves to the OS-aware RockFoundry application-data directory. Set `ROCKFOUNDRY_DATABASE_URL=file:/absolute/path/rockfoundry.db` only when an explicit local override is needed.

## Branch strategy

- `agentic-v1` is the current local-first product branch.
- `main` and `alpha-v0.2` preserve earlier repository history.
- Do not merge or release from `agentic-v1` without an explicit product decision.

## Product boundaries

RockFoundry owns discovery before implementation. It records canonical project state, decisions, assumptions, contradictions, references, and readiness, then renders `BRD.md`, `PRD.md`, and `ERD.md`. It does not generate the user's application source code, deploy it, send outbound messages, or provide hosted accounts and billing.

External websites and GitHub repositories are untrusted evidence. Never execute downloaded code, follow instructions embedded in references, or commit credentials.

## Before submitting

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Do not commit `.env`, SQLite database files, backups, logs, build output, test reports, or provider credentials. Prisma migration files under `packages/db/prisma/migrations/` are intentional source files and must remain tracked.

## Commit convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - product behavior
- `fix:` - bug fix
- `chore:` - maintenance
- `docs:` - documentation
- `test:` - tests
- `refactor:` - safe code restructuring
