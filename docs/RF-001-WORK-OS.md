# RF-001 — personal-first Work OS foundation

## Architecture decision and repository audit

RF-001 is additive to the existing Next.js 16 / React 19 / TypeScript pnpm workspace. SQLite, Prisma 7 and the existing OS-aware data directory remain the source of truth. No database provider, framework, auth or infrastructure migration was introduced.

- The existing `Project` remains the shared identity for work and product discovery. `ProjectWork` adds workspace ownership, operational status and target date without changing discovery columns.
- Decision Graph, canonical state/version revisions, Product Discovery, Product Draft, Design Studio, sandboxed prototypes, provider adapters and WebMCP remain intact under `/` and `/project/:id`.
- Existing discovery `AgentRun`, `ToolRun`, `PackageJob` and `DesignGenerationJob` keep their original meaning. Task execution uses `AgentExecution`; an LLM conversation turn is not treated as a delegated work execution.
- `/today`, `/projects` and `/runs` are a separate responsive operational surface, reachable from the existing sidebar. No homepage replacement or large UI redesign.
- Existing project creation also attaches the personal workspace. The additive migration enrolls pre-existing non-archived projects without changing their discovery history.
- Core domain persistence covers Workspace, Project, Goal, Milestone, Task, TaskAssignment, AgentExecution, Approval, Evidence and ActivityEvent.

## Ownership and safety boundary

`personal` workspace and `local-owner` actor are server-owned, not client-supplied identities. Every task, goal, milestone and run mutation checks the workspace/project boundary and excludes archived projects. Goal/milestone associations are validated against the task's project.

This is **not authentication or hosted multi-tenancy**. Run locally bound to loopback. Mobile-sized browser usability is supported; remote phone access requires a separately approved authenticated ingress. Do not expose this personal instance directly on a public port.

Work mutations require JSON, reject foreign browser origins, and are disabled when `ROCKFOUNDRY_PUBLIC_DEMO=true`. Credentials never enter the UI or work database. Executor errors are stored as bounded safe summaries, not raw transport errors. Output is rendered as text; evidence links allow only HTTP(S).

## Functional workflow

1. Open `/projects`, create a project, optionally add goals/milestones.
2. Add a task with explicit acceptance criteria, assignment, priority, due/planned date and optional goal/milestone.
3. Select an available executor and choose **Execute with Agent**.
4. Intent is persisted `QUEUED` before any executor call. An immutable input snapshot belongs to the run.
5. The UI polls active runs using explicit POST actions. GET requests never submit or advance work.
6. Submission records an external execution ID. Results and evidence persist as `REVIEW_REQUIRED`; the task also requires review, not `DONE`.
7. Accept creates an immutable approval and marks the task `DONE`; reject retains output/evidence/history, reopens the task, and permits revision/new execution.
8. Project progress derives from accepted tasks; marking a project done is refused while outstanding tasks remain.
9. Human-assigned work can be completed only with an explicit acceptance note. Agent-assigned work must go through result review.
10. Refresh/restart retains work and execution state. Runs, inputs, output, evidence, approvals and events live in SQLite, not component memory.

Today uses persisted tasks for daily priorities, overdue/upcoming deadlines, active executions and pending reviews. Quick-add is available as a collapsible form. Task editing supports title, description, acceptance criteria, priority, dates, assignment and associations before execution; submitted and accepted work is immutable until a result is rejected.

## Executor lifecycle and retry guarantees

`apps/web/src/lib/executor-adapter.ts` defines a provider-independent `ExecutorAdapter`: availability, capability-declared idempotent submit, external ID and status/results read. No Hermes memory/skills handling is duplicated.

- One task claims one active execution slot transactionally; new request IDs cannot create a second active submission.
- `(taskId, requestId)` deduplicates incoming execute requests. The persisted run ID is the adapter submission idempotency key.
- Compare-and-set leases prevent concurrent lifecycle calls. Expired leases can be recovered with the same identity.
- A failed run retains its slot and identifiers; **Retry safely** polls/retries that run rather than creating another.
- Submission with an uncertain outcome is never automatically repeated for a non-idempotent adapter. It must be reconciled externally first.
- Accepted/rejected runs are terminal. Repeated identical reviews are idempotent; conflicting reviews are refused.

### Mock executor

