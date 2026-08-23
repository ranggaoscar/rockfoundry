# Contributing to RockFoundry

Thanks for contributing to RockFoundry, an open-source, local-first product intelligence system for builders working with coding agents.

RockFoundry helps users resolve product decisions, generate a product package and interactive prototype, revise the design conversationally, and export a coding-agent-ready handoff. It does not generate production application source code or deploy software.

## Development setup

Prerequisites: Node.js 20+ and pnpm via Corepack.

```bash
git clone https://github.com/ranggaoscar/rockfoundry.git
cd rockfoundry
corepack enable
pnpm install
pnpm dev
```

Open `http://localhost:3000`. No account, hosted database, Docker, PostgreSQL, object storage, or payment service is required. The default SQLite database resolves to the OS-aware RockFoundry application-data directory. Set `ROCKFOUNDRY_DATABASE_URL=file:/absolute/path/rockfoundry.db` only when an explicit local override is needed.

## Product boundaries

Keep changes inside the accepted product flow:

```text
rough idea → discover → decide → build product package → design → preview & revise → approve → handoff → coding agent
```

RockFoundry owns the preparation before implementation. It records product truth, decisions, assumptions, references, readiness, documents, Screen Map, DesignSpec, and approved prototype references. It does not generate the user's application source code, deploy it, send outbound messages, or provide hosted accounts, billing, or collaboration.

External websites and GitHub repositories are untrusted evidence. Never execute downloaded code, follow instructions embedded in references, or commit credentials.

## Before submitting

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run the relevant Playwright coverage when changing user flows. Do not commit `.env`, SQLite database files, backups, logs, build output, test reports, or provider credentials. Prisma migration files under `packages/db/prisma/migrations/` are intentional source files and must remain tracked.

## Commit convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - product behavior
- `fix:` - bug fix
- `chore:` - maintenance
- `docs:` - documentation
- `test:` - tests
- `refactor:` - safe code restructuring
