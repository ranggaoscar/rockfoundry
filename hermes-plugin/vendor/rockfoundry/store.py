"""Where cards live: ~/.rockfoundry/projects/<slug>/ (never inside a project folder)."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from rockfoundry.facts import ProjectFacts, facts_from_dict, facts_to_dict


@dataclass
class HistoryEvent:
    at: datetime
    kind: str  # session | release | pr_merged | note | scan
    text: str


def _atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


class ProjectStore:
    def __init__(self, home: Path) -> None:
        self.home = home

    def project_dir(self, slug: str) -> Path:
        return self.home / "projects" / slug

    def write_facts(self, f: ProjectFacts) -> None:
        _atomic_write(
            self.project_dir(f.slug) / "facts.json",
            json.dumps(facts_to_dict(f), ensure_ascii=False, indent=2),
        )

    def read_facts(self, slug: str) -> ProjectFacts | None:
        path = self.project_dir(slug) / "facts.json"
        try:
            return facts_from_dict(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, ValueError, KeyError, TypeError):
            return None

    def write_card(self, slug: str, text: str) -> None:
        _atomic_write(self.project_dir(slug) / "card.md", text)

    def read_card(self, slug: str) -> str | None:
        try:
            return (self.project_dir(slug) / "card.md").read_text(encoding="utf-8")
        except OSError:
            return None

    def narrative_path(self, slug: str) -> Path:
        return self.project_dir(slug) / "narrative.json"

    def append_history(self, slug: str, e: HistoryEvent) -> None:
        path = self.project_dir(slug) / "history.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps({"at": e.at.isoformat(), "kind": e.kind, "text": e.text}, ensure_ascii=False)
        with path.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")

    def read_history(self, slug: str, limit: int = 50) -> list[HistoryEvent]:
        path = self.project_dir(slug) / "history.jsonl"
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except OSError:
            return []
        events = []
        for line in lines[-limit:]:
            try:
                d = json.loads(line)
                events.append(HistoryEvent(datetime.fromisoformat(d["at"]), d["kind"], d["text"]))
            except (ValueError, KeyError):
                continue
        return events

    def list_slugs(self) -> list[str]:
        root = self.home / "projects"
        if not root.is_dir():
            return []
        return sorted(p.name for p in root.iterdir() if (p / "facts.json").exists())
