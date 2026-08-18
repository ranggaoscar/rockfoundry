# Demo pass report

Date: 2026-08-18  
Scope: local OSS demo readiness after Week 4 freeze

## Automated gates

| Check | Result |
| --- | --- |
| `pnpm test:core` | Pass (29+ tests including CRM/support/invention) |
| `pnpm eval:invention` | Pass — 5/5 CRM handoff wins |
| Core build (`tsc`) | Pass |
| Web build (`next build`) | Pass |
| Playwright e2e (auth + CRM discovery) | Pass |

## Friction found → fixed in this pass

| Friction | Impact | Fix |
| --- | --- | --- |
| Landing **Settings** routed to missing `/settings` | Dead-end for first-time users | Local settings drawer with BYOK env instructions |
| Recent projects always empty placeholder | Looks unfinished / hard to reopen work | Load `/api/projects` on landing + project sidebar |
| Provider settings looked like fake editable form | Trust issue (“does this save?”) | Honest local-env instructions; no fake save UI |
| Status copy broke Playwright expectation | CI risk | E2E updated for Debt wording |
| Option click ignored when question state lagged | Demo feels broken mid-answer | Answer uses message `questionId` |
| Playwright had no webServer | Flaky local e2e | Auto-start Next on port 3100 |
| Example chips weak for beachhead story | Weak first impression | Multi-brand CRM first example + category line |

## Manual demo path (expected)

1. Open `/`
2. Category line visible: *Before coding agents invent your product*
3. Start multi-brand CRM example
4. First question is customer identity
5. Answer path reaches visibility + ownership
6. Context drawer explains Debt vs readiness
7. Export contains `DO_NOT_INVENT.md` + `AGENT_HANDOFF.md`

## Distribution checklist

- [x] `DEMO.md` share script
- [x] README points at demo + eval
- [x] OSS launch checklist exists
- [x] Week 4 freeze locked
- [x] GitHub description/topics values prepared in `delivery/GITHUB_METADATA.md` (manual paste — no API token in this environment)
- [ ] Optional short screen recording (manual; not auto-generated here)

## Residual risks

1. Mock provider quality ≠ real model extraction quality — demo still works because CRM question engine is deterministic after idea intake.
2. Playwright full browser pass needs local browser deps; core+eval remain the hard quality gates.
3. No hosted screenshot set yet — README honestly omits fake screenshots.

## Go recommendation

**GO for local OSS sharing** if install smoke works on the sharer’s machine and the CRM first-three-questions path still feels non-generic.
