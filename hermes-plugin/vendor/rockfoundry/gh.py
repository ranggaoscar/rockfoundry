"""Optional, read-only GitHub lookups through the `gh` command line."""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from datetime import date


@dataclass
class PullRequest:
    number: int
    title: str
    branch: str
    state: str
    merged_at: date | None


def _run(args: list[str], timeout: float = 30) -> str | None:
    try:
        proc = subprocess.run(
            ["gh", *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    return proc.stdout if proc.returncode == 0 else None


class GhClient:
    def __init__(self) -> None:
        self._available: bool | None = None

    def available(self) -> bool:
        if self._available is None:
            self._available = _run(["auth", "status"]) is not None
        return self._available

    def pull_requests(self, repo: str, limit: int = 200) -> list[PullRequest]:
        out = _run(
            [
                "pr",
                "list",
                "--repo",
                repo,
                "--state",
                "all",
                "--limit",
                str(limit),
                "--json",
                "number,title,headRefName,state,mergedAt",
            ],
            timeout=60,
        )
        if out is None:
            raise RuntimeError("gh pr list failed")
        return [
            PullRequest(
                number=int(item["number"]),
                title=item.get("title", ""),
                branch=item.get("headRefName", ""),
                state=item.get("state", ""),
                merged_at=date.fromisoformat(item["mergedAt"][:10]) if item.get("mergedAt") else None,
            )
            for item in json.loads(out)
        ]

    def homepage(self, repo: str) -> str | None:
        out = _run(["repo", "view", repo, "--json", "homepageUrl"])
        if not out:
            return None
        return json.loads(out).get("homepageUrl") or None
