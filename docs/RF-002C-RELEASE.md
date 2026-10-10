# RF-002C — Work OS + Hermes release candidate

## Status

Application candidate prepared on `feat/rf-001-work-os`; owner has reported the scoped real probe returned `ROCKFOUNDRY_PROBE_OK` with dedicated profile `rockfoundry`, execution policy `observe`, model alias `rockfoundry` routing through Rockbase to `cmc/deepseek/deepseek-v4.1-flash`.

That probe is **infrastructure evidence supplied by the operator**, not a completed Rock Foundry application task. It has not been repeated. Production application integration is NOT PASS until the new deployed backend persists a real task result and the owner accepts it.

## Verified inspection (authorized wrappers only)

`sudo /usr/local/sbin/rockfoundry-inspect` reports:

- Repository `/opt/rockfoundry/repo`, current HEAD and origin/main `3807dce930e2dbda1f36402124e664e6ae24ff1b`, clean production tree.
- Compose `/opt/rockfoundry/ops/compose.yaml`, project `rockfoundry`, service `web`, image `rockfoundry-web:3807dce`.
- Container `rockfoundry_web` on `rockfoundry_proxy` at `192.168.16.2`, no host-published ports, running without restarts/OOM, internal/public HTTP 200.
- Runtime env reference `../config/runtime.env`; full protected Compose/env content is not available to restricted SSH.
- Persistent `/opt/rockfoundry/data/rockfoundry.db` exists (5,738,496 bytes). Latest reported backup: `rockfoundry-before-draft-generation-20260826-010250.db`.
- Current public route uses Caddy `reverse_proxy rockfoundry_web:3000`. `noindex` is not authentication.
- Approved SHA marker absent. No container rebuild/recreate, network change, secret read/copy, restart or push performed.

`sudo /usr/local/sbin/rockfoundry-logs 200` shows normal Next.js startup. The root-owned wrapper sources were readable without escalation; inspection confirmed fixed scopes and approval gates. No live probe invocation was made.

## Application adapter compatibility

- Reads existing protected variable names `HERMES_RUNS_BASE_URL`, `HERMES_API_KEY`, `HERMES_MODEL`; legacy RF-001 names remain compatible.
- Explicit `HERMES_EXECUTOR_ENABLED=true` required; no silent Mock fallback.
- Sends `model: rockfoundry` on Runs submission. Model alias participates in persisted binding identity, so changing endpoint/key/model refuses ambiguous retry rather than duplicating work.
- HTTPS/default loopback rules remain; exact operator-pinned RFC1918 HTTP origin is supported for `http://192.168.16.1:8643`. Public HTTP or a different origin remains refused.
- Requires authenticated run_submission/run_status and supported **durable** idempotency with at least 24h retention; retries limited conservatively to 23h. The currently readable probe wrapper summarizes Runs features but does not output durable replay metadata. Operator must confirm these exact fields on the deployed API before the first Foundry task; a basic health pass alone is insufficient.
- External run ID, states, output and receipt evidence persist through the existing Work OS lifecycle. Completion becomes `REVIEW_REQUIRED`, not `DONE`; explicit owner acceptance is unchanged.
- Controlled authentication/expired/conflict/capacity diagnostics are persisted without transport body/credential disclosure. Failures retain execution identity/external ID; no fresh submission after missing/terminal result.
- Reverse-proxy origin handling explicitly supports `ROCKFOUNDRY_WORK_ORIGIN=https://foundry.rockbase.web.id`; no trust of arbitrary forwarded headers. Local RF-001 behavior remains tested.
- Credentials are runtime-only, not `NEXT_PUBLIC_*`, build args, source, image config or browser payloads. Adapter/config symbols were absent from built client JS. Protected env was never readable/copied in this session.

## Candidate deployment files

`deployment/compose.hermes-work-os.yml` is a **delta/reference**, not automatically applied by the current wrapper. It preserves base ports, networks, volumes, restart and command. It uses:

- service `web` (verified);
- build context `/opt/rockfoundry/repo`, Dockerfile `deployment/Dockerfile.work-os`;
- NEW candidate image pin supplied explicitly by operator;
- required env_file `/opt/hermes-agent/home/profiles/rockfoundry/client.env`;
- `HERMES_EXECUTOR_ENABLED`, exact private HTTP origin pin, and canonical Work OS origin.

The VPS operator must merge the delta into the **fixed base** Compose (retaining current runtime.env and persistence bindings), or update the gated wrapper to explicitly load the approved overlay. Never run `up` against the old image just to inject env. Never print full resolved `docker compose config`, which exposes env values; use `config --quiet` for validation and redacted metadata for review.

The candidate Dockerfile performs frozen pnpm install, Prisma client generation and application build, without live env or DB. Its Dockerfile-specific ignore excludes secrets, .env, .git, DBs, caches and owner brief. It retains Prisma migrations. The image was **not built under Linux Docker** here because Docker is unavailable locally and unrestricted VPS Docker is denied. Successful Next.js build is not a successful Docker image build.

## Migration preflight

`deployment/migration-preflight.py` opens the selected DB read-only, backs it up into memory, checks applied migration checksum history (including LF/CRLF variants), rehearses pending SQL, and compares all existing table columns/rows before/after plus integrity/FK checks.

