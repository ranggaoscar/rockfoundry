import importlib.util
import sys
from pathlib import Path

import pytest

PLUGIN = Path(__file__).resolve().parents[1]
ENGINE_TESTS = PLUGIN.parent / "engine" / "tests"
sys.path.insert(0, str(ENGINE_TESTS))
sys.path.insert(0, str(PLUGIN))


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def rf_home(tmp_path, monkeypatch):
    home = tmp_path / "rfhome"
    monkeypatch.setenv("ROCKFOUNDRY_HOME", str(home))
    return home


@pytest.fixture
def scanned(tmp_path, rf_home):
    from gitfixtures import make_repo
    from rockfoundry.config import write_default_config
    from rockfoundry.scan import scan
    from rockfoundry.store import ProjectStore

    root = tmp_path / "r"
    make_repo(
        root / "HUB",
        remote="https://github.com/o/hub.git",
        commits=2,
        date="2026-11-20",
    )
    make_repo(root / "SITE", remote="https://github.com/o/site.git", date="2026-09-01")
    cfg = write_default_config([root])
    scan(cfg, ProjectStore(rf_home))
    return root
