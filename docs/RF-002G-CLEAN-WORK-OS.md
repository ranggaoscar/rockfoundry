# RF-002G — Clean Work OS with legacy preservation

## Decision

The previous code did not launch clean: RF-001's committed migration backfilled `ProjectWork` for every nondeleted historical `Project`, and Work OS queries treated that relationship as activation. Do not rewrite that published migration, its checksum, or any existing data.

The smallest compatible boundary reuses the existing structured, server-owned `ActivityEvent`: only a personal-workspace `PROJECT_CREATED` event from `applyWorkAction(create_project)` opts a project into Work OS. Backfilled `ProjectWork` alone is not activation. No new schema, project model, migration, cleanup, seed or data import is needed.

`workSnapshot` filters projects, tasks/goals/milestones (nested in those projects), executions and activity by these explicit project identities. All operational mutations/poll/review paths use the same scope gate. Legacy records cannot be used to create operational tasks accidentally.

The existing Product Studio POST `/api/projects` no longer creates `ProjectWork`; its Project/revisions/messages flow remains unchanged. Work OS creation still writes Project + ProjectWork + PROJECT_CREATED atomically. Existing explicit Work OS projects remain active; this change does not silently reclassify owner-created operational work. A future approved import can create membership and an explicit activation marker atomically without duplicating the canonical Project; an import UI/API is intentionally outside RF-002G.

## Experience

Owner OAuth already defaults to `/today`. With no explicitly created Work OS projects, Today has zero active work, priorities, upcoming tasks and runs, and displays a clear empty state. `Create Project` leads to the existing Projects creation flow. `Create Task` explains the required project first; once created, Today quick-add and the existing task editor work normally. No operational projects/revenue are seeded.

Navigation explicitly labels the existing `/` route `Legacy Projects · Product Studio`. Legacy `/project/:id` and protected project APIs continue to expose historical discovery, documents, conversation, design and handoff records to the owner. This is a separate access path, not a new archive manager.

## Verification

- Isolated real Prisma/SQLite fixtures with 49 and 144 historical projects run the original migration/backfill unchanged: legacy Project rows/canonical values stay exact, Work OS projects/runs/activity start empty, including historical overdue task, goal and review-required execution fixtures.
- New operational project/task creation, task editing, goal association and disconnect/reconnect persistence pass. Legacy task creation via Work OS is denied; Product Studio-only creation stays excluded. Existing explicit Work OS workflow/acceptance tests remain green.
- Work OS + Hermes contract tests: 13 passed, zero failed. Hermes verified through local authenticated-contract tests only; no new production probe or production execution occurred.
- Focused Chromium E2E: one clean launch workflow passes, covers 1440px and 390px empty states/no horizontal overflow, legacy link/list/detail and preserved conversation, operational project/task creation/editing/refresh. Full RF-001 E2E suite not rerun.
- Typecheck, lint (zero errors; existing warnings) and production application build pass.

Production's stated 49 records and local development's stated 144 records need not match. No production/local primary DB migration, replacement, deletion or import was performed. Deployment/runtime/dependency fixes from 5bb68fa remain unchanged. Current-production backup/rehearsal, real OAuth provisioning, corrected operator wrapper/Compose review and owner publication/deployment approval are still separate operator gates.
