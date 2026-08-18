# RockFoundry Agentic V1

RockFoundry is a free, open-source, local-first agentic product architect for vibe coders.

You describe what you want to build. RockFoundry investigates the idea through conversation, asks the next useful question, records decisions, inspects public references when relevant, detects contradictions, scores Decision Debt, and generates an anti-invention handoff package for a coding agent:

- `BRD.md` / `PRD.md` / `ERD.md`
- `DO_NOT_INVENT.md` / `DECISIONS.md` / `INVARIANTS.md` / `READINESS.md` / `AGENT_HANDOFF.md`

RockFoundry does not generate the application source code. It stops at a high-quality, internally consistent build brief.

## Read in this order

1. `product/WIN_WEDGE.md` - how RockFoundry wins in the next 30 days.
2. `product/WEEK4_FREEZE.md` - what stays in scope after the wedge polish.
3. `product/GAP_MAP.md` - vision vs code gaps.
4. `delivery/30_DAY_BUILD.md` - execution plan.
5. `delivery/OSS_DEMO_LAUNCH_CHECKLIST.md` - public local demo checklist.
6. `PRD.md` - the current product contract and chat-first UI direction.
7. `PROJECT_MANIFEST.json` - the canonical structured product state.
8. `agent/AGENTS.md` - implementation rules for coding agents.
9. `technical/SYSTEM_ARCHITECTURE.md` - the local-first architecture.
10. `design/DESIGN_DIRECTION.md` and `design/INFORMATION_ARCHITECTURE.md` - UI constraints.
11. `agent/FIRST_BUILD_PROMPT.md` - a bounded starting prompt.

If another document conflicts with these files, treat the product reset in `PRD.md` and `PROJECT_MANIFEST.json` as authoritative. Legacy Alpha SaaS decisions are preserved in Git history, not in the V1 contract.

## Product loop

```text
idea
  -> conversation
  -> contextual questions
  -> decisions and assumptions
  -> Decision Debt score
  -> safe reference inspection
  -> contradiction resolution
  -> readiness
  -> anti-invention handoff package
  -> export for a coding agent
```

The chat is the primary interface. The default workspace is not a dashboard, wizard, billing portal, or multi-step form.

## Non-negotiable V1 boundaries

- Fully free and open source.
- No RockFoundry account, login, signup, or hosted backend.
- BYOK through the implemented OpenAI-compatible runtime for OpenAI, OpenRouter, Ollama where compatible, 9Router, and custom endpoints. Native Anthropic and Gemini adapters remain architecture targets.
- Local-first project data, SQLite, Prisma, and local Markdown project folders.
- No subscriptions, payments, SumoPod, plans, entitlements, usage credits, managed AI billing, PostgreSQL requirement, Redis, MinIO, cloud storage, or cloud queues.
- No application source-code generation, deployment, external repository writes, or outbound messaging.
- External website and GitHub content is untrusted evidence only.

## UI starting point

First launch should show a calm centered prompt:

```text
RockFoundry

What do you want to build?
[ Describe your idea... ]
```

After a project starts, use a compact ChatGPT-style left sidebar and a wide conversation area. Keep decisions, assumptions, contradictions, readiness details, references, and documents behind lightweight drawers or sheets. Do not show a permanent right analytics panel.

See `PRD.md` for the complete UI contract.

## Local installation target

The intended developer experience is:

```bash
git clone https://github.com/ranggaoscar/rockfoundry.git
cd rockfoundry
git switch agentic-v1
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Then open `http://localhost:3000`.

SQLite must work without Docker. Docker is intentionally outside the active V1 tree, and PostgreSQL and MinIO are not prerequisites. The previous Alpha PostgreSQL database is not migrated automatically into V1.

## Local data

RockFoundry resolves an OS-aware application data directory, conceptually:

```text
Windows: %LOCALAPPDATA%/RockFoundry/
macOS:   ~/Library/Application Support/RockFoundry/
Linux:   ~/.local/share/rockfoundry/
├── config/
└── projects/<project-id>/
    ├── BRD.md
    ├── PRD.md
    └── ERD.md
```

On Windows, use the supported local application data location. Never hardcode `/home/...`.

API keys stay outside project state, generated documents, logs, exports, telemetry, and Git. Never print them.

## Quality gate

Before declaring work complete, run the relevant checks from the repository scripts and report actual output:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

A real-provider smoke test is optional and only runs when ROCK configures a key. Mock mode must remain explicit and must not silently hide provider failures.

## Git discipline

Work on `agentic-v1`. Preserve `main` and `alpha-v0.2`. Do not merge, release, or deploy a hosted service from this reset branch unless ROCK explicitly asks.

## License

Keep the repository's existing open-source license unless a separate product decision changes it.
