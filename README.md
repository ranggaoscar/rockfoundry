# RockFoundry

**Open-source, local-first product discovery for AI builders.**

> Before AI writes your code, make sure it isn't inventing your product.

RockFoundry finds the hidden product decisions inside a rough idea, then hands a coding agent a build package it is less likely to invent around.

It does **not** write your app. It works **before** Codex, Claude Code, Cursor, or any other coding agent starts.

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
  → BRD / PRD / ERD + DO_NOT_INVENT
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

**Requirements:** Git, Node.js 20+, pnpm

```bash
git clone --branch agentic-v1 --single-branch https://github.com/ranggaoscar/rockfoundry.git
cd rockfoundry
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

No account. No hosted backend. No Docker required for the default local run.

### Optional AI provider (BYOK)

Mock mode works offline. For real models, set a local `.env`:

```bash
AI_PROVIDER_MODE="openai-compatible"
OPENAI_COMPATIBLE_BASE_URL="https://api.openai.com/v1"
OPENAI_COMPATIBLE_API_KEY="your-key"
OPENAI_COMPATIBLE_MODEL="gpt-4o-mini"
```

OpenAI-compatible endpoints also cover OpenRouter, Ollama (compat mode), 9Router, and custom bases. Keys stay local. Never commit them.

## What makes it different

| Tool | Job |
| --- | --- |
| ChatGPT / Claude | brainstorm and write |
| Codex / Claude Code / Cursor | implement software |
| PRD generators | produce documents |
| **RockFoundry** | find missing decisions before implementation |

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
- coding-agent eval harness

## Docs

| Doc | Use |
| --- | --- |
| [`README_START_HERE.md`](README_START_HERE.md) | contributor entry point |
| [`product/WIN_WEDGE.md`](product/WIN_WEDGE.md) | how we win |
| [`PRD.md`](PRD.md) | product contract |
| [`docs/AI_PROVIDERS.md`](docs/AI_PROVIDERS.md) | provider setup |
| [`docs/PRIVACY.md`](docs/PRIVACY.md) | privacy model |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | how to contribute |

## License

MIT. See [`LICENSE`](LICENSE).

**Find the missing decisions before they become bad code.**
