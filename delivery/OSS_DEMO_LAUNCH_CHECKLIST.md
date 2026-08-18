# OSS Demo Launch Checklist

Use this before sharing RockFoundry publicly as an installable local demo.
This is **not** a hosted SaaS launch.

## 1. Product story (30 seconds)

- [ ] One-liner works: *Find the missing decisions before a coding agent invents your product.*
- [ ] Beachhead is clear: multi-brand / multi-unit CRM & ops.
- [ ] Landing empty state teaches the category in one glance.
- [ ] README is short enough for GitHub scanning.
- [ ] Non-goals stay visible: no coding agent, no accounts, no billing.

## 2. Magic-moment demo script (5 minutes)

1. Start local app (`pnpm dev`).
2. Paste:
   > Build a CRM for five marble brands. Each brand has its own salespeople, but the owner should see everything. Leads come from WhatsApp, Instagram, and the website.
3. Confirm first 3 questions cover:
   - customer identity
   - sales visibility
   - lead ownership
4. Answer recommended options.
5. Open context drawer:
   - Decision Debt drops
   - top invention risks shrink
6. Generate handoff package.
7. Open `DO_NOT_INVENT.md` + `AGENT_HANDOFF.md`.
8. Say the close:
   > This is what you give Claude Code / Codex / Cursor so it stops inventing the product.

## 3. Local install smoke

- [ ] Fresh clone of `main` or `agentic-v1`
- [ ] `pnpm install`
- [ ] `pnpm db:generate && pnpm db:migrate`
- [ ] `pnpm dev` opens `http://localhost:3000`
- [ ] Mock provider path works offline
- [ ] Project persists after refresh
- [ ] Export zip downloads with 9 handoff files

## 4. Quality gates

- [x] `pnpm test:core` passes
- [x] `pnpm eval:invention` shows ≥3/5 CRM wins
- [x] Support domains still open correctly:
  - rental → `vehicle_location`
  - inventory → `slab_identity`
- [x] Playwright e2e auth + CRM discovery pass
- [x] No secrets in exports / git
- [x] Typecheck/build green for the packages you touched

## 5. Distribution assets

- [x] GitHub README current
- [x] `DEMO.md` 5-minute share script
- [x] `product/WIN_WEDGE.md` still locked (no scope drift)
- [x] Demo idea + expected first questions written above
- [ ] Optional: short Loom / clip of the 5-minute script
- [ ] Topics/description on GitHub (paste from `delivery/GITHUB_METADATA.md`)

## 6. Go / no-go (Week 4 freeze)

### GO if all true

1. CRM multi-brand demo produces an “I hadn’t thought of that” moment in first 3 questions.
2. Decision Debt is understandable without reading docs.
3. Export package includes `DO_NOT_INVENT.md` and coding-agent prompts.
4. `pnpm eval:invention` exit check passes.
5. Rental + inventory still work as **support** paths, not new beachheads.

### NO-GO / stay private if any true

1. First questions feel generic (auth/db/platform).
2. Users only notice “PRD generator” and never Decision Debt.
3. Handoff is ignored because docs are empty or all `[UNRESOLVED]`.
4. Scope is drifting into accounts, billing, or code generation.

### Decision locked by Week 4

| Choice | Decision |
| --- | --- |
| Beachhead | Keep **multi-brand CRM / multi-unit ops** |
| Support domains | Rental + inventory remain regression-only |
| Reference-evidence deep work | **Defer** until more CRM demo proof in the wild |
| Native Anthropic/Gemini adapters | **Defer** (OpenAI-compatible + Mock is enough for OSS demo) |
| Hosted SaaS | **No** |

## 7. After GO

Share only:

```text
git clone https://github.com/ranggaoscar/rockfoundry.git
cd rockfoundry
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Then run the 5-minute CRM demo script. Collect qualitative notes:

- Did they hit a non-obvious decision?
- Did Decision Debt make sense?
- Would they paste the handoff into their coding agent?
