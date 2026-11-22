from pathlib import Path

from rockfoundry.config import (
    default_config_path,
    load_config,
    rockfoundry_home,
    write_default_config,
)


def test_home_respects_env(rf_home):
    assert rockfoundry_home() == rf_home


def test_load_missing_returns_none(rf_home):
    assert load_config() is None


def test_write_then_load_roundtrip(rf_home, tmp_path):
    cfg = write_default_config([tmp_path / "A", Path("D:/HERMES DESIGN AGENT/working")])
    loaded = load_config()
    assert loaded.roots == cfg.roots
    assert loaded.scan_depth == 2 and loaded.stale_days == 30
    assert "*credential*" in loaded.deny and "prod-*" in loaded.release_tags


def test_project_override_parsed(rf_home):
    default_config_path().parent.mkdir(parents=True, exist_ok=True)
    default_config_path().write_text(
        'roots = ["C:/AI PROJECTS"]\n[projects.bresciahub]\nname = "BresciaHub"\n'
        'release_tags = ["prod-*"]\nhomepage = "https://bresciahub.id"\n',
        encoding="utf-8",
    )
    cfg = load_config()
    assert cfg.projects["bresciahub"].release_tags == ["prod-*"]
    assert cfg.projects["bresciahub"].homepage == "https://bresciahub.id"
    assert cfg.projects["bresciahub"].name == "BresciaHub"


def test_github_lookups_can_be_turned_off(rf_home):
    from rockfoundry.scan import github_client

    default_config_path().parent.mkdir(parents=True, exist_ok=True)
    default_config_path().write_text('roots = ["C:/x"]\nuse_github = false\n', encoding="utf-8")
    cfg = load_config()
    assert cfg.use_github is False and github_client(cfg) is None
    cfg.use_github = True
    assert github_client(cfg) is not None
