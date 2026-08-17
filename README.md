# RockFoundry

**Open-source agentic product discovery for AI builders.**

Before a coding agent writes your code, RockFoundry helps find the product decisions you have not made yet.

You describe a rough idea. RockFoundry investigates the context, discovers hidden decisions, asks domain-specific questions, uses safe tools when useful, records evidence and assumptions, checks contradictions, measures build readiness, and produces three handoff documents:

```text
BRD.md · PRD.md · ERD.md
```

RockFoundry does not generate or deploy application source code. It owns the work before implementation.

> **Decision Debt** is the accumulation of important product decisions left undefined until a coding agent is forced to invent them. RockFoundry exists to reduce that debt before it becomes bad code.

## Why RockFoundry

A request such as `build a CRM for five marble brands` sounds clear. It still leaves expensive decisions open:

- Is one customer shared across brands?
- Who can see another salesperson's quotation?
- Does a quotation belong to a brand, a customer, or an opportunity?
- What happens when a customer record is deleted?
- Can the owner search customer activity across every brand?

A normal document generator writes around these gaps. RockFoundry surfaces them, explains why they matter, and keeps the user in control of the decision.

## How it works

```text
ROUGH IDEA
    ↓
UNDERSTAND CONTEXT
    ↓
DISCOVER UNKNOWN DECISIONS
    ↓
INVESTIGATE REFERENCES WHEN NECESSARY
    ↓
ASK DOMAIN-SPECIFIC QUESTIONS
    ↓
RECORD DECISIONS AND ASSUMPTIONS
    ↓
RESOLVE CONTRADICTIONS
    ↓
CHECK BUILD READINESS
    ↓
GENERATE BRD + PRD + ERD
```

The chat is the product. The underlying canonical project state is the source of truth for the artifacts.

## Agentic discovery

RockFoundry is not a generic chatbot or a static questionnaire. Its deterministic runtime controls:

- typed canonical state;
- decision relationships and affected requirements;
- confidence and provenance (`USER`, `AGENT_INFERENCE`, `REFERENCE_WEBSITE`, `REFERENCE_GITHUB`, `TOOL`, `SYSTEM`);
- contextual question quality;
- assumptions and contradictions;
- readiness and artifact consistency;
- validated tool permissions and structured actions.

The model proposes an action. Schema and permission validation run before a deterministic handler changes local state.

## Tools

Initial tools are designed as read-only or state-safe operations:

- `project_state_read`
- `project_state_patch`
- `decision_record`
- `requirements_check`
- `contradiction_check`
- `web_reference_inspect`
- `github_reference_inspect`
- `artifact_generate`

Public websites and repositories are treated as untrusted evidence. RockFoundry never executes downloaded code, reads `.env` files, follows instructions embedded in references, or copies a reference into the product without user confirmation.

## BYOK providers

RockFoundry is free because the user brings the AI provider key. The architecture supports:

- OpenAI;
- Anthropic;
- Gemini;
- OpenRouter;
- Ollama;
- 9Router;
- custom OpenAI-compatible endpoints.

Provider credentials are stored separately from project state using an OS-aware local configuration path. They never enter chat history, BRD/PRD/ERD, logs, exports, or Git. Prompts sent to a configured provider leave the local machine, and the selected provider's data policy applies.

The explicit Mock Provider remains available for offline demos, tests, and E2E. A real provider failure never silently falls back to mock mode.

## Local-first architecture

RockFoundry requires no RockFoundry account, login, hosted backend, payment, subscription, or cloud database.

Default stack:

- Next.js App Router;
- TypeScript;
- SQLite;
- Prisma;
- local filesystem for generated artifacts and configuration;
- provider adapters;
- deterministic local agent runtime;
- Markdown artifact renderers.

Expected application data lives under an OS-aware app-data directory such as:

```text
Windows: %LOCALAPPDATA%/RockFoundry/
macOS:   ~/Library/Application Support/RockFoundry/
Linux:   ~/.local/share/rockfoundry/
```

The exact resolved path is printed by the local app. Previous Alpha PostgreSQL databases are not automatically migrated into Agentic V1. Docker is intentionally outside the active V1 tree and is not a prerequisite for SQLite.

## Install

Prerequisites: Node.js 20+, pnpm.

```bash
git clone https://github.com/ranggaoscar/rockfoundry.git
cd rockfoundry
git switch agentic-v1
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`. Start by describing an idea. Configure an AI provider only when the agent needs one.

For a deterministic offline run, choose the explicit Mock Provider in Settings.

## Example

```text
I want to build a CRM for several marble brands.
```

RockFoundry should not jump to `customers`, `quotations`, and `role permissions` as if they were settled facts. It should ask a question such as:

> You mentioned several brands. Can one customer have quotations from multiple brands, or should each brand maintain a separate customer record?

The answer becomes a provenance-backed decision. Its effects on permissions, duplicate detection, search, quotation ownership, and the ERD remain traceable.

## UI

The default experience is a chat-first workspace inspired by modern AI assistants:

- compact project sidebar;
- wide readable conversation;
- sticky multiline composer;
- inline contextual answer options;
- compact collapsed tool activity;
- compact readiness status;
- drawers or sheets for decisions, assumptions, contradictions, references, documents, and provider settings;
- responsive mobile conversation with secondary views opened as drawers.

There is no permanent analytics panel, dashboard KPI grid, billing portal, or technical onboarding wall.

Mobbin research notes and limitations are in [`docs/UI_RESEARCH.md`](docs/UI_RESEARCH.md).

## Artifacts

The default export stays intentionally small:

```text
my-project/
├── BRD.md
├── PRD.md
└── ERD.md
```

Artifacts can be drafted before build readiness is complete. Unresolved decisions and warnings remain visible. A deterministic consistency validator reports `PASS`, `WARNING`, or `BLOCKING` when the documents disagree with canonical state.

## Repository structure

```text
rockfoundry/
├── apps/web/              # Chat-first Next.js application
├── packages/core/         # State, graph, questions, tools, readiness, artifacts
├── packages/ai/           # Provider-neutral adapters and structured prompts
├── packages/db/           # SQLite Prisma schema and local client
├── docs/                  # Product, architecture, provider, privacy, and UI notes
├── design/                # UI direction and flows
├── product/               # Scope, vision, journeys, and metrics
├── technical/             # Contracts and trust boundaries
└── agent/                 # Coding-agent handoff rules
```

## Security and privacy

Read [`SECURITY.md`](SECURITY.md) and [`docs/PRIVACY.md`](docs/PRIVACY.md). In V1, access to the local machine is the trust boundary. Anyone who can access the local RockFoundry instance can access its projects. Provider prompts leave the machine only when the user has configured and invoked that provider. Public references are untrusted content and are inspected with SSRF, size, timeout, and prompt-injection safeguards.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`agent/AGENTS.md`](agent/AGENTS.md) before changing code. Work on `agentic-v1` for this reset. Do not merge into `main`, publish a release, or reintroduce the cancelled hosted SaaS direction.

## License

MIT. See [`LICENSE`](LICENSE).

**Find the missing decisions before they become bad code.**
