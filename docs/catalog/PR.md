# Add rockfoundry to the plugin catalog

**Plugin:** [Rock Foundry](https://github.com/ranggaoscar/rockfoundry) (`hermes-plugin/` subdir), submitted by its owner.

Rock Foundry keeps a plain-language project card for every repo the user works on with Hermes:
where it started, what is live, what is hanging across many worktrees, what must not be touched
(from the repo's own `AGENTS.md`/`CLAUDE.md`/release notes), and a short history. Hermes Desktop
gets a **Projects** page (gallery + project page); chat gets `/project`; the agent gets a
`rockfoundry` skill that tells it to read the card before working in a project folder.

## Gallery (2.1.0)

- First scan starts right after the user picks folders, with a progress bar; **Rescan all** in the gallery.
- Search plus All/Active/Slow/Asleep/To decide filters with counts.

## Capabilities (match `plugin.yaml` at the pinned sha)

- Tool: `rockfoundry_refresh_projects` (starts a background refresh; summaries use `ctx.llm`)
- Hooks: `post_tool_call` (remembers which folders a session touched), `on_session_end` (rescans them)
- Slash command `/project`, skill `rockfoundry`, dashboard API routes, Desktop route `/projects`
- `requires_hermes: ">=0.23.3"`, no `requires_env`, no Python dependencies (engine is plain stdlib, bundled under `vendor/`)

## Disclosures

- Reads the project folders the user chooses (read-only); writes only to `~/.rockfoundry/`.
- Runs local `git` read-only commands; repos whose local git config could run programs are skipped.
- Runs the user's `gh` CLI for PR status unless `use_github = false`; never reads tokens or credential files.
- Network: GitHub via `gh`, and the user's current Hermes model via `ctx.llm`. No telemetry.
- Background threads after session end and on refresh. No cron is created; `/project schedule` prints a `hermes cron create` command for the user to run.
- Desktop half uses only `@hermes/plugin-sdk` and `react`; no self-updater; no binaries.

## Known issues

- After install or update, the gateway must restart (`hermes gateway restart`) for the Python half; a Desktop Rescan only reloads the page.
- `on_session_end` fires per turn, so the session line in a card's history is de-duplicated for 30 minutes.
- Sessions link to projects through file paths seen in tool calls; terminal-only work is not linked.

## Checks

- `hermes plugins validate` passes at the pinned sha (17/17, security scan: safe).
- Tested on Hermes v0.23.3 (Windows 11): gallery, project page, `/project`, session hooks, AI summary.
