# RF-003 — Living Workspace

## Baseline and ownership

Production was inspected read-only through the approved wrapper before implementation: dcf187fe8ff923d796d561d08ac96a25c1926b35, same as local HEAD and remote main; service HTTP 200, restart 0, SQLite integrity ok, seven applied migrations. Development is on feat/rf-003-living-workspace; no production migration, configuration change, merge, push or deploy is part of this work.

Rock Foundry owns ideas, conversations, executor turns, proposal decisions and actual work. Hermes remains the existing replaceable ExecutorAdapter. Google owner sessions and Work OS/legacy activation boundaries stay unchanged. /ask, /inbox and /api/living enforce the owner boundary; mutation routes also validate same-origin JSON requests. /today remains the owner-login default. Legacy Product Studio stays separate.

## Implemented vertical slice

- Quick Capture saves an original note immediately to SQLite without AI or required project selection. Optional active-project association. Original text (including whitespace) and creation timestamp remain immutable. Stable request identity prevents duplicate retries.
- Inbox shows captured notes and an explicit reviewed conversion form: task in an active operational project or new operational project. Conversion retains the note and its timestamp; repeat conversion reuses the persisted destination.
- Ask Rock stores user/assistant messages and conversation threads. User message + immutable execution intent are committed before external execution. Queued/submitting/running/blocked/failed/terminal states survive refresh. The UI advances pending turns; retries keep the same executor/run identity and lease. No background worker or AI framework is introduced.
- Structured bounded context comes from active-only DB projects/tasks, counts, goals/milestones, recent Inbox notes and the selected conversation. Model suggestions are visibly distinct from owner input. Validated proposals support create task, update task, create project, convert idea and reviewed project plans. Owner may edit, approve or dismiss. No proposal mutates work automatically. Approved proposals use established Work OS validation in one database transaction with the decision; original suggestion payload and reviewed payload are both retained.
- Today exposes Ask Rock + Quick Capture before attention/task/run/activity sections. Desktop sidebar and mobile navigation reuse existing styling; Ask/Inbox include active project links.

## Hermes execution

Production conversation executor is Hermes only using the existing server-side Runs API configuration, model alias and idempotency/binding checks. Development has an explicit deterministic mock enabled only by ROCKFOUNDRY_LIVING_MOCK=true with NODE_ENV not production; it is never automatic fallback. The mock is labeled in UI and used only for repeatable tests.

AI output must be structured JSON {reply, proposals:[{type,payload}]}. Invalid output is displayed as text without executable actions. Proposal schema allows no messaging, deployment, execute-agent, deletion or financial operations. Model context and notes are untrusted data, not authorization. Server-side tool restriction still belongs to the configured Hermes profile; these prompts do not grant or replace permissions.

## Migration

One additive migration 20261011080000_living_workspace adds CapturedIdea, RockThread, RockMessage, RockTurn and RockProposal. Existing Project/ProjectWork/Task/AgentExecution/legacy tables and prior migration checksums are preserved. No operational seeds or imports.

Rehearsal used a consistent READ-ONLY backup of the LOCAL 144-project database and Prisma migrate deploy on its isolated scratch copy, not production. All 27 pre-existing tables' original columns/rows remained exact; integrity ok; FK violations zero; only the new migration applied. Production rollout must repeat backup/preflight on the current production DB via the approved operator workflow.

## Verification

Focused domain/contract checks: 9 Living Workspace integration tests plus 1 private API auth test, 7 Work OS/legacy regression tests and 6 Hermes adapter contract tests (23 relevant cases across the final file set). Real Prisma/SQLite fixtures verify note persistence without provider, duplicate request payload conflict, scheduled atomic conversion, edited owner review without losing original proposal, concurrent review/submission, refresh/poll recovery, invalid/legacy proposals, failed/retry horizon and bounded thread-isolated context. Official HermesExecutor is exercised through its authenticated HTTP Runs contract fixture, not substituted model-chat APIs.

Focused Chromium browser: 2 passed. Mobile 390px capture/refresh/Ask/edited approval/Today/history and Inbox conversion/offline-message/new-thread recovery; desktop 1440px input/navigation overflow checks. Real rendered screenshots were inspected and selector width/readability tightened. Typecheck passes, lint zero errors (14 existing warnings), Next production application build passes, production dependency audit zero advisories. Unrelated full suites were not rerun.

## Deliberate V1 limits

- Lifecycle is request-driven: pending responses resume when the workspace is open/refreshed. No scheduled planner/worker.
- UI snapshot is bounded to recent 100 ideas/messages/turns and 30 threads; older records remain stored. Context is bounded separately; no full-history injection.
- Project-plan acceptance records a reviewed plan; it does not silently create a bulk plan of tasks/milestones. Individual task proposals can be approved separately.
- Voice capture is optional and not included; text capture works on mobile without speech/browser permissions.
- Real production Hermes/Google round-trip is not executed by local test fixtures. Official Hermes HTTP contract and persistence/approval flow are verified locally; owner-approved post-deploy smoke remains necessary.
