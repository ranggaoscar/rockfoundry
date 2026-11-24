"""Configuration: where Rock Foundry keeps its files and which folders it scans."""

from __future__ import annotations

import json
import os
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_RELEASE_TAGS = ["v*", "release-*", "prod-*"]
DEFAULT_DENY = [
    "*.env",
    ".env*",
    "*credential*",
    "*secret*",
    "*token*",
    "*.pem",
    "*.key",
    "id_*",
    "auth.json",
]


@dataclass
class ProjectOverride:
    name: str | None = None
    release_tags: list[str] | None = None
    homepage: str | None = None


@dataclass
class Config:
    roots: list[Path]
    scan_depth: int = 2
    stale_days: int = 30
    release_tags: list[str] = field(default_factory=lambda: list(DEFAULT_RELEASE_TAGS))
    deny: list[str] = field(default_factory=lambda: list(DEFAULT_DENY))
    projects: dict[str, ProjectOverride] = field(default_factory=dict)
    use_github: bool = True  # PR lookups through the user's own `gh` CLI


_home_resolver = None  # set by a host (the Hermes plugin points it at its plugin-data folder)


def set_home_resolver(resolver) -> None:
    """Let a host decide where Rock Foundry keeps its files (called on every lookup)."""
    global _home_resolver
    _home_resolver = resolver


def rockfoundry_home() -> Path:
    env = os.environ.get("ROCKFOUNDRY_HOME")
    if env:
        return Path(env)
    if _home_resolver is not None:
        return Path(_home_resolver())
    return Path.home() / ".rockfoundry"


def default_config_path() -> Path:
    return rockfoundry_home() / "config.toml"


def load_config(path: Path | None = None) -> Config | None:
    path = path or default_config_path()
    if not path.exists():
        return None
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    projects = {
        slug: ProjectOverride(
            name=raw.get("name"),
            release_tags=raw.get("release_tags"),
            homepage=raw.get("homepage"),
        )
        for slug, raw in data.get("projects", {}).items()
    }
    safety = data.get("safety", {})
    return Config(
        roots=[Path(r) for r in data.get("roots", [])],
        scan_depth=int(data.get("scan_depth", 2)),
        stale_days=int(data.get("stale_days", 30)),
        release_tags=list(data.get("release_tags", DEFAULT_RELEASE_TAGS)),
        deny=list(safety.get("deny", DEFAULT_DENY)),
        projects=projects,
        use_github=bool(data.get("use_github", True)),
    )


def _toml_list(values: list[str]) -> str:
    return "[" + ", ".join(json.dumps(v) for v in values) + "]"


def save_config(cfg: Config, path: Path | None = None) -> Config:
    """Write every setting, including per-project overrides, so nothing is lost on save."""
    path = path or default_config_path()
    lines = [
        f"roots = {_toml_list([r.as_posix() for r in cfg.roots])}",
        f"scan_depth = {cfg.scan_depth}",
        f"stale_days = {cfg.stale_days}",
        f"release_tags = {_toml_list(cfg.release_tags)}",
        f"use_github = {'true' if cfg.use_github else 'false'}",
        "",
        "[safety]",
        f"deny = {_toml_list(cfg.deny)}",
        "",
    ]
    for slug, o in sorted(cfg.projects.items()):
        lines.append(f"[projects.{json.dumps(slug)}]")
        if o.name is not None:
            lines.append(f"name = {json.dumps(o.name)}")
        if o.release_tags is not None:
            lines.append(f"release_tags = {_toml_list(o.release_tags)}")
        if o.homepage is not None:
            lines.append(f"homepage = {json.dumps(o.homepage)}")
        lines.append("")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")
    return cfg


def write_default_config(roots: list[Path], path: Path | None = None) -> Config:
    return save_config(Config(roots=list(roots)), path)


def set_roots(roots: list[Path], path: Path | None = None) -> Config:
    """Change only the scanned folders, keeping every other setting."""
    cfg = load_config(path)
    if cfg is None:
        return write_default_config(roots, path)
    cfg.roots = list(roots)
    return save_config(cfg, path)