Offline Mock is deterministic, explicitly marked **development only**, network-free, and does not perform real work. Its persisted result and receipt verify the application workflow, not delivery of the requested task. There is no automatic fallback from Hermes or another executor to Mock.

### Hermes integration status

> RF-001 baseline snapshot below; RF-002C adapter/runtime compatibility and current release gates are in `docs/RF-002C-RELEASE.md`.

Hermes core/config/gateways have not been modified. `hermes-executor.ts` implements the official authenticated HTTP Runs API, not an OpenAI-compatible model-chat substitute. It remains disabled/unavailable in this installation until explicitly configured; unavailable submission returns 503 without creating an execution or silently switching to Mock.

Verified official contract:

- `GET /health`: inexpensive liveness; `GET /health/detailed`: authenticated readiness.
- `GET /v1/capabilities`: authenticated feature discovery, including `features.runs_idempotency.{supported,durable,retention_seconds}`. The adapter requires durable supported replay with at least 24h retention before any submission; older/non-durable versions fail closed.
- `POST /v1/runs`: input/instructions, Bearer auth, stable `Idempotency-Key`, HTTP 202 `run_id`. Identical replay returns the original ID; changed payload conflicts. Authentication/profile scopes affect replay identity.
- `GET /v1/runs/:id`: persisted status/final output. Completed maps to RockFoundry `REVIEW_REQUIRED`; failed/cancelled/interrupted never complete a task. Waiting-for-tool-approval stays active with a human-action notice.
- Official SSE (`GET /v1/runs/:id/events`) and stop (`POST /v1/runs/:id/stop`) exist, but V1 uses polling and does not expose remote stop or auto-tool approvals.

Adapter safety: HTTPS is required except loopback HTTP; URLs cannot contain credentials/query/fragment; redirects are refused; requests time out; response parsing/size is bounded; transport exceptions are not persisted. Endpoint/profile/key identity is hashed into the immutable server-side run input; changing it refuses retry instead of moving a run to another credential namespace. Ambiguous resubmission is refused after a conservative 23h window. Existing external IDs are polled only, never replaced with a fresh POST on 404/failure.

Server-side configuration (no browser settings or secret values):

| Variable                   | Meaning                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `HERMES_EXECUTOR_ENABLED`  | Explicit `true` opt-in after endpoint/tool scope is approved                                 |
| `HERMES_EXECUTOR_BASE_URL` | API server origin/profile root, without `/v1` suffix; supports a verified `/p/:profile` root |
| `HERMES_EXECUTOR_API_KEY`  | Secret Bearer key in server process secret configuration, never `NEXT_PUBLIC_*`              |

The HTTP adapter was exercised against a real local **test HTTP server implementing the documented contract**, including authenticated discovery/submission, dedupe, ambiguous socket-drop replay, polling/output, terminal/missing states, capability refusal and credential binding. This is contract testing, **not a live Hermes run**.

Exact live blocker: RockFoundry has no enabled/provisioned endpoint + secret binding + approved restricted Hermes tool scope. A read-only probe of the documented default `127.0.0.1:8642/health` returned connection unavailable (HTTP 000). Alternate production endpoints/authentication were not supplied or inspected. No Hermes jobs/gateway/setup commands were run.

Sources verified directly:

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://raw.githubusercontent.com/NousResearch/hermes-agent/main/gateway/platforms/api_server.py
- https://raw.githubusercontent.com/NousResearch/hermes-agent/main/gateway/platforms/api_server_runs.py
- https://raw.githubusercontent.com/NousResearch/hermes-agent/main/gateway/platforms/api_server_run_idempotency.py

## Migration and recovery

The pre-task repository was `main` at `3807dce`, with user-owned untracked `IDEA.md`. Implementation is on `feat/rf-001-work-os`; no commit, push or deploy is authorized.

The local database originally contained 144 projects and only the first three existing migrations. The three pending conversation/draft migrations and the new additive `20261010070000_work_os` migration were tested on a SQLite backup clone before application to the local database.

Persistent pre-migration rollback backup:

`D:\HERMES DESIGN AGENT\working\RF-001\backups\rockfoundry-20261010-141310.db`

All existing columns/rows in all legacy tables were compared before/after: unchanged. The local database retains 144 projects; all are enrolled in the personal workspace. SQLite integrity check is `ok`, foreign-key check returns no violations. Never reset the DB or delete original storage for rollback; restoring this backup would discard subsequently created work, so approve that separately.

