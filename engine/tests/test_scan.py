import json
import os
from datetime import date
from pathlib import Path

import pytest
import rockfoundry.scan as scan_mod
from gitfixtures import make_repo, run
from rockfoundry.cli import main
from rockfoundry.config import Config, write_default_config
from rockfoundry.scan import find_project_for_path, scan
from rockfoundry.store import ProjectStore

TODAY = date(2026, 11, 22)


def snapshot(roots):
    out = {}
    for root in roots:
        for dirpath, _, files in os.walk(root):
            for name in files:
                p = Path(dirpath) / name
                st = p.stat()
                out[str(p)] = (st.st_size, st.st_mtime_ns)
    return out


@pytest.fixture
def two_projects_cfg(tmp_path, rf_home):
    root = tmp_path / "r"
    make_repo(root / "HUB", remote="https://user:tok999@github.com/o/hub.git", commits=2, date="2026-11-20")
    make_repo(root / "SITE", remote="git@github.com:o/site.git", date="2026-09-01")
    return Config(roots=[root])


def test_scan_writes_cards_and_leaves_repos_untouched(two_projects_cfg, rf_home):
    before = snapshot(two_projects_cfg.roots)
    res = scan(two_projects_cfg, ProjectStore(rf_home), today=TODAY)
    assert all(r.ok for r in res) and len(res) == 2
    assert (rf_home / "projects" / "hub" / "card.md").exists()
    assert snapshot(two_projects_cfg.roots) == before


def test_one_broken_project_does_not_stop_scan(two_projects_cfg, rf_home, monkeypatch):
    real = scan_mod.collect_facts

    def flaky(project, *a, **k):
        if project.slug == "hub":
            raise RuntimeError("boom")
        return real(project, *a, **k)

    monkeypatch.setattr(scan_mod, "collect_facts", flaky)
    res = {r.slug: r for r in scan(two_projects_cfg, ProjectStore(rf_home), today=TODAY)}
    assert res["hub"].ok is False and res["site"].ok is True


def test_new_release_appends_history(two_projects_cfg, rf_home):
    store = ProjectStore(rf_home)
    scan(two_projects_cfg, store, only="hub", today=TODAY)
    run(["tag", "-a", "v1.0", "-m", "v1"], two_projects_cfg.roots[0] / "HUB", date="2026-11-21")
    scan(two_projects_cfg, store, only="hub", today=TODAY)
    kinds = [e.kind for e in store.read_history("hub")]
    assert kinds.count("release") == 1


def test_find_project_for_path(two_projects_cfg, rf_home):
    store = ProjectStore(rf_home)
    scan(two_projects_cfg, store, today=TODAY)
    nested = two_projects_cfg.roots[0] / "HUB" / "src" / "app.py"
    assert find_project_for_path(nested, store) == "hub"
    assert find_project_for_path(two_projects_cfg.roots[0].parent / "elsewhere", store) is None


def test_cli_list_json(two_projects_cfg, rf_home, capsys):
    write_default_config(two_projects_cfg.roots)
    assert main(["scan"]) == 0
    capsys.readouterr()
    assert main(["list", "--json"]) == 0
    data = json.loads(capsys.readouterr().out)
    assert [d["slug"] for d in data] == ["hub", "site"]


def test_cli_scan_without_config_non_tty(rf_home, monkeypatch, capsys):
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)
    assert main(["scan"]) == 2
    assert "Belum ada config" in capsys.readouterr().out


def test_cli_note_shows_in_card(two_projects_cfg, rf_home, capsys):
    write_default_config(two_projects_cfg.roots)
    main(["scan"])
    assert main(["note", "hub", "Klien minta fitur chat"]) == 0
    capsys.readouterr()
    main(["card", "hub"])
    assert "Klien minta fitur chat" in capsys.readouterr().out


def test_cli_never_prints_remote_credentials(two_projects_cfg, rf_home, capsys):
    write_default_config(two_projects_cfg.roots)
    for argv in (["scan"], ["list"], ["list", "--json"], ["card", "hub"], ["doctor"]):
        main(argv)
    out = capsys.readouterr().out
    assert "tok999" not in out
    assert "tok999" not in (rf_home / "projects" / "hub" / "facts.json").read_text(encoding="utf-8")
