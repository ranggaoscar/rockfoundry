# RF-002D — Owner Authentication + Production Release Preflight

Owner-only authentication for the Rock Foundry Work OS, plus the verified preparation
needed for the first production deployment. **Nothing was deployed, merged or pushed.**

## 1. What was implemented

| Requirement | Implementation |
| --- | --- |
| Google OAuth, default deny | `next-auth@4.24.15` (stable, maintained, Next.js App Router native) — `app/api/auth/[...nextauth]/route.ts`, `lib/owner-auth.ts` |
| Only configured owner identities | `ROCKFOUNDRY_OWNER_EMAILS` allowlist (+ optional immutable `ROCKFOUNDRY_OWNER_GOOGLE_SUBS`); any other Google identity is refused even after a successful Google login |
| Secure session storage | JWT session in `__Secure-rockfoundry.session-token`: `HttpOnly`, `Secure`, `SameSite=Lax`, 8h max age; CSRF cookie `__Host-rockfoundry.csrf-token`; PKCE + state checks |
| Protect private pages | `middleware.ts` gates `/today`, `/projects`, `/runs`, `/project/*`, `/settings` → redirect to `/login` |
| Protect private APIs | All 24 private route handlers wrapped with `withOwner()` (`lib/owner-access.ts`) — authorization runs before any handler, DB read or tool call. Belt and braces with the middleware matcher |
| Audit other entry points | `/api/projects*`, `/api/provider*`, `/api/projects/[id]/{research,spec,design*,revisions,documents,export,extract,package,questions,references}` all gated. WebMCP helpers (`lib/webmcp-*.ts`) only call those gated routes from the browser, so they inherit the owner session boundary |
| Public landing page | `/` and `/login` stay public; the landing page renders no private records and its project fetch returns `401` for anonymous callers |
| Hermes execution auth | Executor is server-side only; `withOwner` + `isWorkOriginAllowed` guard `POST /api/work`. Credentials never leave the server |
| No static Work API secret | The old `ROCKFOUNDRY_WORK_ACCESS_KEY` gate (and its source/bundle contract tests) was removed: a static bearer secret is not an identity boundary and is now replaced by the owner session |
| No credential exposure | `authorization` headers are stripped before session evaluation; **0** shipped client-bundle files contain `HERMES_API_KEY`, `ROCKFOUNDRY_WORK_ACCESS_KEY`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET` or the owner address |
| No public registration / teams | Google provider only, no sign-up surface, no role/team model |
| Legacy data preserved | 144 projects and all legacy tables untouched; auth adds no DB tables and no migration |
| Local-first development | When owner OAuth is not provisioned, a loopback-only fallback keeps local dev/Playwright working. It is impossible in production (any provisioned env or `NODE_ENV=production` disables it) |

## 2. Exact values the VPS operator must provision

Secrets are **never** printed, committed, or pasted. Put these in the owner-protected
runtime file (already referenced by the base Compose): `/opt/rockfoundry/config/runtime.env`, root:root, mode 600.
Template: `deployment/runtime.env.template`.

| Variable | Value / source |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google Cloud Console → APIs & Services → Credentials → OAuth client ID (**Web application**) |
| `GOOGLE_CLIENT_SECRET` | Same OAuth client (owner-provisioned secret) |
| `NEXTAUTH_URL` | `https://foundry.rockbase.web.id` (exact, no trailing slash) |
| `NEXTAUTH_SECRET` | 32+ random bytes, generate with `openssl rand -base64 48` (or `head -c 48 /dev/urandom \| base64 \| tr -d '\n'`) |
| `ROCKFOUNDRY_OWNER_EMAILS` | `ranggaoscar@gmail.com` (comma-separated allowlist; default deny) |
| `ROCKFOUNDRY_OWNER_GOOGLE_SUBS` | Optional hardening: comma-separated immutable Google `sub` id(s) for the owner account |
| `ROCKFOUNDRY_WORK_ORIGIN` | `https://foundry.rockbase.web.id` |
| `ROCKFOUNDRY_DATA_DIR` | `/opt/rockfoundry/data` |
| `ROCKFOUNDRY_DATABASE_URL` | `file:/opt/rockfoundry/data/rockfoundry.db` |
| `HERMES_EXECUTOR_ENABLED` | `true` |
| `HERMES_EXECUTOR_PRIVATE_HTTP_ORIGIN` | `http://192.168.16.1:8643` |
| `HERMES_RUNS_BASE_URL`, `HERMES_MODEL`, `HERMES_API_KEY` | **already provisioned** in `/opt/hermes-agent/home/profiles/rockfoundry/client.env` — do not copy, do not print |

Google Cloud OAuth client configuration (exact):

