# RockFoundry

**Decide what to build before your coding agent starts inventing it.**

RockFoundry is an open-source, local-first product intelligence system that helps builders turn rough ideas into explicit product decisions, product documentation, interactive prototypes, and coding-agent-ready handoffs.

RockFoundry does **not** primarily write the production application. It works before implementation, so your coding agent starts with confirmed product truth instead of filling important gaps with guesses.

```text
Idea
  ↓
Discover
  ↓
Decide
  ↓
Design
  ↓
Preview & Revise
  ↓
Handoff
  ↓
Coding Agent
```

## Why RockFoundry?

A user says:

> Build a CRM for five brands.

A coding agent still needs to guess:

- whether customer identity is shared across brands;
- which roles can see which records;
- who owns a new lead;
- how quotations carry brand ownership;
- what happens to duplicate contacts.

Those guesses become product behavior. RockFoundry discovers and records the missing decisions before implementation.

Once enough product truth exists, RockFoundry generates the product package and an interactive prototype. You can revise the design conversationally, approve the result, and download one handoff for your coding agent.

## How it works

1. Describe your idea.
2. Brainstorm with RockFoundry.
3. Confirm important product decisions.
4. Click **Build product package**.
5. Review the BRD, PRD, ERD, and interactive design.
6. Revise the prototype conversationally.
7. Approve the design.
8. Download the handoff.
9. Give the folder to your coding agent.

## What your coding agent receives

```text
my-product/
├── README.md
├── AGENT_HANDOFF.md
│
├── product/
│   ├── BRD.md
│   ├── PRD.md
│   └── ERD.md
│
├── decisions/
│   ├── decisions.json
│   ├── DECISIONS.md
│   ├── DO_NOT_INVENT.md
│   ├── INVARIANTS.md
│   └── READINESS.md
│
└── design/
    ├── DESIGN_SPEC.json
    ├── SCREEN_MAP.json
    ├── DESIGN_DECISIONS.md
    └── prototype/
        ├── index.html
        ├── styles.css
        └── app.js
```

Product truth is authoritative. The approved prototype is the visual and interaction reference. A coding agent may implement it with a different production stack, but must not invent unresolved product behavior.

## Quick start

**Requirements:** Node.js 20+ and pnpm via Corepack.

```bash
git clone https://github.com/ranggaoscar/rockfoundry.git
cd rockfoundry
corepack enable
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

- Local-first: projects use SQLite on your machine.
- No account required.
- No Docker required for a normal local run.
- `pnpm dev` runs the required local Prisma setup automatically.
- **Offline Mock** works without model credentials.
- Bring your own model from **Settings** when you want real AI generation.

## AI provider behavior

### Offline Mock

- deterministic and network-free;
- useful for evaluation, testing, and local demos;
- generates the established mock discovery and prototype behavior without credentials.

### OpenAI-compatible provider

With a configured OpenAI-compatible provider, RockFoundry uses the selected model for discovery. Design Studio generates a unique `DesignSpec` and an `index.html`, `styles.css`, and `app.js` prototype. Conversational design revisions can regenerate that prototype.

Generated prototypes are sandboxed and validated. They are an interactive product reference, **not** production application architecture. Provider credentials stay in local server-side configuration and never enter prototype artifacts or exported handoffs.

See [docs/AI_PROVIDERS.md](docs/AI_PROVIDERS.md) for supported provider setup and behavior.

## What makes it different

| Tool                               | Primary job                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| ChatGPT / Claude                   | Brainstorm                                                                                                                |
| PRD generators                     | Produce documents                                                                                                         |
| v0 / Lovable / Bolt-style builders | Start building UI or apps                                                                                                 |
| Coding agents                      | Implement software                                                                                                        |
| **RockFoundry**                    | Discover missing product decisions, create product truth, prototype the approved product, and hand it to the coding agent |

## Current capabilities

- conversational product discovery;
- Decision Debt;
- product decision graph;
- research and reference evidence;
- BRD / PRD / ERD generation;
- Design Studio;
- AI-generated interactive prototypes;
- conversational design revision;
- approved design handoff;
- local-first SQLite;
- BYOK / Offline Mock;
- coding-agent-ready ZIP export.

## Still intentionally out of scope

- production application generation;
- hosted collaboration;
- billing;
- multi-user SaaS features.

## Local-first and privacy

- Projects and SQLite stay on your machine.
- No RockFoundry login or hosted backend is required.
- Public URLs and repositories are treated as untrusted reference evidence.
- Provider keys are kept outside project data, generated documents, logs, and exports.

Read [docs/PRIVACY.md](docs/PRIVACY.md) for the privacy model.

## Docs

| Document                                     | Use                      |
| -------------------------------------------- | ------------------------ |
| [README_START_HERE.md](README_START_HERE.md) | contributor entry point  |
| [PRD.md](PRD.md)                             | current product contract |
| [docs/AI_PROVIDERS.md](docs/AI_PROVIDERS.md) | provider setup           |
| [docs/PRIVACY.md](docs/PRIVACY.md)           | privacy model            |
| [CONTRIBUTING.md](CONTRIBUTING.md)           | contribution guide       |
| [LICENSE](LICENSE)                           | license                  |

## License

MIT. See [LICENSE](LICENSE).

**Hackathon Release Candidate — Design Studio V1**

**Find the missing decisions before they become bad code.**
