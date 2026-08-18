# 30-Day Differentiation Build Plan

Locked wedge: multi-brand CRM / multi-unit ops decision discovery  
North star: coding agents invent fewer product decisions after RockFoundry handoff

## Definition of done (day 30)

A new user can:

1. Paste a rough multi-brand CRM idea
2. Hit at least one non-obvious high-risk decision in the first 3 questions
3. See Decision Debt score and top invention risks in the workspace
4. Export a handoff zip containing:
   - `BRD.md`, `PRD.md`, `ERD.md`
   - `DO_NOT_INVENT.md`
   - `DECISIONS.md` + `decisions.json`
   - `INVARIANTS.md`
   - `READINESS.md`
   - `AGENT_HANDOFF.md`
5. Hand that package to Claude Code / Codex / Cursor and get fewer invented ownership/permission rules than a raw idea prompt

## Week 1 — Make the moat visible

### Goals

- Decision Debt is real data, not marketing language
- Export becomes an anti-invention package
- Tests lock the package contract

### Build

- [x] `evaluateDecisionDebt()` in core
- [x] Persist `decisionDebt` on project state
- [x] Export handoff files beyond BRD/PRD/ERD
- [x] Core tests for debt + export package
- [x] UI: status line + context drawer show debt / top risks
- [x] Documents drawer lists full handoff package
- [ ] CRM fixture golden test: first 3 questions include identity/visibility/ownership class

### Exit check

`pnpm test:core` green; manual CRM demo shows debt moving as decisions are answered.

## Week 2 — Magic moment reliability

### Goals

- CRM pack consistently surfaces the decisions coding agents invent
- Answering a decision shows affected concepts
- Contradictions for identity vs permissions feel smart

### Build

- [x] Extract CRM decision catalog from hard-coded engine paths
- [x] Ensure ordered high-risk queue: identity → visibility → ownership → quotation → duplicates
- [x] After answer: assistant names blast radius in plain language
- [x] Add CRM contradiction rules (company-wide identity vs brand-only visibility mismatches, etc.)
- [x] Record 5 scripted demo transcripts as fixtures
- [x] Rewrite public README to be clear and short

### Exit check

Blind review: 8/10 CRM ideas get a non-generic first question. _(Golden fixtures lock 5/5 scripted CRM ideas to the identity→visibility→ownership opening.)_

## Week 3 — Coding-agent win proof

### Goals

- Handoff package changes coding-agent behavior
- Measurable before/after story for distribution

### Build

- [x] `AGENT_HANDOFF.md` tuned for Claude Code / Codex / Cursor
- [x] Eval harness: same idea, with vs without RockFoundry package
- [x] Score invented decisions (customer identity, permissions, ownership, duplicates)
- [x] Improve ERD/PRD sections that are already known (reduce lazy `[UNRESOLVED]`)
- [x] `pnpm eval:invention` benchmark smoke + golden tests

### Exit check

In ≥3 of 5 trials, handoff reduces invented high-risk decisions. _(Locked by `runCrmInventionBenchmark()` / `pnpm eval:invention`.)_

## Week 4 — Sharpen, don’t broaden

### Goals

- Polish beachhead only
- Prepare distribution assets
- Freeze scope creep

### Build

- [ ] UX copy around Decision Debt / Build readiness
- [ ] Empty states that teach the category in one sentence
- [ ] One rental + one inventory regression path (support, not expansion)
- [ ] Launch checklist for local OSS demo
- [ ] Decide go/no-go on reference-evidence deep work vs more CRM depth

### Exit check

Wedge still narrow; product feels uniquely useful on CRM multi-brand ideas.

## Daily operating cadence

1. One user-visible improvement that strengthens Decision Debt or handoff
2. One test or fixture that prevents regression
3. One CRM transcript review for generic-question smell
4. No SaaS/billing/account work

## Tracking board (simple)

| Day band | Focus | Primary metric |
| --- | --- | --- |
| 1–7 | Debt + handoff package | Package completeness 100% |
| 8–14 | CRM magic moment | Non-obvious Q in first 3 ≥ 70% |
| 15–21 | Coding agent eval | Invention drop in side-by-side |
| 22–30 | Polish + proof | Demo convert + clear category story |

## Resource guidance

If energy is limited, protect this order only:

1. Decision Debt truthfulness
2. DO_NOT_INVENT quality
3. CRM question quality
4. Everything else

## Stop doing

- Writing more vision docs without product proof
- Adding providers before handoff wins
- Building dashboards
- Expanding to many domains
- Generating application code
