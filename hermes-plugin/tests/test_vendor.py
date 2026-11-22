from pathlib import Path

from conftest import PLUGIN

SOURCE = PLUGIN.parent / "engine" / "src" / "rockfoundry"
VENDOR = PLUGIN / "vendor" / "rockfoundry"


def _files(root: Path) -> dict[str, str]:
    return {
        p.relative_to(root).as_posix(): p.read_text(encoding="utf-8").replace("\r\n", "\n")
        for p in root.rglob("*.py")
        if "__pycache__" not in p.parts
    }


def test_vendored_engine_matches_source():
    assert _files(VENDOR) == _files(SOURCE), "Run: python scripts/sync_engine.py"