```
Application type : Web application
Authorized JavaScript origin : https://foundry.rockbase.web.id
Authorized redirect URI      : https://foundry.rockbase.web.id/api/auth/callback/google
```

No other redirect URI is required. `http://localhost:3000` is deliberately **not**
registered for production.

## 3. Verification evidence (this build, real HTTP, loopback)

Scenario harness: 19/19 PASS. Anonymous / non-owner / expired / forged / unverified-owner / owner.

| Scenario | Result |
| --- | --- |
| `GET/POST /api/work`, `GET /api/projects`, `GET /api/provider` with no session | `401` |
| Static `Authorization: Bearer <any>` (old Work API key pattern) | `401` — no longer an identity |
| Valid Google session for a non-allowlisted identity | `403` |
| Expired owner session | `403` |
| Forged/undecryptable cookie (wrong secret) | `401` (treated as no session) |
| Owner identity without verified Google e-mail | `403` |
| Owner session → `GET /api/work` | `200`, 144 persisted projects |
| `/today`, `/projects`, `/runs`, `/project/1`, `/settings` anonymous | `307` → `/login?callbackUrl=…` |
| Same pages with the owner session | `200` |
| `/` anonymous | `200`, 8,447 bytes, 0 private-record markers |
| `GET /api/projects` anonymous body | `{"error":"Owner Google session required."}` |
| `/api/auth/session` anonymous | `{}` |
| Shipped client bundles containing any secret/owner address | **0** |

Unit/contract gates: `owner-access.test.ts` 5/5 (allowlist default-deny, token expiry,
production config requirement incl. HTTPS origin pin, real Work-route enforcement,
loopback-only dev fallback). Full local gates: typecheck 0 errors, ESLint 0 errors
(10 pre-existing warnings), 40 tsx + 34 vitest tests pass, production build compiles.

Not verified locally (honest limitation): the real Google round-trip cannot complete
against dummy client credentials, so the live consent screen + callback is the one step
that must be smoke-tested after deployment with the provisioned client.

## 4. Production state (read-only, via approved wrappers)

```
revision        3807dce930e2dbda1f36402124e664e6ae24ff1b (origin/main matches)
image           rockfoundry-web:3807dce   restarts=0   oom_killed=false
container http  200 (http://192.168.16.2:3000/)   published ports: none
compose         /opt/rockfoundry/ops/compose.yaml (sha256 e5621175…d16d23)
env_file        ../config/runtime.env
database        /opt/rockfoundry/data/rockfoundry.db  (5,738,496 B, mtime 2026-09-12)
backups         /opt/rockfoundry/backups (latest rockfoundry-before-draft-generation-20260826-010250.db)
disk            /  99G total, 69G used, 26G free (73%)
approval marker /opt/rockfoundry/ops/.approved-deploy-sha → absent (gate armed, not bypassed)
```

## 5. Migration preflight result — PASS

The `hermes` identity cannot read `/opt/rockfoundry` (mode 750, ubuntu-owned), so the
production SQLite file itself is not reachable from this session. Preflight therefore ran
on the legacy-state database snapshot (`D:\HERMES DESIGN AGENT\working\RF-001\backups\rockfoundry-20261010-141310.db`,
144 projects, taken immediately before the Work OS change) using the **real production
migration path**, not a simulation:

1. `deployment/migration-preflight.py` (read-only source, in-memory rehearsal) →
   `all_legacy_rows_preserved: true`, `integrity: ok`, `foreign_key_violations: 0`.
2. `prisma migrate deploy` against a byte copy of that legacy database → applied
   `20260825090000_conversation_turns`, `20260825120000_conversation_turn_attempt`,
   `20260825150000_draft_generations`, `20261010070000_work_os`; all 7 migrations finished.
3. Post-migration verification of the copy:

```
tables 28      integrity ok      foreign_key_violations 0
Project 144    Artifact 335      ConversationMessage 847
ProjectStateRevision 656          ToolRun 42
Workspace 1    ProjectWork 144    (Goal/Milestone/Task/AgentExecution/Approval/Evidence/ActivityEvent created, empty)
```

Residual risk: production's own `_prisma_migrations` history was not readable. If it is
behind by more than the Work OS migration, the rehearsal above already covers that worst
case (all four pending migrations applied cleanly, legacy rows intact). The `draft_generations`
migration does rebuild `Artifact` — the rehearsal confirms the 335 legacy artifacts survive it.

**Mandatory**: take the deployment backup (the wrapper does this automatically) and, for
byte-exact certainty, ask the operator to run the same preflight against the live file
(read-only) before approving the SHA:

```
sudo -u ubuntu python3 /opt/rockfoundry/repo/deployment/migration-preflight.py \
  --database /opt/rockfoundry/data/rockfoundry.db \
  --migrations /opt/rockfoundry/repo/packages/db/prisma/migrations
```

