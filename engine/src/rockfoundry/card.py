"""Render a project card (card.md) in plain Indonesian. Git terms only in the technical block."""

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

NOT_SUMMARIZED = "_Bagian ini belum diringkas. Jalankan refresh dengan AI untuk mengisinya._"


def _name(path: str) -> str:
    return PurePath(path.replace("\\", "/")).name


def _position(f: ProjectFacts, narrative: Narrative | None, today: date) -> list[str]:
    rows = []
    if f.release:
        rows.append(f"| ✅ **Terakhir tercatat live** | {fmt_date(f.release.date, True)} |")
    else:
        rows.append("| ❓ **Rilis** | Belum ada rilis tercatat |")
    if f.prs is None:
        rows.append("| ❓ **Perubahan dari GitHub** | Status PR belum ketahuan (GitHub CLI tidak tersedia) |")
    else:
        since = f.release.date if f.release else None
        merged = [
            p for p in f.prs if p.state == "MERGED" and p.merged_at and (since is None or p.merged_at > since)
        ]
        if merged:
            first, last = min(p.merged_at for p in merged), max(p.merged_at for p in merged)
            span = fmt_date(first) if first == last else f"{fmt_date(first)}–{fmt_date(last)}"
            label = "sejak rilis terakhir" if since else "sudah masuk versi utama"
            rows.append(f"| 🆕 **{len(merged)} PR {label}** | {span} |")
            if since:
                rows.append(f"| ❓ **Gak ketahuan** | Apakah {len(merged)} PR itu udah live? |")
    rows.append(f"| 🕒 **Terakhir dikerjain** | {ago(f.last_activity, today)} |")
    out = ["| | |", "|---|---|", *rows, ""]
    out.append(narrative.position if narrative else NOT_SUMMARIZED)
    return out


def _hanging(f: ProjectFacts) -> list[str]:
    hanging = [w for w in f.workdirs if w.status == "hanging"]
    if not hanging:
        return ["Gak ada kerjaan yang menggantung. 👍"]
    by_day: dict[date, list[str]] = defaultdict(list)
    for w in hanging:
        by_day[w.last_commit].append(_name(w.path))
    out = [
        "Udah dikerjain, tapi **belum masuk versi utama** dan gak ada catatan kalau udah live:",
        "",
        "| Kapan | Folder |",
        "|---|---|",
    ]
    for day in sorted(by_day, reverse=True):
        out.append(f"| {fmt_date(day)} | {', '.join(f'`{n}`' for n in sorted(by_day[day]))} |")
    return out


def _folders(f: ProjectFacts, s: FolderSummary) -> list[str]:
    places = ", ".join(f"{n} di `{loc}`" for loc, n in sorted(s.locations.items(), key=lambda x: -x[1]))
    out = [f"- **{s.total} folder kerja**: {places}." if s.total else "- Belum ada folder kerja."]
    out.append(f"- **{s.live} folder isinya udah live.** **{len(s.tidy)}** bersih dan **aman diberesin**.")
    if s.check_first:
        out.append(
            f"- **{len(s.check_first)} folder punya perubahan yang belum disimpan** — cek dulu: "
            + ", ".join(f"`{n}`" for n in s.check_first[:8])
            + "."
        )
    if s.abandoned:
        out.append(f"- **{len(s.abandoned)} folder ditinggal** (lama gak disentuh, belum masuk versi utama).")
    if f.main_behind:
        out.append(
            f"- Folder utama **ketinggalan {f.main_behind} perubahan** dari GitHub"
            + (f", dan punya {f.main_ahead} perubahan yang belum dikirim." if f.main_ahead else ".")
        )
    return out


def _history(f: ProjectFacts, history: list[HistoryEvent]) -> list[str]:
    rows: list[tuple[date, str]] = []
    if f.first_commit:
        rows.append((f.first_commit, "Proyek dimulai"))
    if f.release:
        rows.append((f.release.date, f"Rilis tercatat ({f.release.name})"))
    if f.prs:
        merged_by_day: dict[date, int] = defaultdict(int)
        for p in f.prs:
            if p.state == "MERGED" and p.merged_at:
                merged_by_day[p.merged_at] += 1
        for day, n in merged_by_day.items():
            rows.append((day, f"{n} PR masuk versi utama"))
    for e in history:
        if e.kind in ("session", "note"):  # releases and PRs already come from facts
            rows.append((e.at.date(), e.text))
    rows = sorted(rows, key=lambda r: r[0], reverse=True)[:12]
    if not rows:
        return ["Belum ada riwayat."]
    return ["| Kapan | Apa yang terjadi |", "|---|---|", *[f"| {fmt_date(d, True)} | {t} |" for d, t in rows]]


def _technical(f: ProjectFacts) -> list[str]:
    out = [
        "<details>",
        "<summary><b>Catatan teknis buat agent</b> (lu gak perlu baca bagian ini)</summary>",
        "",
        f"- Repo: `{f.remote or 'tanpa remote'}`, default branch `{f.default_branch or '-'}`",
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
        out.append(f"- Catatan: {note}")
    out += ["", "</details>", ""]
    return out


def render_card(
    f: ProjectFacts,
    badges: list[Badge],
    folders: FolderSummary,
    narrative: Narrative | None,
    history: list[HistoryEvent],
    today: date,
) -> str:
    lines = [
        f"# {f.name} — Kartu Proyek",
        "",
        f"> Disusun otomatis oleh Rock Foundry · {fmt_date(today, True)}",
        "> Dari folder kerja, catatan git, GitHub, dan dokumen proyek.",
        "> Kode gak dibuka, file rahasia gak dibaca.",
        "",
        "## Apa ini",
        "",
        narrative.what_is if narrative else NOT_SUMMARIZED,
        "",
        f"Mulai **{fmt_date(f.first_commit, True)}** · {f.commit_count} perubahan di versi utama"
        f" · {folders.total} folder kerja"
        if f.first_commit
        else "Belum ada commit.",
        "",
        "## Posisi sekarang",
        "",
        *_position(f, narrative, today),
        "",
        "## Lagi menggantung",
        "",
        *_hanging(f),
        "",
        "## Rapihin folder",
        "",
        *_folders(f, folders),
        "",
        "## Jangan disentuh",
        "",
        *([f"- {item}" for item in narrative.do_not_touch] if narrative else [NOT_SUMMARIZED]),
        "",
        "## Perlu lu putusin",
        "",
        *([f"{i}. {b.text}" for i, b in enumerate(badges, 1)] or ["Gak ada yang perlu diputusin sekarang."]),
        "",
        "## Peluang",
        "",
        "> Disusun dari catatan proyek aja. Belum ada riset kompetitor.",
        "",
        *([f"{i}. {o}" for i, o in enumerate(narrative.opportunities, 1)] if narrative else [NOT_SUMMARIZED]),
        "",
        "## Riwayat singkat",
        "",
        *_history(f, history),
        "",
        *_technical(f),
    ]
    return redact("\n".join(lines))
