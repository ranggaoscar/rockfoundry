"""Render a project card (card.md) in plain English. Git terms only in the technical block."""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from pathlib import PurePath

from rockfoundry.classify import Badge, FolderSummary
from rockfoundry.facts import ProjectFacts
from rockfoundry.fmt import ago, fmt_date
from rockfoundry.narrative import Narrative
from rockfoundry.safety import redact
from rockfoundry.store import HistoryEvent

NOT_SUMMARIZED = "_Not summarized yet. Run a refresh with AI to fill this in._"


def _name(path: str) -> str:
    return PurePath(path.replace("\\", "/")).name


def _position(f: ProjectFacts, narrative: Narrative | None, today: date, missing: str) -> list[str]:
    rows = []
    if f.release:
        rows.append(f"| ✅ **Last recorded release** | {fmt_date(f.release.date, True)} |")
    else:
        rows.append("| ❓ **Release** | No release recorded yet |")
    if f.prs is None:
        rows.append("| ❓ **Changes on GitHub** | PR status unknown (GitHub CLI not available) |")
    else:
        since = f.release.date if f.release else None
        merged = [
            p for p in f.prs if p.state == "MERGED" and p.merged_at and (since is None or p.merged_at > since)
        ]
        if merged:
            first, last = min(p.merged_at for p in merged), max(p.merged_at for p in merged)
            span = fmt_date(first) if first == last else f"{fmt_date(first)}–{fmt_date(last)}"
            label = "since the last release" if since else "merged into the main version"
            rows.append(f"| 🆕 **{len(merged)} PRs {label}** | {span} |")
            if since:
                rows.append(f"| ❓ **Unknown** | Are those {len(merged)} PRs live yet? |")
    rows.append(f"| 🕒 **Last worked on** | {ago(f.last_activity, today)} |")
    out = ["| | |", "|---|---|", *rows, ""]
    out.append(narrative.position if narrative else missing)
    return out


def _hanging(f: ProjectFacts) -> list[str]:
    hanging = [w for w in f.workdirs if w.status == "hanging"]
    if not hanging:
        return ["Nothing is hanging. 👍"]
    by_day: dict[date, list[str]] = defaultdict(list)
    for w in hanging:
        by_day[w.last_commit].append(_name(w.path))
    out = [
        "Built recently, but **not in the main version yet** and no record that it went live:",
        "",
        "| When | Folders |",
        "|---|---|",
    ]
    for day in sorted(by_day, reverse=True):
        out.append(f"| {fmt_date(day)} | {', '.join(f'`{n}`' for n in sorted(by_day[day]))} |")
    return out


def _folders(f: ProjectFacts, s: FolderSummary) -> list[str]:
    places = ", ".join(f"{n} in `{loc}`" for loc, n in sorted(s.locations.items(), key=lambda x: -x[1]))
    out = [f"- **{s.total} work folders**: {places}." if s.total else "- No work folders yet."]
    out.append(
        f"- **{s.live}** of them are fully live. **{len(s.tidy)}** are live or merged and clean, "
        "so they are **safe to tidy**."
    )
    if s.check_first:
        out.append(
            f"- **{len(s.check_first)} folders have unsaved changes** — check first: "
            + ", ".join(f"`{n}`" for n in s.check_first[:8])
            + "."
        )
    if s.abandoned:
        out.append(f"- **{len(s.abandoned)} folders look abandoned** (untouched for a while, never merged).")
    if f.main_behind:
        out.append(
            f"- The main folder is **{f.main_behind} changes behind** GitHub"
            + (f" and has {f.main_ahead} changes not pushed yet." if f.main_ahead else ".")
        )
    return out


def _history(f: ProjectFacts, history: list[HistoryEvent]) -> list[str]:
    rows: list[tuple[date, str]] = []
    if f.first_commit:
        rows.append((f.first_commit, "Project started"))
    if f.release:
        rows.append((f.release.date, f"Release recorded ({f.release.name})"))
    if f.prs:
        merged_by_day: dict[date, int] = defaultdict(int)
        for p in f.prs:
            if p.state == "MERGED" and p.merged_at:
                merged_by_day[p.merged_at] += 1
        for day, n in merged_by_day.items():
            rows.append((day, f"{n} PR{'s' if n > 1 else ''} merged into the main version"))
    for e in history:
        if e.kind in ("session", "note"):  # releases and PRs already come from facts
            rows.append((e.at.date(), e.text))
    rows = sorted(rows, key=lambda r: r[0], reverse=True)[:12]
    if not rows:
        return ["No history yet."]
    return ["| When | What happened |", "|---|---|", *[f"| {fmt_date(d, True)} | {t} |" for d, t in rows]]


def _technical(f: ProjectFacts) -> list[str]:
    out = [
        "<details>",
        "<summary><b>Technical notes for agents</b> (you can skip this)</summary>",
        "",
        f"- Repo: `{f.remote or 'no remote'}`, default branch `{f.default_branch or '-'}`",
        f"- Release marker: `{f.release.name}` → `{f.release.commit[:8]}`"
        if f.release
        else "- Release marker: -",
        f"- Guide docs on default branch: {', '.join(f'`{p}`' for p in f.guide_docs) or '-'}",
    ]
    if f.guide_docs_off_default:
        out.append("- Docs only on other branches: " + ", ".join(f"`{p}`" for p in f.guide_docs_off_default))
    if f.homepage:
        out.append(f"- Homepage: {f.homepage}")
    out.append("- Worktrees:")
    for w in sorted(f.workdirs, key=lambda w: w.last_commit or date.min, reverse=True)[:120]:
        out.append(f"  - `{w.path}` · `{w.branch}` · {w.status or '-'} · {w.changed_files} changed")
    for note in f.notes:
        out.append(f"- Note: {note}")
    out += ["", "</details>", ""]
    return out


def render_card(
    f: ProjectFacts,
    badges: list[Badge],
    folders: FolderSummary,
    narrative: Narrative | None,
    history: list[HistoryEvent],
    today: date,
    narrative_error: str | None = None,
) -> str:
    missing = (
        f"_AI summary failed: {narrative_error}. Try Summarize with AI again._"
        if narrative_error
        else NOT_SUMMARIZED
    )
    lines = [
        f"# {f.name} — Project card",
        "",
        f"> Written by Rock Foundry on {fmt_date(today, True)},",
        "> from work folders, git history, GitHub and the project's own docs.",
        "> No source code opened, no secret files read.",
        "",
        "## What this is",
        "",
        narrative.what_is if narrative else missing,
        "",
        f"Started **{fmt_date(f.first_commit, True)}** · {f.commit_count} changes in the main version"
        f" · {folders.total} work folders"
        if f.first_commit
        else "No commits yet.",
        "",
        "## Where it stands",
        "",
        *_position(f, narrative, today, missing),
        "",
        "## Hanging work",
        "",
        *_hanging(f),
        "",
        "## Folder cleanup",
        "",
        *_folders(f, folders),
        "",
        "## Do not touch",
        "",
        *([f"- {item}" for item in narrative.do_not_touch] if narrative else [missing]),
        "",
        "## Decisions for you",
        "",
        *([f"{i}. {b.text}" for i, b in enumerate(badges, 1)] or ["Nothing to decide right now."]),
        "",
        "## Opportunities",
        "",
        "> Based on the project's own records only. No competitor research yet.",
        "",
        *([f"{i}. {o}" for i, o in enumerate(narrative.opportunities, 1)] if narrative else [missing]),
        "",
        "## History",
        "",
        *_history(f, history),
        "",
        *_technical(f),
    ]
    return redact("\n".join(lines))
