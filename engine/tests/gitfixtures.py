"""Helpers that build throwaway git repositories for tests."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

_counter = 0


def run(args: list[str], cwd: Path, date: str | None = None) -> str:
    env = dict(os.environ)
    env.update(
        GIT_AUTHOR_NAME="Test",
        GIT_AUTHOR_EMAIL="test@example.com",
        GIT_COMMITTER_NAME="Test",
        GIT_COMMITTER_EMAIL="test@example.com",
        GIT_TERMINAL_PROMPT="0",
    )
    if date:
        env["GIT_AUTHOR_DATE"] = env["GIT_COMMITTER_DATE"] = f"{date}T12:00:00+00:00"
    return subprocess.run(
        ["git", *args], cwd=cwd, env=env, check=True, capture_output=True, text=True
    ).stdout.strip()


def commit(repo: Path, message: str, date: str | None = None) -> str:
    global _counter
    _counter += 1
    (repo / f"file{_counter}.txt").write_text(message, encoding="utf-8")
    run(["add", "-A"], repo)
    run(["commit", "-q", "-m", message], repo, date=date)
    return run(["rev-parse", "HEAD"], repo)


def make_repo(path: Path, remote: str | None = None, commits: int = 1, date: str | None = None) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    run(["init", "-q", "-b", "main"], path)
    run(["config", "core.autocrlf", "false"], path)
    for i in range(commits):
        commit(path, f"commit {i + 1}", date=date)
    if remote:
        run(["remote", "add", "origin", remote], path)
    return path


def add_worktree(repo: Path, path: Path, branch: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    run(["worktree", "add", "-q", "-b", branch, str(path)], repo)
    return path


def write_commit(repo: Path, files: dict[str, str], message: str, date: str | None = None) -> str:
    for rel, text in files.items():
        target = repo / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
    run(["add", "-A"], repo)
    run(["commit", "-q", "-m", message], repo, date=date)
    return run(["rev-parse", "HEAD"], repo)


def publish(repo: Path, bare: Path) -> None:
    """Give `repo` a real origin (a bare repo) so origin/main and origin/HEAD exist."""
    run(["clone", "-q", "--bare", str(repo), str(bare)], repo.parent)
    run(["remote", "remove", "origin"], repo) if run(["remote"], repo) else None
    run(["remote", "add", "origin", str(bare)], repo)
    run(["fetch", "-q", "origin"], repo)
    run(["remote", "set-head", "origin", "main"], repo)