Known **pre-existing migration/schema drift**: the conversation-turn migration adds `ConversationMessage.conversationTurnId` without the schema-declared FK and defines `ConversationTurn.updatedAt` with a default that is absent in the schema. Prisma diff still proposes redefining those two legacy tables. RF-001 adds no drift to Work OS tables and does not run that unrelated table rewrite.

## Verification

- Focused real-SQLite tests cover durable execution/review, duplicate submissions, concurrent claims, safe retry, uncertain submission refusal, reject/revise, workspace associations and unavailable Hermes.
- Playwright covers full project/task/Mock/evidence/acceptance/refresh workflows at desktop 1440px and mobile 390px, Today/quick-add/edit/human acceptance, and API request validation.
- Existing unit and browser regression suites remain the gates for Discovery, Draft, Design Studio, handoff and WebMCP helpers.
- Verified quality gates: `pnpm build` passes; `pnpm typecheck` passes; `pnpm test` passes 282 tests; `pnpm lint` passes with 0 errors and 10 pre-existing warnings. Changed/new Work OS source files pass focused ESLint without warnings.
- Full local browser suite: 24 passed, 3 skipped. Skips are 2 public-demo-mode-only cases and 1 deterministic-provider-failure-only case; not misreported as passes. All 4 RF-001 cases passed, including 1440px and 390px complete workflows and mobile Today.
- Production-build local smoke: `/api/work` and `/today` return HTTP 200; runtime snapshot lists 144 existing projects, Mock available and Hermes unavailable. Original DB contains no QA-generated tasks/runs.
- Screenshot evidence is copied to `D:\HERMES DESIGN AGENT\working\RF-001\evidence` (Projects and Runs at 390px and 1440px). Mobile navigation/output/evidence were visually inspected and horizontal overflow was checked by DOM assertions.

## Repository file scope

Created:

- `packages/db/prisma/migrations/20261010070000_work_os/migration.sql`
- `apps/web/src/app/api/work/route.ts`
- `apps/web/src/app/today/page.tsx`
- `apps/web/src/app/projects/page.tsx`
- `apps/web/src/app/runs/page.tsx`
- `apps/web/src/components/work-command-center.tsx`
- `apps/web/src/components/work-command-center.css`
- `apps/web/src/lib/work-os.ts`
- `apps/web/src/lib/work-os.test.ts`
- `apps/web/src/lib/executor-adapter.ts`
- `apps/web/src/lib/hermes-executor.ts`
- `apps/web/src/lib/hermes-executor.test.ts`
- `apps/web/playwright/work-os.spec.ts`
- `docs/RF-001-WORK-OS.md`

Modified:

- `packages/db/prisma/schema.prisma`
- `apps/web/src/app/api/projects/route.ts`
- `apps/web/src/components/workspace-sidebar.tsx`
- `apps/web/package.json`
- `README_START_HERE.md`

User-owned pre-existing untracked `IDEA.md` is untouched. No credentials, generated builds, QA databases or screenshots are intended Git changes. Starting HEAD remains unchanged; no commit, push or deployment was performed.

## Known V1 limits / RF-002

- Hermes production execution is blocked as described above; Mock is the only available executor.
- Request-driven polling advances execution ingestion; there is no unattended execution worker or webhook receiver yet. Hermes can execute server-side after admission, but RockFoundry ingests its result only while polling.
- Execution receipts/final text are persisted; verified artifact downloads and tool-event evidence ingestion are RF-002 work.
- Failed/uncertain runs retain the task slot for safe same-run retry; explicit terminal-failure reconciliation/replacement UI is future work, not automatic resubmission.
- Goals/milestones persist and associate with tasks; automatic goal/milestone completion and advanced goal metrics are not implemented.
- Personal ownership is modeled but full team accounts/permissions are out of scope.
- No billing, CRM, native mobile app, financial automation or autonomous outreach.
- Recommended RF-002: provision a restricted authenticated Hermes execution service, verify its API/schema and reconciliation guarantees, enable and live-verify the implemented HTTP adapter, then extend restart recovery and artifact ingestion tests, then add an unattended lifecycle worker if needed. Keep application acceptance separate from executor success.
