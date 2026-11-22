# Card format

Rock Foundry writes one folder per project under `~/.rockfoundry/projects/<slug>/`
(or `$ROCKFOUNDRY_HOME/projects/<slug>/`). Nothing is ever written inside a project folder.

| File | For | Notes |
|---|---|---|
| `card.md` | people (and agents) | Plain English. Git terms only inside the collapsed "Technical notes for agents" block. |
| `facts.json` | machines | Everything collected without AI. `schema_version: 1`. |
| `narrative.json` | cache | Last AI-written sections plus the facts hash they were made from. |
| `history.jsonl` | timeline | Append-only events: `session`, `release`, `pr_merged`, `note`, `scan`. |
| `image.*` / `image-live.png` | gallery tile | Logo from the repo, or a screenshot of the live site. |

## Card sections (in order)

1. **What this is** — one sentence (AI), start date, number of changes, number of work folders.
2. **Where it stands** — last recorded release, PRs merged since, what is unknown, last activity.
3. **Hanging work** — work folders touched recently that are not in the main version.
4. **Folder cleanup** — where the work folders are, how many are live, which are safe to tidy.
5. **Do not touch** — rules taken from the project's own guide docs (AI, guide docs only).
6. **Decisions for you** — badges computed from facts (no AI).
7. **Opportunities** — 3–5 ideas from facts and docs only, labelled "no competitor research yet".
8. **History** — start, releases, merged PRs per day, Hermes sessions, notes.
9. **Technical notes for agents** — remote, default branch, release marker, guide docs, every work folder.

Sections that need AI say "Not summarized yet" when no narrative exists.

## `facts.json` (schema 1)

`slug`, `name`, `remote` (normalized, never with credentials), `default_branch`, `first_commit`,
`commit_count`, `last_activity`, `release {name, date, commit}`, `prs [{number, title, branch,
state, merged_at}]` or `null` when GitHub status is unknown, `workdirs [{path, branch, last_commit,
changed_files, in_release, in_default, status}]`, `main_behind`, `main_ahead`, `guide_docs {path:
text}`, `guide_docs_off_default [path]`, `homepage`, `notes [text]`.

Work folder `status`: `live` → `merged` → `hanging` (touched within `stale_days`) → `abandoned`.
