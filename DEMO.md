# RockFoundry 5-minute demo

Share this when someone asks what RockFoundry does.

## Install once

```bash
git clone https://github.com/ranggaoscar/rockfoundry.git
cd rockfoundry
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open http://localhost:3000

## Script

### 1. The problem (20s)

> Coding agents are fast. The danger is they invent product decisions you never made — customer identity, permissions, ownership, duplicates.

### 2. Paste this idea (10s)

```text
Build a CRM for five marble brands. Each brand has its own salespeople, but the owner should see everything. Leads come from WhatsApp, Instagram, and the website.
```

### 3. Magic moment (90s)

Watch the first questions. They should hit:

1. customer identity across brands  
2. sales visibility  
3. lead ownership  

Not generic “do you need auth?” questions.

### 4. Answer 3–5 decisions (90s)

Use the recommended options.  
Open **Project context**:

- **Decision Debt** should drop  
- top invention risks shrink  
- build readiness becomes clearer  

### 5. Export handoff (60s)

Generate the package. Open:

- `DO_NOT_INVENT.md` first  
- `AGENT_HANDOFF.md` for Claude Code / Codex / Cursor prompts  
- `DECISIONS.md` for what is locked  

### 6. Close (20s)

> This is the layer before coding agents. Same chat surface as other tools — different job: stop invented product behavior.

## Proof command

```bash
pnpm eval:invention
```

Expect: CRM invention benchmark ≥3/5 wins (currently targets 5/5).

## What not to demo

- accounts / billing  
- code generation  
- “AI writes the whole app”  
- twenty industry templates  

Beachhead stays **multi-brand CRM**. Rental and inventory are support paths only.