## 6. Linux build readiness

- `pnpm install --frozen-lockfile && pnpm db:generate && pnpm build` succeeds on Node 22
  (candidate image `deployment/Dockerfile.work-os`, pnpm pinned to 10.0.0).
- No native modules outside Prisma's own engines; the adapter uses `fetch` only.
- The candidate image is built by `rockfoundry-deploy` from `/opt/rockfoundry/repo`
  after `origin/main == approved SHA`. This branch must be merged to `main` by the owner
  first; the wrapper refuses otherwise.

## 7. Deployment wrapper readiness

Inspected `/usr/local/sbin/rockfoundry-deploy` (read-only). It already enforces:
SHA argument + root-owned `.approved-deploy-sha` marker + `origin/main == SHA`, then
backup (`sqlite3 .backup` + `tar` of `/opt/rockfoundry/data` + sha256), image pin rewrite,
`docker compose build web`, `up -d --no-deps web`, container + public health checks, and a
documented rollback (restore `compose.yaml.bak-<stamp>`, `up -d --no-deps web`).

Gap: **the wrapper does not run migrations**, and it only rebuilds/recreates `web`.
RF-002D therefore adds an explicit, non-automatic migration path instead of changing the
wrapper's behaviour or the base service:

- `deployment/compose.hermes-work-os.yml` — merge-only delta: keeps service key `web`,
  keeps the base `env_file: ../config/runtime.env`, adds the Hermes client env file and the
  non-secret RF-002D environment values, and adds a **profile-gated** `migrate` service that
  never starts on `up`.
- `deployment/migrate-entrypoint.sh` — guarded runner: verified pre-migration backup →
  readiness rehearsal → `prisma migrate status` → `prisma migrate deploy` → post-migration
  integrity check.
- `deployment/runtime.env.template` — the exact variable names; no values.

The root-owned SHA approval marker requirement is preserved and **not armed**.

## 8. Rollback

```
# application
sudo cp -a /opt/rockfoundry/ops/compose.yaml.bak-<stamp> /opt/rockfoundry/ops/compose.yaml
cd /opt/rockfoundry/ops && sudo docker compose -f compose.yaml up -d --no-deps web
# database (only if the migration itself is ever judged unsafe)
sudo systemctl stop <stack>   # or: docker compose stop web
sudo -u ubuntu cp -a /opt/rockfoundry/backups/deploy-<short>-<stamp>/rockfoundry.db /opt/rockfoundry/data/rockfoundry.db
```

Restoring the pre-deploy database also removes the Work OS tables (they are additive only,
so the previous image stays fully functional against it).

## 9. Remaining blockers

1. `origin/main` must equal the approved RF-002D SHA before the wrapper will build — owner merge/push decision.
2. Google OAuth client (client ID/secret) + `NEXTAUTH_SECRET` must be added to `/opt/rockfoundry/config/runtime.env` by the operator.
3. Compose delta (env files + profile-gated `migrate` service) must be merged into the fixed `/opt/rockfoundry/ops/compose.yaml`.
4. The real Google consent round-trip can only be exercised on `foundry.rockbase.web.id` after deployment.
5. Byte-exact production-DB preflight requires the operator command in §5 (the `hermes` account has no read access to `/opt/rockfoundry`).

## 10. GO / NO-GO

**GO** for an owner-approved deployment once §9 items 1–3 are done, in this order:

```
# 1. owner merges the feature branch into main (SHA must be the approved 40-char SHA)
# 2. owner provisions /opt/rockfoundry/config/runtime.env (values from §2)
# 3. operator merges the compose delta from deployment/compose.hermes-work-os.yml
# 4. operator rehearses the live DB (read-only, §5)
# 5. operator runs the migration against the approved candidate image:
docker compose --project-directory /opt/rockfoundry/ops -f /opt/rockfoundry/ops/compose.yaml \
  --profile migrate run --rm migrate
# 6. owner arms the gate, then deploys:
printf '%s\n' <40-char-sha> | sudo tee /opt/rockfoundry/ops/.approved-deploy-sha >/dev/null
sudo chmod 600 /opt/rockfoundry/ops/.approved-deploy-sha
sudo chown root:root /opt/rockfoundry/ops/.approved-deploy-sha
sudo /usr/local/sbin/rockfoundry-deploy <40-char-sha>
# 7. post-deploy smoke: anonymous /today → 307 /login; owner Google sign-in; /today and /api/work → 200
```

**NO-GO** if any of: the compose delta is not merged, the runtime env file lacks the OAuth
values, the live preflight fails, or the migration step is skipped.

Production integration cannot be declared PASS until a real Rock Foundry task completes
through the deployed backend and its result is accepted by the owner.
