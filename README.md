# RockFoundry

**Open-source agentic product discovery for AI builders.**

> **Before AI writes your code, make sure it isn't inventing your product.**

RockFoundry is an open-source, local-first product discovery agent that finds hidden decisions, resolves ambiguity, and turns rough ideas into build-ready BRDs, PRDs, and ERDs before a coding agent writes the first line of code.

Describe a rough idea. RockFoundry asks domain-specific questions, inspects public references when useful, tracks decisions and contradictions, and generates:

- `BRD.md`
- `PRD.md`
- `ERD.md`

These documents are designed to be handed to Codex, Claude Code, Cursor, Kiro, OpenCode, or any other coding agent. RockFoundry stops before implementation; it does not generate or deploy application source code.

## Contents

- [The problem: Decision Debt](#the-problem-decision-debt)
- [Why not just use ChatGPT?](#why-not-just-use-chatgpt)
- [How RockFoundry is different](#how-rockfoundry-is-different)
- [What RockFoundry is not](#what-rockfoundry-is-not)
- [How it works](#how-it-works)
- [A concrete example](#a-concrete-example)
- [What you get](#what-you-get)
- [Installation](#installation)
- [First run](#first-run)
- [AI providers and BYOK](#ai-providers-and-byok)
- [Local-first and privacy](#local-first-and-privacy)
- [Architecture](#architecture)
- [Screenshots](#screenshots)
- [Roadmap](#roadmap)
- [Contributing](#contributing)

## The problem: Decision Debt

Decision Debt is the accumulation of important product decisions that remain undefined until a coding agent is forced to invent them during implementation.

Consider:

```text
Build a CRM for five brands.
```

That sounds specific. It still leaves decisions such as:

- Is one customer shared across brands?
- Can salespeople see customers from other brands?
- Who owns a lead?
- Does quotation history follow the customer or the brand?
- What happens when a salesperson leaves?
- How are duplicate customers handled?
- What can the owner see?

A coding agent cannot leave these undefined forever. It eventually has to choose something. That choice becomes product behavior even if nobody intentionally made the decision.

The result is often a working application with the wrong permissions, workflows, relationships, or edge-case behavior. Fixing it later is more expensive because the invented decision is already spread through code and data.

RockFoundry exists to surface those decisions before they become code.

## Why not just use ChatGPT?

General AI chat is useful. ChatGPT or Claude can brainstorm, ask questions, and generate a perfectly reasonable PRD. RockFoundry is not claiming otherwise.

The difference is what stays structured behind the conversation.

### General AI chat

```text
Conversation
    ↓
Conversation
    ↓
Conversation
    ↓
Generate PRD
```

### RockFoundry

```text
Conversation
    ↓
Canonical Project State
    ↓
Decision Graph
    ↓
Requirements
    ↓
Assumptions
    ↓
Contradictions
    ↓
Reference Evidence
    ↓
Build Readiness
    ↓
BRD / PRD / ERD
```

RockFoundry is not valuable because it can write Markdown. It is valuable because it keeps track of:

- what has been decided;
- what is still unknown;
- whether a statement came from the user, an inference, a tool, or a reference;
- why a decision exists;
- which requirements, permissions, workflows, and entities it affects;
- what changes when that decision changes.

## How RockFoundry is different

RockFoundry complements existing AI tools rather than trying to replace them.

| Tool category                | Primary job                                             |
| ---------------------------- | ------------------------------------------------------- |
| ChatGPT / Claude             | General reasoning, brainstorming, and writing           |
| Codex / Claude Code / Cursor | Implement software                                      |
| Kiro / Spec Kit              | Structure specifications toward implementation          |
| PRD generators               | Generate product documents                              |
| **RockFoundry**              | Discover hidden product decisions before implementation |

### Unknown-unknown discovery

RockFoundry tries to identify decisions the user does not yet realize are missing. It does not begin with the same generic checklist for every product.

### Decision Graph

Decisions have downstream consequences. For example:

```text
Customer identity = company-wide
    → permissions
    → duplicate detection
    → search
    → quotation ownership
    → ERD relationships
```

Agentic V1 stores these relationships in typed local project state. It does not require a separate graph database.

### Domain-specific questioning

Instead of asking:

> Do you need audit logs?

RockFoundry can ask:

> If one marble slab moves between warehouses, do you need full movement history?

The question uses the product's actual nouns and workflows, so the answer is more useful than a generic yes/no requirement.

### Human-in-the-loop

RockFoundry can recommend a decision, but major assumptions do not silently become confirmed facts. User answers remain distinguishable from agent inference and reference evidence.

### Build readiness

The goal is not merely:

```text
PRD generated
```

The useful question is:

```text
Safe to prototype: YES
Safe to build MVP: NOT YET
```

Agentic V1 exposes readiness as `NOT_READY`, `DRAFT_READY`, or `BUILD_READY`, with unresolved questions and consistency warnings kept visible.

### Vendor-neutral handoff

RockFoundry stops before implementation. Its Markdown output can be handed to Codex, Claude Code, Cursor, Kiro, OpenCode, or another coding workflow.

## What RockFoundry is not

RockFoundry is:

- not a coding agent;
- not a project-management SaaS;
- not a paid AI gateway;
- not a replacement for Codex or Claude Code;
- not a static questionnaire;
- not just a PRD generator.

It owns the layer before implementation: understanding the product, making decisions visible, and creating a traceable handoff.

## How it works

The chat is the user interface. Structured state is the underlying system.

```text
ROUGH IDEA
    ↓
UNDERSTAND CONTEXT
    ↓
DISCOVER HIDDEN DECISIONS
    ↓
ASK DOMAIN-SPECIFIC QUESTIONS
    ↓
INSPECT REFERENCES WHEN USEFUL
    ↓
RECORD DECISIONS + EVIDENCE
    ↓
RESOLVE CONTRADICTIONS
    ↓
CHECK BUILD READINESS
    ↓
GENERATE BRD + PRD + ERD
    ↓
HAND OFF TO CODING AGENT
```

The deterministic local runtime validates structured actions before they change canonical project state. Public websites and repositories are treated as untrusted evidence, not instructions.

## A concrete example

Initial idea:

```text
I want to build a CRM for five marble brands.
Each brand has its own salespeople, but the owner should see everything.
Leads come from WhatsApp, Instagram, and the website.
```

A useful RockFoundry question is:

> Because each brand has its own sales team while the owner needs a global view, if the same customer enters through two different brands, should that be one company-wide customer or two brand-specific customer records?

The answer is not just text in a chat:

```text
User answer
    → decision recorded
    → Decision Graph updated
    → permissions affected
    → search affected
    → duplicate handling affected
    → quotation ownership affected
    → ERD affected
    → next question changes
```

This is why RockFoundry is useful before coding begins: it helps decide what the product means before an implementation agent decides for you.

## Simple on the surface, sophisticated underneath

The user should not need to know:

- what BRD means;
- what PRD means;
- what ERD means;
- what a Decision Graph is;
- what tool calling is;
- what requirement coverage means.

The user only needs to explain what they want to build and answer meaningful questions. RockFoundry handles the structure underneath.

## What you get

A project export contains:

```text
my-project/
├── BRD.md
├── PRD.md
└── ERD.md
```

### BRD

Why the product exists, who it serves, what business rules matter, and what is in or out of scope.

### PRD

What the product should do: workflows, roles, permissions, requirements, acceptance criteria, and unresolved product behavior.

### ERD

What data exists, how the entities relate, and which constraints still need decisions. The document includes a Mermaid ERD.

Documents can be generated as drafts before the project reaches `BUILD_READY`. Unresolved decisions and consistency warnings remain explicit instead of being filled with invented certainty.

## Installation

> **Agentic V1 is currently developed on the `agentic-v1` branch.** Until it becomes the default branch, clone that branch explicitly.

### Prerequisites

- Git
- Node.js 20+
- pnpm

If pnpm is not installed, install it with npm:

```powershell
npm install --global pnpm
```

`corepack enable` is not required.

### Windows / PowerShell

```powershell
git clone --branch agentic-v1 --single-branch https://github.com/ranggaoscar/rockfoundry.git
cd rockfoundry

pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

`pnpm dev` runs the required local package builds before starting the web app. No PostgreSQL server, Docker, RockFoundry account, hosted backend, or cloud database is required.

### Local database and project files

RockFoundry stores its local database outside the repository by default:

```text
Windows:
%LOCALAPPDATA%\RockFoundry\rockfoundry.db

macOS:
~/Library/Application Support/RockFoundry/rockfoundry.db

Linux:
~/.local/share/rockfoundry/rockfoundry.db
```

Local project state lives under the same application-data directory. Generated documents are rendered from that state and can be downloaded as a project archive. Deleting the repository does not necessarily delete local projects. To reset local data, remove it from the application-data directory deliberately; the repository does not manage that deletion for you.

The location can be overridden for development with `ROCKFOUNDRY_DATA_DIR` or `ROCKFOUNDRY_DATABASE_URL`. Do not add local database files or provider credentials to Git.

## First run

1. Open RockFoundry.
2. Create a new project.
3. Describe what you want to build in your own words.
4. RockFoundry starts discovery.
5. Answer naturally or use the quick options when they are useful.
6. Use the default Mock Provider for an offline run, or configure a real provider through the current local environment settings when the agent needs one.
7. Generate `BRD.md`, `PRD.md`, and `ERD.md`.
8. Export the files and pass them to your coding agent.

## AI providers and BYOK

RockFoundry itself is free and open source. BYOK means **bring your own key**: you connect the AI provider you choose, and that provider bills you under its own plan and terms. RockFoundry does not sell access to a shared AI gateway.

### Current status in Agentic V1

| Provider or mode                  | Status                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| Mock Provider                     | **Implemented.** Offline, deterministic behavior for demos, tests, and E2E.             |
| OpenAI-compatible adapter         | **Implemented.** Configurable base URL, API key, and model.                             |
| OpenAI                            | Available through the OpenAI-compatible adapter.                                        |
| OpenRouter                        | Available through the OpenAI-compatible adapter when the endpoint is compatible.        |
| 9Router                           | Available through the OpenAI-compatible adapter when the endpoint is compatible.        |
| Ollama                            | Available through the OpenAI-compatible adapter when its compatibility mode is enabled. |
| Custom OpenAI-compatible endpoint | Available through the OpenAI-compatible adapter.                                        |
| Anthropic                         | Architecture target; a native adapter is not wired into the current runtime.            |
| Gemini                            | Architecture target; a native adapter is not wired into the current runtime.            |

“Available through the adapter” does not mean every provider capability has been tested or that every provider supports the same structured-output behavior. Check the provider's API and model requirements.

### Configure an OpenAI-compatible provider

The current Agentic V1 runtime reads local environment configuration. Set these values in your shell or a local, uncommitted `.env` file:

```text
AI_PROVIDER_MODE="openai-compatible"
OPENAI_COMPATIBLE_BASE_URL="https://api.openai.com/v1"
OPENAI_COMPATIBLE_API_KEY="your-key"
OPENAI_COMPATIBLE_MODEL="gpt-4o-mini"
```

Use the relevant base URL and model for OpenRouter, 9Router, Ollama, or another compatible endpoint. Never paste a real key into a commit, issue, screenshot, chat transcript, or generated artifact.

### Mock Provider

The Mock Provider is for:

- offline demos;
- local development without network access;
- deterministic unit and end-to-end tests.

It is not a measure of real model quality. The Mock Provider is selected as the default development mode. It is not an automatic recovery path: when a fully configured real provider fails, RockFoundry surfaces the provider error instead of silently switching to Mock.

### Provider privacy

A remote provider receives the prompt and project context that RockFoundry sends to it. Review the selected provider's retention, training, regional-processing, and deletion terms. Mock Provider and a local Ollama setup can keep inference local.

## Local-first and privacy

RockFoundry does not require:

- a RockFoundry account or login;
- a hosted RockFoundry backend;
- a subscription or payment;
- PostgreSQL, Redis, MinIO, or cloud storage;
- Docker for the SQLite-based local run.

The local machine is the primary trust boundary. Anyone with access to the local RockFoundry instance can access its projects. Provider configuration is kept outside canonical project state, and keys must never appear in documents, logs, exports, or Git.

Public websites and GitHub repositories are untrusted reference content. RockFoundry does not execute downloaded code, read `.env` files from inspected repositories, or follow instructions embedded in reference content.

Read [`docs/PRIVACY.md`](docs/PRIVACY.md) and [`SECURITY.md`](SECURITY.md) before using sensitive project context with a remote provider.

## Architecture

The README keeps the architecture overview short:

```text
Next.js
TypeScript
SQLite
Prisma
Local filesystem
Provider adapters
Deterministic agent runtime
Tool registry
Canonical project state
BRD / PRD / ERD renderers
```

The canonical state is the source of truth. Markdown artifacts are rendered views of that state. The Decision Graph is represented with typed relationships inside local state; a separate graph database is not required.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the system shape, agent loop, trust boundaries, persistence, and tool registry.

## Screenshots

Clean public screenshots are not included yet. Add sanitized captures of the first-launch screen, discovery conversation, and BRD/PRD/ERD view after a public screenshot pass. Do not publish local usernames, private bookmarks, account information, unrelated browser chrome, or development error overlays.

## Roadmap

No dates are promised.

### Current Agentic V1

- local projects and conversation history;
- contextual product discovery;
- canonical project state and Decision Graph relationships;
- assumptions, contradictions, provenance, and build-readiness checks;
- public website and GitHub reference inspection;
- BRD, PRD, and ERD generation with Mermaid ERD output;
- explicit Mock Provider and an OpenAI-compatible BYOK path.

### Next

- complete native Anthropic and Gemini provider adapters;
- richer reference and tool ecosystem;
- deeper artifact traceability;
- desktop packaging.

## Supporting documentation

- [`PRD.md`](PRD.md) — current product contract and behavior.
- [`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md) — product thesis and long-term boundary.
- [`docs/PRODUCT_POSITIONING.md`](docs/PRODUCT_POSITIONING.md) — category and differentiation.
- [`docs/AI_PROVIDERS.md`](docs/AI_PROVIDERS.md) — provider contract, configuration, and privacy.
- [`docs/PRIVACY.md`](docs/PRIVACY.md) — local-first data model and provider-bound processing.
- [`SECURITY.md`](SECURITY.md) — security principles and reporting.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — development setup and contribution rules.

## Contributing

Use `agentic-v1` for the current local-first product work. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`agent/AGENTS.md`](agent/AGENTS.md) before changing code.

Do not reintroduce the cancelled hosted SaaS, billing, managed-AI, PostgreSQL, or cloud-storage direction into Agentic V1 without a separate product decision.

## License

MIT. See [`LICENSE`](LICENSE).

**Find the missing decisions before they become bad code.**

**Turn rough ideas into build-ready specs.**
