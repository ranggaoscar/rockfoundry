# Vision vs Code Gap Map

Status: living document for Agentic V1 wedge  
Source vision: user concept + `docs/PRODUCT_VISION.md` + roadmap phases

## Legend

| Status | Meaning |
| --- | --- |
| Done | Usable now |
| Partial | Exists but too shallow for moat |
| Missing | Not implemented |
| Later | Intentionally deferred |

## Phase alignment

### Phase 1 — Agentic Product Discovery

| Capability | Status | Evidence | Gap to close |
| --- | --- | --- | --- |
| Rough idea intake | Done | chat empty state + project create | Keep simple |
| Context understanding | Partial | extraction + merger | Quality varies by provider/mock |
| Hidden decision discovery | Partial | CRM/RENTAL/INVENTORY packs | GENERAL pack too weak; packs hard-coded |
| Contextual questions | Partial | `questions/engine.ts` | Needs more “oh shit” coverage + less rule brittleness |
| Decision Graph | Partial | nodes + AFFECTS edges | No real impact propagation / invalidation |
| Contradiction detection | Partial | rule list | Narrow; not decision-aware enough |
| Build readiness | Partial | score + NOT/DRAFT/BUILD | Not framed as Decision Debt / invention risk |
| BRD + PRD + ERD | Partial | template renderer | Many sections stay `[UNRESOLVED]` even when known |

### Phase 2 — Reference-aware agent

| Capability | Status | Gap |
| --- | --- | --- |
| Public URL inspect | Partial | Exists; evidence UX thin |
| GitHub inspect | Partial | Exists; limited synthesis |
| Reference as evidence not requirement | Partial | Prompt isolation exists; adoption/reject flow weak |
| “Like Linear” intent mapping | Missing | No structured reference claim → decision prompts |

### Phase 3 — Richer decision intelligence

| Capability | Status | Gap |
| --- | --- | --- |
| Decision impact blast radius | Missing/Partial | `conceptsAffectedByDecision` is basic BFS on edges |
| Change decision → reopen dependents | Missing | Supersede only; no cascade |
| ERD/PRD rewrite from impacted decisions | Missing | Export is snapshot templates |
| Decision Debt score | Was missing → implementing now | Core differentiator |

### Phase 4 — Tool ecosystem

| Capability | Status | Gap |
| --- | --- | --- |
| Tool registry | Partial | Core tools only |
| Community tools | Later | Needs stable tool contract first |
| Figma / DB / local repo tools | Later | After wedge proof |

### Phase 5 — Universal handoff layer

| Capability | Status | Gap |
| --- | --- | --- |
| Vendor-neutral markdown | Partial | BRD/PRD/ERD only |
| Anti-invention contract | Was missing → implementing now | `DO_NOT_INVENT`, decisions, invariants |
| Coding-agent specific adapters | Missing | Prompt packs for Claude Code/Codex/Cursor |
| Eval: invention rate with/without RF | Missing | Needed for win proof |

## Architecture health

| Area | Status | Note |
| --- | --- | --- |
| Local-first SQLite | Done | Good trust wedge |
| BYOK OpenAI-compatible | Partial | Anthropic/Gemini native later |
| Deterministic handlers around LLM | Partial | Right architecture; needs more actions covered |
| Chat-first UI | Partial | Works; Decision Debt not yet center-stage |
| Docs density | High | Risk: docs ahead of magic moment |
| Test coverage | Partial | Core tests exist; need debt + handoff + CRM golden paths |

## Moat checklist

| Moat piece | Today | Target in 30 days |
| --- | --- | --- |
| Named problem (Decision Debt) | Docs only | Product metric + UI + export |
| Unknown-unknown discovery | Demo-able in 3 domains | Reliable CRM beachhead |
| Decision Graph consequences | Shallow | Visible top risks + affected concepts |
| Anti-invention handoff | Missing | Default export package |
| Provenance | Present in schema | More visible in UI/export |
| Local-first trust | Strong | Keep; don’t SaaS-distract |

## Priority stack (build order)

### P0 — win the wedge

1. Decision Debt computation + persistence + UI
2. Anti-invention handoff export package
3. CRM golden-path reliability (“oh shit” in first 3 Qs)
4. Export/tests for handoff completeness

### P1 — make moat felt

5. Impact list when answering a decision
6. Stronger contradiction rules for CRM identity/permissions
7. Coding-agent handoff prompt (`AGENT_HANDOFF.md`)
8. Side-by-side eval fixtures

### P2 — broaden without diluting

9. Reference claim → confirmation questions
10. Domain pack extraction from giant `questions/engine.ts`
11. Native provider adapters
12. GENERAL domain intelligence upgrade

### Explicitly not now

- Billing/auth/teams
- Code generation
- 20 industry templates
- Permanent analytics dashboard

## Honesty bar

RockFoundry is **direction-complete** and **moat-incomplete**.

Winning requires making Decision Debt and anti-invention handoff unavoidable in the product experience — not adding more documentation.
