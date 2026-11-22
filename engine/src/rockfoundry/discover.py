"""Find git projects under the configured roots and group their work folders."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path

from rockfoundry.config import Config
from rockfoundry.gitutil import try_git

SKIP_DIRS = {"node_modules", ".git", ".venv", "__pycache__"}


@dataclass
class Workdir:
    path: Path
    branch: str | None
    detached: bool


@dataclass
class Project:
    slug: str
    name: str
    remote: str | None
    main_path: Path
    workdirs: list[Workdir]
    notes: list[str] = field(default_factory=list)
    owner: str | None = None


def normalize_remote(url: str | None) -> str | None:
    if not url:
        return None
    u = url.strip()
    m = re.match(r"^[\w.-]+@([\w.-]+):(.+)$", u)  # scp-like: git@host:owner/repo
    if m:
        host, rest = m.group(1), m.group(2)
    else:
        u = re.sub(r"^[a-z+]+://", "", u, flags=re.IGNORECASE)
        u = u.split("@", 1)[1] if "@" in u.split("/", 1)[0] else u
        host, _, rest = u.partition("/")
    rest = re.sub(r"\.git/?$", "", rest.strip("/"))
    return f"{host}/{rest}".lower() if rest else host.lower()


def _raw_repo_name(url: str | None) -> str | None:
    if not url:
        return None
    parts = [s for s in re.split(r"[/:\\]", url.strip()) if s]
    return re.sub(r"\.git$", "", parts[-1]) or None if parts else None


def _raw_owner(url: str | None) -> str | None:
    """Owner segment of a hosted remote, keeping its original case (never credentials)."""
    if not url or not normalize_remote(url) or normalize_remote(url).count("/") < 2:
        return None
    parts = [s for s in re.split(r"[/:\\]", url.strip()) if s]
    return parts[-2] if len(parts) >= 2 and "@" not in parts[-2] else None


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "proyek"


def _key(path: Path) -> str:
    return os.path.normcase(str(path.resolve()))


def _candidates(cfg: Config) -> list[Path]:
    found: list[Path] = []

    def walk(folder: Path, depth: int) -> None:
        try:
            children = sorted(p for p in folder.iterdir() if p.is_dir())
        except OSError:
            return
        for child in children:
            if child.name in SKIP_DIRS:
                continue
            if (child / ".git").exists():
                found.append(child)
            elif depth < cfg.scan_depth:
                walk(child, depth + 1)

    for root in cfg.roots:
        if root.is_dir():
            walk(root, 1)
    return found


def _worktrees(repo: Path, notes: list[str]) -> list[Workdir]:
    out = try_git(["worktree", "list", "--porcelain"], repo) or ""
    result: list[Workdir] = []
    for block in out.split("\n\n"):
        lines = block.strip().splitlines()
        if not lines or not lines[0].startswith("worktree "):
            continue
        path = Path(lines[0][len("worktree ") :])
        branch = None
        detached = False
        for line in lines[1:]:
            if line.startswith("branch "):
                branch = line[len("branch ") :].removeprefix("refs/heads/")
            elif line == "detached":
                detached = True
            elif line == "bare":
                path = None  # type: ignore[assignment]
        if path is None:
            continue
        if not path.exists():
            notes.append(f"Folder kerja hilang: {path.name}")
            continue
        result.append(Workdir(path=path, branch=branch, detached=detached))
    return result


def discover_projects(cfg: Config) -> list[Project]:
    groups: dict[str, dict] = {}
    for folder in _candidates(cfg):
        common = try_git(["rev-parse", "--path-format=absolute", "--git-common-dir"], folder)
        if common is None:
            continue
        raw_remote = try_git(["remote", "get-url", "origin"], folder)
        remote = normalize_remote(raw_remote)
        key = remote or _key(Path(common))
        g = groups.setdefault(key, {"remote": remote, "raw": raw_remote, "commons": {}, "folders": []})
        g["commons"].setdefault(_key(Path(common)), Path(common))
        g["folders"].append(folder)

    projects: list[Project] = []
    used: set[str] = set()
    for g in groups.values():
        notes: list[str] = []
        clones = [f for f in g["folders"] if (f / ".git").is_dir()]
        repo_name = _raw_repo_name(g["raw"])
        main_path = _pick_main(clones or g["folders"], repo_name)
        workdirs: dict[str, Workdir] = {}
        for common in g["commons"].values():
            base = common.parent if common.name == ".git" else main_path
            for w in _worktrees(base, notes):
                workdirs.setdefault(_key(w.path), w)
        name = repo_name or main_path.name
        slug = _slugify(name)
        for override_slug, override in cfg.projects.items():
            if override_slug == slug and override.name:
                name = override.name
        unique, n = slug, 2
        while unique in used:
            unique, n = f"{slug}-{n}", n + 1
        used.add(unique)
        projects.append(
            Project(
                slug=unique,
                name=name,
                remote=g["remote"],
                main_path=main_path,
                workdirs=sorted(workdirs.values(), key=lambda w: str(w.path).lower()),
                notes=notes,
                owner=_raw_owner(g["raw"]),
            )
        )
    _tell_apart(projects, {s for s, o in cfg.projects.items() if o.name})
    return sorted(projects, key=lambda p: p.slug)


def _tell_apart(projects: list[Project], named_by_owner: set[str]) -> None:
    """Give same-named projects a suffix: the remote owner, or else the parent folder."""
    counts: dict[str, int] = {}
    for p in projects:
        counts[p.name.lower()] = counts.get(p.name.lower(), 0) + 1
    for p in projects:
        if counts[p.name.lower()] < 2 or p.slug in named_by_owner:
            continue
        p.name = f"{p.name} ({p.owner or p.main_path.parent.name})"


def _pick_main(folders: list[Path], repo_name: str | None) -> Path:
    if repo_name:
        for f in folders:
            if f.name.lower() == repo_name.lower():
                return f
    return sorted(folders, key=lambda f: (len(f.name), str(f).lower()))[0]
