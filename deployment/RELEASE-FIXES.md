# Corrected candidate: VPS operator preflight only

Supersedes RF-002D's Linux PASS and migrate-profile instructions. No production access, publication or deployment occurred during these fixes.

## Dependencies

Next and eslint-config-next are pinned to 16.3.8. Next brings patched PostCSS and Sharp. Version-specific pnpm overrides address the reported advisory paths (including undici, Prisma CLI transitive packages and CLI tooling). Prisma stays 7.9.0; React and NextAuth are unchanged. shadcn is a development CLI, not a runtime import, and is now devDependencies. The committed pnpm version is 10.0.0; its override policy lives in root package.json. Do not use global pnpm 11 to rewrite this lockfile.

Production dependency audit: zero advisories. Full graph retains one high advisory in dev-only braces 3.0.3 (GHSA-vfj7-8cjw-p6xm, no patched version published), via ESLint/shadcn globbing. Its input is repository-controlled glob patterns, not request data. Do not accept untrusted nested glob patterns into build/CLI jobs. Other dev low/moderate findings remain tracked; no forced broad upgrades.

## Linux runtime

Dockerfile pins the Node 22 Bookworm base by digest, installs Python, sqlite3 and OpenSSL/CA libraries, then runs a frozen pnpm install, Prisma generation and Next production build. Linux entrypoint CRLF is normalized during build. No credentials or production data enter the image.

## Compose and immutable execution

Merge the web-only delta into the fixed base Compose, preserving the one existing literal `image: rockfoundry-web:<tag>` line, container name, data mount and private network. There is no second service/image interpolation. Existing wrapper parsing remains compatible, but the existing installed wrapper still lacks a migration step.

`rockfoundry-deploy-candidate.sh` is an UNINSTALLED operator-reviewed replacement candidate. Do not combine it with the old wrapper (which would build/recreate a second time). It preserves the explicit full-SHA argument, root-owned approval marker and exact origin/main gate, checks clean tree before pulling, fast-forwards only, builds a full-SHA-tagged image with a revision label, resolves the immutable image ID, then runs migration from that ID. Tag ID is rechecked before recreation and the actual web container ID is verified afterwards. Root approval is never created by the script.

This candidate must be reviewed/installed by the operator before use, including protected runtime config, existing web volume/network scope and maintenance window. It stops only web AFTER approval/source/build checks to quiesce application DB writes. Only then can it compare every legacy row exactly across backup and migrated data. Do not run migration against a live writer.

## Backups, rollback and fail-closed checks

Data path: /opt/rockfoundry/data/rockfoundry.db. Backup mount: /opt/rockfoundry/backups.
Migration requires both writable bind mounts and a syntactically valid immutable image ID. Missing mounts/identity fail before writes. Backup uses Python's SQLite backup API (committed WAL included), full integrity and FK validation, SHA-256 manifest and a restore rehearsal. No raw `cp` fallback. Full legacy-column values/rows are compared post-migration (new additive columns permitted). `prisma migrate deploy` precedes `migrate status`, so expected pending migrations do not abort the runner prematurely.

Persistent recovery directory: /opt/rockfoundry/backups/release-<timestamp>-<pid>/, containing original compose.yaml and database/rockfoundry.db plus checksum. Failure after writer quiescence restores the verified SQLite backup with sqlite3 `.restore` while web is stopped, restores original Compose and restarts only web. A failed recovery leaves an explicit MANUAL RECOVERY REQUIRED message. The operator must inspect migration history/integrity and backup permissions before arming a release.

## Verified candidate evidence

Actual Linux amd64 Docker build completed with exit 0, including frozen install, Prisma generation and Next 16.3.8 production compilation. Candidate image evidence is retained in the local build/QA logs under Hermes scratch (pre-commit tag release-fixes-candidate; the operator builds the published release with its revision label).

The real container migration entrypoint applied all four pending migrations to an ISOLATED COPY of the local legacy snapshot: 144 projects, 335 artifacts, 847 messages, 656 state revisions; all 15 legacy tables' original column values/rows preserved, integrity ok, FK violations zero, all seven migrations finished. Backup remained on the host after container exit and restored successfully. Second migration was idempotent; missing mount failed closed. This is NOT evidence about the current production database.

Linux HTTP smoke: 13/13 requests passed (public root/login, anonymous private-page redirects, anonymous API 401, nonowner/expired session 403, owner pages/API 200 with 144 projects). Google callback URL matches the production URL; no real Google round-trip attempted. Linux owner/Hermes/origin contract tests: 13/13 pass, client-secret symbol hits zero. Local focused Work OS/auth/Hermes/origin tests: 18/18 pass; reference/export tests: 6/6 pass; typecheck and lint pass (warnings only). Offline deployment checks: 3/3 pass, including committed WAL backup/restore. Compose parser and both POSIX shell syntax checks pass. Full RF-001 suite was not rerun.

## Remaining operator gates

Current-production SQLite backup/history and exact migration rehearsal; approved real Google OAuth client plus protected session secret provisioning; merged web delta; approved wrapper installation/review; immutable published source SHA; maintenance/rollback approval. None were bypassed. Release preparation alone is NOT production deployment approval.
