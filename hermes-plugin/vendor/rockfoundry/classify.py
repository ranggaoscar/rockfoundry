"""Turn raw facts into statuses, folder summaries and "perlu diputusin" badges."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import date
from pathlib import PurePath

from rockfoundry.facts import ProjectFacts, WorkdirFacts
from rockfoundry.fmt import fmt_date

MAIN_BEHIND_LIMIT = 50


@dataclass
class Badge:
    kind: str
    text: str


@dataclass
class FolderSummary:
    total: int
    live: int
    tidy: list[str] = field(default_factory=list)
    check_first: list[str] = field(default_factory=list)
    hanging: list[str] = field(default_factory=list)
    abandoned: list[str] = field(default_factory=list)
    locations: dict[str, int] = field(default_factory=dict)


def merged_branches(f: ProjectFacts) -> set[str]:
    return {p.branch for p in (f.prs or []) if p.state == "MERGED"}


def classify_workdir(w: WorkdirFacts, merged: set[str], today: date, stale_days: int) -> str:
    if w.in_release:
        return "live"
    if w.in_default or w.branch in merged:
        return "merged"
    if w.last_commit and (today - w.last_commit).days <= stale_days:
        return "hanging"
    return "abandoned"


def classify_all(f: ProjectFacts, today: date, stale_days: int) -> ProjectFacts:
    merged = merged_branches(f)
    return replace(
        f,
        workdirs=[replace(w, status=classify_workdir(w, merged, today, stale_days)) for w in f.workdirs],
    )


def activity_bucket(last: date | None, today: date) -> str:
    if last is None:
        return "sleeping"
    days = (today - last).days
    if days <= 7:
        return "active"
    if days <= 60:
        return "slow"
    return "sleeping"


def _parent(path: str) -> str:
    return PurePath(path.replace("\\", "/")).parent.as_posix()


def summarize_folders(f: ProjectFacts) -> FolderSummary:
    s = FolderSummary(total=len(f.workdirs), live=0)
    for w in f.workdirs:
        name = PurePath(w.path.replace("\\", "/")).name
        s.locations[_parent(w.path)] = s.locations.get(_parent(w.path), 0) + 1
        if w.status == "live":
            s.live += 1
        if w.status in ("live", "merged"):
            (s.check_first if w.changed_files else s.tidy).append(name)
        elif w.status == "hanging":
            s.hanging.append(name)
        elif w.status == "abandoned":
            s.abandoned.append(name)
    return s


def decision_badges(f: ProjectFacts, today: date) -> list[Badge]:
    badges: list[Badge] = []
    if f.release and f.prs:
        after = [p for p in f.prs if p.state == "MERGED" and p.merged_at and p.merged_at > f.release.date]
        if after:
            badges.append(
                Badge(
                    "merged_after_release",
                    f"{len(after)} new PRs since the {fmt_date(f.release.date)} release — are they live?",
                )
            )
    classified = f if any(w.status for w in f.workdirs) else classify_all(f, today, 30)
    hanging = [w for w in classified.workdirs if w.status == "hanging"]
    if hanging:
        badges.append(Badge("hanging_work", f"{len(hanging)} pieces of hanging work"))
    if f.main_behind > MAIN_BEHIND_LIMIT:
        badges.append(Badge("main_folder_behind", f"Main folder is {f.main_behind} changes behind"))
    if f.guide_docs_off_default:
        badges.append(Badge("docs_off_default", "Release notes only exist on a side branch"))
    return badges