Local pre-RF-001 backup rehearsal passed with all 15 legacy tables/rows preserved; pending were conversation_turns, conversation_turn_attempt, draft_generations and additive work_os. **This is not the production DB**. The production wrapper currently exposes DB size only, so its exact applied migrations/row compatibility remain unverified. Operator must run preflight against a quiet/consistent production backup before migration.

New Work OS SQL is additive. The pre-existing draft_generations migration rebuilds Artifact while preserving old fields, so pending production history matters. Never infer all existing migrations are applied from repository SHA or HTTP 200. Existing conversation FK/default drift is known and is not repaired by a destructive/reset operation.

## Current deploy-wrapper gaps (must be resolved before approval)

`/usr/local/sbin/rockfoundry-deploy <SHA>` currently:

1. Requires exact 40-character SHA plus root-owned mode 600/400 `/opt/rockfoundry/ops/.approved-deploy-sha` holding the same SHA.
2. Fetches and requires **origin/main == SHA**, then ff-only pulls main. A local feature-branch commit cannot pass this gate until owner separately authorizes the corresponding push/merge/release.
3. Backs up SQLite + data and Compose, updates image pin, builds fixed base Compose and recreates only `web`.
4. Checks homepage HTTP; **does not run Prisma migrations**, inspect the authenticated adapter, enforce owner ingress, or smoke `/api/work`.

Required operator improvements/steps:

- Preserve root-owned SHA gate; never create/bypass it from the agent.
- Fold approved build/env delta into base Compose without network/persistence changes; verify base command/environment does not override the candidate incompatibly.
- Build candidate successfully before replacing current image. Confirm application data path inside candidate resolves to the existing mounted `/opt/rockfoundry/data` storage rather than new empty storage.
- The supported `pnpm dev` launcher is now bound explicitly to `127.0.0.1`; Host headers are not client identity. Do not override the bind to a network address without provisioning the access key; production/live gate still requires auth regardless of Host.
- **Superseded by RF-002D** (`docs/RF-002D-OWNER-AUTH.md`): the static `ROCKFOUNDRY_WORK_ACCESS_KEY` / HTTP Basic gate described below was removed. Private Work OS access now requires an authenticated owner Google session (`withOwner` in `lib/owner-access.ts` + `middleware.ts`); do not provision `ROCKFOUNDRY_WORK_ACCESS_KEY`.
- Legacy Product Studio routes retain their old access model; if their project/history must also be private, operator must place owner-auth at the entire ingress. `noindex` and `observe` are not access control. Full hosted accounts remain out of scope.
- Consistent DB backup/preflight, then run candidate `prisma migrate deploy` as a separate one-off step using the same data binding. Do not run migrations during image build or blindly as every-start side effect.
- Extend wrapper release flow to include this migration and `/api/work` runtime health before claiming success; keep web-only recreation and existing Telegram/cron untouched.

## Exact deployment command / authorization sequence

After **separate** owner authorization for publishing/merging this feature release to origin/main, operator configuration/migration/ingress gates and root-owned approved SHA marker:

```bash
sudo /usr/local/sbin/rockfoundry-deploy <EXACT_40_CHAR_RELEASE_SHA>
```

The final report gives the actual local release SHA. Do not run this command now. Current wrapper refuses while marker/main mismatch exists; even after those gates it needs the migration/runtime preparation above.

## Rollback reference

Current source/image rollback anchor: `3807dce930e2dbda1f36402124e664e6ae24ff1b` / `rockfoundry-web:3807dce`.

Wrapper creates `/opt/rockfoundry/ops/compose.yaml.bak-<UTC stamp>`, `/opt/rockfoundry/backups/deploy-<short SHA>-<stamp>/rockfoundry.db` and full data tar before recreation. Retain old image. Restore previous Compose/image through operator procedure; do not delete/reset DB. Additive Work OS schema can normally remain when rolling back old app. Any full DB restore would lose newly created work and requires explicit approval.

## Validation and exclusions

Verified: 13 focused adapter/Work OS/origin cases passed; 3 owner-access/dev-launcher cases and 1 actual-route access case passed. Live local dev smoke returned HTTP 200 with only `127.0.0.1:3215` listening; temporary server was stopped. Independent review identified access exposure; both GET/POST were gated and its remaining dev-bind concern was resolved by loopback binding. Targeted ESLint and TypeScript passed; Next.js candidate build passed after the access/origin fixes. Client chunks contain none of the Hermes/owner secret configuration symbols. Local in-memory migration rehearsal passed; full RF-001 suites were not repeated. Linux Docker build and production migration rehearsal remain operator gates.

Scope excludes user `IDEA.md`, credentials, real DB/backups, caches, generated builds, screenshots, local reports and any VPS protected files. No additional background worker, Hermes profile/core, networking, Telegram or cron changes.

Remaining production acceptance step after approved deployment: one harmless observed task through `/api/work` using executor Hermes → stable external run ID/status → persisted output/evidence → refresh → real owner review/acceptance → task DONE. The already passed direct infrastructure probe is not this acceptance step.
