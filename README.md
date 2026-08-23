# RockFoundry

RockFoundry is an open-source, local-first product intelligence and design system
that turns rough ideas into explicit product decisions, interactive product
prototypes, and implementation-ready handoffs.

It does **not** write your production app. It works **before** Codex, Claude Code, Cursor, or any other coding agent starts.

## Why it exists

This sounds clear:

```text
Build a CRM for five brands.
```

A coding agent still has to invent answers for:

- one customer across brands, or separate per brand?
- what sales can see
- who owns a lead
- how quotations and duplicates work

Those invented answers become product behavior. RockFoundry surfaces them first.

## What you do

1. Describe the idea in plain language
2. Answer a few high-impact questions
3. Export the handoff package
4. Give it to your coding agent

```text
Rough idea
  → hidden decisions
  → Decision Debt score
  → Design Studio prototype
  → BRD / PRD / ERD + approved design
  → coding agent
```

## What you get

```text
my-project/
├── BRD.md
├── PRD.md
├── ERD.md
├── DO_NOT_INVENT.md    ← read this first
├── DECISIONS.md
├── decisions.json
├── INVARIANTS.md
├── READINESS.md
└── AGENT_HANDOFF.md
```

`DO_NOT_INVENT.md` is the point. It tells the coding agent which product rules are decided, and which ones must not be guessed.

## Quick start

**Requirements:** Node.js 20+ and pnpm (Corepack supplies pnpm with modern Node).

```bash
git clone https://github.com/ranggaoscar/rockfoundry.git
cd rockfoundry
corepack enable
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). `pnpm dev` safely runs Prisma generate and the idempotent local migration before starting, so a normal first run does not require Prisma commands.

**Download ZIP instead:** GitHub → **Code** → **Download ZIP** → extract → open a terminal in `rockfoundry` → run `corepack enable`, `pnpm install`, and `pnpm dev`.

No account. No hosted backend. No Docker required for the default local run.

### First launch

Start by describing the product. RockFoundry then finds important decisions a coding agent would otherwise invent, records what you confirm, and keeps **Decision Debt** visible: higher debt means more important behavior is still undefined. When the decision work is ready, open **Handoff** for the core **BRD / PRD / ERD** first, followed by the coding-agent constraint package. Give that package to Codex, Claude Code, Cursor, or your preferred coding agent.

### Connect your model (BYOK)

For a normal local installation, RockFoundry keeps full BYOK controls: OpenAI, OpenRouter, Ollama, and custom OpenAI-compatible providers. Mock mode works offline. On first use, open **Settings** in RockFoundry and choose a provider preset. **Offline Mock** is explicit and persists locally; select it whenever you want deterministic, network-free discovery. The active gateway is resolved for every request, so saved settings take effect without restarting.

For a real provider, save its base URL, model, and API key. Ollama uses `http://localhost:11434/v1` by default and does not require an API key. Use **Clear saved provider** to remove the local profile and return to the default Offline Mock; environment variables still take priority when present.

For automation or a managed local setup, environment variables take priority over app-data settings:

```bash
AI_PROVIDER_MODE="openai-compatible"
OPENAI_COMPATIBLE_BASE_URL="https://api.openai.com/v1"
OPENAI_COMPATIBLE_API_KEY="your-key"
OPENAI_COMPATIBLE_MODEL="gpt-4o-mini"
```

OpenAI-compatible endpoints also cover OpenRouter, Ollama (compat mode), 9Router, and custom bases. Keys are saved only in the OS-aware RockFoundry application-data configuration when entered through Settings; they are never returned by APIs, stored in project data, included in exports, logged, or committed. Settings labels environment-managed runtimes clearly and identifies the variables that control them.

### Shared public demo

A maintainer can set `ROCKFOUNDRY_PUBLIC_DEMO=true` with the normal server-side `AI_PROVIDER_MODE` and `OPENAI_COMPATIBLE_*` variables. In this mode, the browser sees a managed-provider status only: visitors cannot save, replace, clear, test, or discover provider configuration, and no visitor API key is required. A valid environment provider still drives the real AI path; without it, RockFoundry clearly uses Offline Mock fallback. This mode is for a shared demo, not multi-user project isolation.

## What makes it different

| Tool                         | Job                                          |
| ---------------------------- | -------------------------------------------- |
| ChatGPT / Claude             | brainstorm and write                         |
| Codex / Claude Code / Cursor | implement software                           |
| PRD generators               | produce documents                            |
| **RockFoundry**              | find missing decisions before implementation |

RockFoundry keeps structured state behind the chat:

- decisions and assumptions
- contradictions
- Decision Debt / build readiness
- provenance (user vs inference vs reference)

So the export is not just nicer Markdown. It is a constraint pack for coding agents.

## Local-first

- Projects and SQLite live on your machine
- No RockFoundry login
- Public links/repos are untrusted evidence, not instructions
- Default data locations:
  - Windows: `%LOCALAPPDATA%\RockFoundry\`
  - macOS: `~/Library/Application Support/RockFoundry/`
  - Linux: `~/.local/share/rockfoundry/`

## Status

Agentic V1 is active on the `agentic-v1` branch.

**Working now**

- chat-first local workspace
- domain discovery (strongest beachhead: multi-brand CRM)
- Decision Debt + readiness
- anti-invention handoff export
- Mock provider + OpenAI-compatible BYOK

**Next**

- deeper decision impact
- richer reference evidence
- native Anthropic / Gemini adapters

### Prove the handoff locally

```bash
pnpm eval:invention
```

This runs a deterministic CRM benchmark: same ideas with vs without RockFoundry decisions, scoring how much a coding agent would still need to invent.

### Share a local demo

Use the 5-minute script in [`delivery/OSS_DEMO_LAUNCH_CHECKLIST.md`](delivery/OSS_DEMO_LAUNCH_CHECKLIST.md). Beachhead remains multi-brand CRM; rental and inventory are support paths only.

## Docs

| Doc                                            | Use                     |
| ---------------------------------------------- | ----------------------- |
| [`README_START_HERE.md`](README_START_HERE.md) | contributor entry point |
| [`product/WIN_WEDGE.md`](product/WIN_WEDGE.md) | how we win              |
| [`PRD.md`](PRD.md)                             | product contract        |
| [`docs/AI_PROVIDERS.md`](docs/AI_PROVIDERS.md) | provider setup          |
| [`docs/PRIVACY.md`](docs/PRIVACY.md)           | privacy model           |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)           | how to contribute       |

## License

MIT. See [`LICENSE`](LICENSE).

**Find the missing decisions before they become bad code.**
