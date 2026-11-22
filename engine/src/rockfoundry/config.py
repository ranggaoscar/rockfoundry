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


def rockfoundry_home() -> Path:
    env = os.environ.get("ROCKFOUNDRY_HOME")
    return Path(env) if env else Path.home() / ".rockfoundry"


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
    )


def _toml_list(values: list[str]) -> str:
    return "[" + ", ".join(json.dumps(v) for v in values) + "]"


def write_default_config(roots: list[Path], path: Path | None = None) -> Config:
    path = path or default_config_path()
    cfg = Config(roots=list(roots))
    lines = [
        f"roots = {_toml_list([r.as_posix() for r in cfg.roots])}",
        f"scan_depth = {cfg.scan_depth}",
        f"stale_days = {cfg.stale_days}",
        f"release_tags = {_toml_list(cfg.release_tags)}",
        "",
        "[safety]",
        f"deny = {_toml_list(cfg.deny)}",
        "",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")
    return cfg
