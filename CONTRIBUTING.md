# Contributing to RockFoundry

Thanks for your interest in contributing! RockFoundry is open-source and community-driven.

## Development Setup

```bash
git clone https://github.com/ranggaoscar/rockfoundry.git
cd rockfoundry
pnpm install
cp .env.example .env
docker compose -f docker/docker-compose.yml up -d postgres
pnpm db:migrate
pnpm dev
```

## Branch Strategy

- `main` — Stable, release-ready
- `alpha-v0.2` — Current development branch
- Feature branches off `alpha-v0.2`

## Commit Convention

Use [conventional commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `chore:` — Maintenance
- `docs:` — Documentation
- `test:` — Tests
- `refactor:` — Code refactoring

## Before Submitting

1. Run `pnpm format:check`
2. Run `pnpm typecheck`
3. Run `pnpm test`
4. Ensure no credentials or secrets are committed
5. Ensure `node_modules`, `.next`, `dist`, and `.env` are not tracked

## Code Review

All submissions require review. The team will review within 2-3 business days.
