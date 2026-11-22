from pathlib import Path

import pytest


@pytest.fixture
def rf_home(tmp_path, monkeypatch) -> Path:
    home = tmp_path / "rfhome"
    monkeypatch.setenv("ROCKFOUNDRY_HOME", str(home))
    return home
