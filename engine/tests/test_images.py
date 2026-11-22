from datetime import date

from gitfixtures import make_repo, publish, write_commit
from rockfoundry.config import Config
from rockfoundry.discover import discover_projects
from rockfoundry.facts import collect_facts
from rockfoundry.images import find_logo, save_screenshot
from rockfoundry.scan import scan
from rockfoundry.store import ProjectStore


def _project(tmp_path, files):
    root = tmp_path / "r"
    repo = make_repo(root / "HUB", date="2026-11-01")
    if files:
        write_commit(repo, files, "logo", date="2026-11-02")
    publish(repo, tmp_path / "hub.git")
    cfg = Config(roots=[root])
    project = discover_projects(cfg)[0]
    return project, cfg


def test_logo_found_and_copied(tmp_path, rf_home):
    project, cfg = _project(tmp_path, {"public/favicon.svg": "<svg/>"})
    store = ProjectStore(rf_home)
    path = find_logo(collect_facts(project, cfg, None), project.main_path, store)
    assert path == store.project_dir("hub") / "image.svg"
    assert path.read_text(encoding="utf-8") == "<svg/>"


def test_no_logo_returns_none(tmp_path, rf_home):
    project, cfg = _project(tmp_path, None)
    assert find_logo(collect_facts(project, cfg, None), project.main_path, ProjectStore(rf_home)) is None


def test_scan_writes_logo(tmp_path, rf_home):
    _, cfg = _project(tmp_path, {"apps/web/public/logo.png": "png-bytes"})
    scan(cfg, ProjectStore(rf_home), today=date(2026, 11, 22))
    assert (rf_home / "projects" / "hub" / "image.png").exists()


def test_save_screenshot(rf_home):
    path = save_screenshot("hub", b"\x89PNG", ProjectStore(rf_home))
    assert path.name == "image-live.png" and path.read_bytes() == b"\x89PNG"
