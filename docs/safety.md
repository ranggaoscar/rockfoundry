# Safety

Rock Foundry scans folders that may contain repositories you did not write (clones,
contributions). Everything below assumes a scanned repository may be hostile.

## Read-only git

Only these git commands run against a project: `rev-parse`, `remote get-url`, `worktree list`,
`symbolic-ref`, `for-each-ref`, `log`, `rev-list`, `merge-base --is-ancestor`, `tag --contains`,
`status --porcelain --untracked-files=no`, `ls-tree`, `show --no-textconv <ref>:<path>`,
`cat-file -s`, `config --list --show-scope -z`. `fetch` runs only with `--fetch`.

Every call adds `-c core.fsmonitor=false -c core.untrackedCache=false -c core.hooksPath=<null device>
-c maintenance.auto=false -c gc.auto=0 -c diff.external= -c protocol.ext.allow=never` and runs with
`GIT_TERMINAL_PROMPT=0` and `GIT_OPTIONAL_LOCKS=0` (no index writes).

## Repos whose config can run programs

Before `status` or `fetch`, Rock Foundry reads the repo's local and worktree config (reading runs
nothing). Keys such as `filter.*.clean|smudge|process`, `core.hooksPath`, `core.sshCommand`,
`credential.*`, `remote.*.uploadpack`, `diff.*.textconv` and `include.path` mark the repo as risky:
Rock Foundry runs no git command in that repo at all (the card says so). Only the exact canonical git-lfs filter commands
and `core.fsmonitor=true|false` are accepted; values containing control characters never are.

## Whole-drive scans

When a scanned root is a drive (C:/, D:/, /), discovery goes up to 6 folders deep and never enters
system and app folders (Windows, Program Files, ProgramData, AppData, Library, usr, …), hidden
folders (names starting with `.`, `$` or `~`), or dependency/build folders (node_modules,
site-packages, vendor, dist, build, target, cache). Discovery only looks for `.git`; it opens nothing.

## Files never opened

Default deny list (any path segment, case-insensitive): `*.env`, `.env*`, `*credential*`,
`*secret*`, `*token*`, `*.pem`, `*.key`, `id_*`, `auth.json`. Change it under `[safety]` in
`config.toml` in the data folder.

## Redaction

Cards, guide docs stored in `facts.json`, `narrative.json`, history notes and every plugin API
response mask: IPv4/IPv6 addresses, private key blocks, `sk-…`, `gh?_…`, `AKIA…`, JWTs, hex strings
of 32+ characters, and values after `*KEY=`, `*TOKEN=`, `*SECRET=`, `*PASSWORD=`.

## Models

Only guide docs (`AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/PRODUCTION*|DEPLOY*|RELEASE*`) and
facts reach a model, never source code. Both are HTML-escaped inside `<fakta>` / `<dokumen>` blocks
that the prompt declares as data. PR titles are not sent. The CLI provider runs
`claude -p --tools "" --strict-mcp-config` from an empty temporary folder.

## Where files are written

Only the data folder: `<HERMES_HOME>/plugin-data/rockfoundry/` inside Hermes (it follows the
active profile), `~/.rockfoundry/` for the standalone CLI, or `$ROCKFOUNDRY_HOME` when set.
Nothing inside scanned folders.

## Child processes

`git` and `gh` run with a minimal environment: PATH, home/temp/locale/config locations and
proxy settings only. Tokens and API keys in the Hermes environment (`GH_TOKEN`,
`GITHUB_TOKEN`, model keys) are never passed on, so `gh` uses its own login.
