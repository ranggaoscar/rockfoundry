# Card format

Rock Foundry writes one folder per project under `~/.rockfoundry/projects/<slug>/`
(or `$ROCKFOUNDRY_HOME/projects/<slug>/`). Nothing is ever written inside a project folder.

| File | For | Notes |
|---|---|---|
| `card.md` | people (and agents) | Plain Indonesian. Git terms only inside the collapsed "Catatan teknis buat agent" block. |
| `facts.json` | machines | Everything collected without AI. `schema_version: 1`. |
| `narrative.json` | cache | Last AI-written sections plus the facts hash they were made from. |
| `history.jsonl` | timeline | Append-only events: `session`, `release`, `pr_merged`, `note`, `scan`. |
| `image.*` / `image-live.png` | gallery tile | Logo from the repo, or a screenshot of the live site. |

## Card sections (in order)

1. **Apa ini** — one sentence (AI), start date, number of changes, number of work folders.
2. **Posisi sekarang** — last recorded release, PRs merged since, what is unknown, last activity.
3. **Lagi menggantung** — work folders touched recently that are not in the main version.
4. **Rapihin folder** — where the work folders are, how many are live, which are safe to tidy.
5. **Jangan disentuh** — rules taken from the project's own guide docs (AI, guide docs only).
6. **Perlu lu putusin** — badges computed from facts (no AI).
7. **Peluang** — 3–5 ideas from facts and docs only, labelled "belum ada riset kompetitor".
8. **Riwayat singkat** — start, releases, merged PRs per day, Hermes sessions, notes.
9. **Catatan teknis buat agent** — remote, default branch, release marker, guide docs, every work folder.

Sections that need AI say "belum diringkas" when no narrative exists.

## `facts.json` (schema 1)

`slug`, `name`, `remote` (normalized, never with credentials), `default_branch`, `first_commit`,
`commit_count`, `last_activity`, `release {name, date, commit}`, `prs [{number, title, branch,
state, merged_at}]` or `null` when GitHub status is unknown, `workdirs [{path, branch, last_commit,
changed_files, in_release, in_default, status}]`, `main_behind`, `main_ahead`, `guide_docs {path:
text}`, `guide_docs_off_default [path]`, `homepage`, `notes [text]`.

Work folder `status`: `live` → `merged` → `hanging` (touched within `stale_days`) → `abandoned`.
