# RockFoundry 🪨🔥

**Turn rough product ideas into structured build packages that coding agents can execute.**

RockFoundry transforms your raw product idea — a few sentences, a paragraph, a stream of consciousness — into a comprehensive Build Package: PRD, technical specs, data model, task breakdown, and agent instructions. Ready for any coding agent (Codex, Claude Code, Cursor) to execute.

> ⚠ **Alpha Software** — RockFoundry is in active development. Expect bugs, incomplete features, and breaking changes.

---

## What it does

1. **You describe your idea** — Write whatever's in your head. No structure needed.
2. **RockFoundry extracts structure** — AI identifies users, entities, workflows, and constraints.
3. **Adaptive interview** — Smart questions fill in what's missing, tailored to your specific product.
4. **Reference analysis** — Optionally analyze competitor websites or public GitHub repos.
5. **Build Package generation** — Download a complete ZIP with PRD, technical docs, and agent instructions.

## What it does NOT do

- Write your code
- Deploy your app
- Make product decisions for you
- Replace your product manager

## Who it's for

- **Indie makers** who want to move faster than writing full specs
- **Vibe coders** who want structure without the paperwork
- **Small teams** that need a shared understanding before building
- **AI agent users** who want better inputs for their coding assistants

---

## Getting Started

### Community (Self-hosted, Free)

```bash
# Prerequisites: Node.js 20+, pnpm, Docker

# Clone the repository
git clone https://github.com/ranggaoscar/rockfoundry.git
cd rockfoundry

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env with your settings (or use defaults for local dev)

# Start PostgreSQL
docker compose -f docker/docker-compose.yml up -d postgres

# Run database migrations
pnpm db:migrate

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) — you're running RockFoundry locally with mock AI mode.

### Cloud Starter (Hosted)

Coming soon. The Cloud plan offers managed AI, cloud storage, and reference analysis.

### Bring Your Own Key (BYOK)

Set `AI_PROVIDER_MODE=9router` and configure `NINE_ROUTER_*` environment variables to use your own AI provider. See [docs/AI_PROVIDERS.md](docs/AI_PROVIDERS.md).

---

## Screenshots

*Coming soon — adding screenshots before Beta.*

---

## Repository Structure

```
rockfoundry/
├── apps/
│   └── web/                    # Next.js web application
│       ├── src/
│       │   ├── app/            # Pages and layouts
│       │   ├── components/     # UI components
│       │   └── lib/            # Auth, AI provider, utilities
│       └── playwright/         # E2E tests
├── packages/
│   ├── core/                   # Domain logic: schemas, graph, export
│   ├── ai/                     # AI gateway, prompt registry, routes
│   └── db/                     # Prisma schema and database client
├── docker/                     # Docker Compose and Dockerfile
├── docs/                       # Documentation
└── .github/workflows/          # CI configuration
```

---

## Current Alpha Limitations

- **Mock AI by default** — Real 9Router integration is implemented but requires configuration
- **Basic UI** — Functional but not polished. Loading states and error handling exist but are minimal
- **No real payments** — SumoPod integration is pending verified documentation
- **No team collaboration** — Single-user only
- **No real-time updates** — Page refresh required for state changes
- **Limited reference analysis** — Website text extraction; full visual/JS analysis not supported
- **No background job system** — AI runs are synchronous in current alpha

---

## Roadmap

| Milestone | Focus |
|-----------|-------|
| Alpha v0.1 | Foundation: auth, AI extraction, basic export |
| **Alpha v0.2** | **Real AI integration, interview system, references, self-hosted** |
| Beta v0.3 | Team collaboration, real payments, background jobs |
| Beta v0.4 | UI polish, real-time updates, performance |
| v1.0 | Production ready, documentation complete, migration tools |

---

## License

MIT — see [LICENSE](LICENSE).

Built for indie makers and vibe coders who want to ship faster.
