"""Where the plugin keeps its data: the Hermes plugin-data folder, which follows the profile."""

from __future__ import annotations

import shutil
from pathlib import Path

from rockfoundry.config import set_home_resolver

LEGACY_HOME = Path.home() / ".rockfoundry"


def migrate_legacy(new: Path, legacy: Path = LEGACY_HOME) -> bool:
    """Copy data from the pre-2.3 location once. The old folder is left untouched."""
    if (new / "config.toml").exists() or not (legacy / "config.toml").exists():
        return False
    shutil.copytree(legacy, new, dirs_exist_ok=True)
    return True


def install(resolver, legacy: Path = LEGACY_HOME) -> None:
    """Point the engine at ``resolver()`` (looked up on every call, so profiles stay separate)."""

    def home() -> Path:
        path = Path(resolver())
        path.mkdir(parents=True, exist_ok=True)
        migrate_legacy(path, legacy)
        return path

    set_home_resolver(home)


def install_default() -> bool:
    """Use Hermes's plugin_data_dir("rockfoundry") when running inside Hermes."""
    try:
        from plugins.plugin_storage import plugin_data_dir
    except ImportError:
        return False
    install(lambda: plugin_data_dir("rockfoundry"))
    return True
