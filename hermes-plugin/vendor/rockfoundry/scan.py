"""Scan configured roots, refresh every project's facts, history and card."""

from __future__ import annotations

import os
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

from rockfoundry.card import render_card
from rockfoundry.classify import classify_all, decision_badges, summarize_folders
from rockfoundry.config import Config
from rockfoundry.discover import discover_projects
from rockfoundry.facts import ProjectFacts, collect_facts
from rockfoundry.fmt import fmt_date
from rockfoundry.gh import GhClient
from rockfoundry.images import find_logo
from rockfoundry.narrative import NarrativeProvider, cached_narrative, get_narrative, narrative_error
from rockfoundry.safety import redact
from rockfoundry.store import HistoryEvent, ProjectStore


@dataclass
class ScanResult:
    slug: str
    name: str
    ok: bool
    error: str | None
    seconds: float


def _new_events(previous: ProjectFacts | None, current: ProjectFacts, now: datetime) -> list[HistoryEvent]:
    events: list[HistoryEvent] = []
    if previous is None:
        return events
    if current.release and (previous.release is None or previous.release.name != current.release.name):
        events.append(
            HistoryEvent(
                now,
                "release",
                f"New release recorded: {current.release.name} ({fmt_date(current.release.date)})",
            )
        )
    seen = {p.number for p in (previous.prs or []) if p.state == "MERGED"}
    fresh = [p for p in (current.prs or []) if p.state == "MERGED" and p.number not in seen]
    if previous.prs is not None and fresh:
        events.append(HistoryEvent(now, "pr_merged", f"{len(fresh)} new PRs merged into the main version"))
    return events


def github_client(cfg: Config) -> GhClient | None:
    """GitHub PR lookups are optional (config `use_github = false` turns them off)."""
    return GhClient() if cfg.use_github else None


def render_from_store(store: ProjectStore, slug: str, today: date) -> str | None:
    facts = store.read_facts(slug)
    if facts is None:
        return None
    card = render_card(
        facts,
        decision_badges(facts, today),
        summarize_folders(facts),
        cached_narrative(store.narrative_path(slug)),
        store.read_history(slug),
        today,
        narrative_error=narrative_error(store.narrative_path(slug)),
    )
    store.write_card(slug, card)
    return card


def scan(
    cfg: Config,
    store: ProjectStore,
    only: str | None = None,
    provider: NarrativeProvider | None = None,
    gh=None,
    fetch: bool = False,
    today: date | None = None,
    force_narrative: bool = False,
    on_progress: Callable[[int, int, str], None] | None = None,
) -> list[ScanResult]:
    """Refresh projects. ``on_progress(done, total, current_name)`` is called before each
    project and once more at the end with an empty name."""
    today = today or date.today()
    results: list[ScanResult] = []
    projects = [p for p in discover_projects(cfg) if not only or p.slug == only]
    for done, project in enumerate(projects):
        if on_progress:
            on_progress(done, len(projects), project.name)
        started = time.perf_counter()
        try:
            previous = store.read_facts(project.slug)
            raw = collect_facts(project, cfg, gh, fetch=fetch)
            narrative = (
                get_narrative(raw, provider, store.narrative_path(project.slug), force=force_narrative)
                if provider
                else None
            ) or cached_narrative(store.narrative_path(project.slug))
            facts = classify_all(raw, today, cfg.stale_days)
            for event in _new_events(previous, facts, datetime.now()):
                store.append_history(project.slug, event)
            store.write_facts(facts)
            find_logo(facts, project.main_path, store)
            store.write_card(
                project.slug,
                render_card(
                    facts,
                    decision_badges(facts, today),
                    summarize_folders(facts),
                    narrative,
                    store.read_history(project.slug),
                    today,
                    narrative_error=None
                    if narrative
                    else narrative_error(store.narrative_path(project.slug)),
                ),
            )
            results.append(ScanResult(project.slug, project.name, True, None, time.perf_counter() - started))
        except Exception as exc:  # one broken project never stops the others
            results.append(
                ScanResult(project.slug, project.name, False, redact(str(exc)), time.perf_counter() - started)
            )
    if on_progress:
        on_progress(len(projects), len(projects), "")
    return results


def _norm(path: Path) -> str:
    return os.path.normcase(str(path.resolve()))


def find_project_for_path(path: Path, store: ProjectStore) -> str | None:
    target = _norm(path)
    best: tuple[int, str] | None = None
    for slug in store.list_slugs():
        facts = store.read_facts(slug)
        for w in facts.workdirs if facts else []:
            base = _norm(Path(w.path))
            inside = target == base or target.startswith(base.rstrip("\\/") + os.sep)
            if inside and (best is None or len(base) > best[0]):
                best = (len(base), slug)
    return best[1] if best else None
