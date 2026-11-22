import json
from datetime import date

import pytest
from fakes import FakeGh
from gitfixtures import add_worktree, make_repo, publish, run, write_commit
from rockfoundry.config import Config
from rockfoundry.discover import discover_projects
from rockfoundry.facts import collect_facts, facts_from_dict, facts_to_dict
from rockfoundry.gh import PullRequest
from rockfoundry.safety import is_denied


def _hub(tmp_path, extra=None):
    root = tmp_path / "r"
    repo = make_repo(root / "HUB", date="2026-06-13")
    write_commit(repo, {"AGENTS.md": "Jangan sentuh DB produksi."}, "docs", date="2026-07-01")
    write_commit(repo, {"README.md": "# Hub"}, "readme", date="2026-08-01")
    if extra:
        extra(repo, root)
    publish(repo, tmp_path / "hub.git")
    return root


def _project(root):
    cfg = Config(roots=[root])
    return discover_projects(cfg)[0], cfg


@pytest.fixture
def hub_project(tmp_path):
    return _project(_hub(tmp_path))


def test_basic_facts(hub_project):
    project, cfg = hub_project
    f = collect_facts(project, cfg, gh=None)
    assert f.default_branch == "main" and f.commit_count == 3
    assert f.first_commit == date(2026, 6, 13) and f.prs is None
    assert f.last_activity == date(2026, 8, 1)


def test_release_marker_from_tag(tmp_path):
    def extra(repo, root):
        wt = add_worktree(repo, root / "HUB-REL", "release/p2")
        write_commit(wt, {"x.txt": "p2"}, "p2", date="2026-11-14")
        run(["tag", "-a", "prod-internal-p2", "-m", "prod"], wt, date="2026-11-15")

    project, cfg = _project(_hub(tmp_path, extra))
    f = collect_facts(project, cfg, gh=None)
    assert f.release.name == "prod-internal-p2" and f.release.date == date(2026, 11, 15)
    assert [w.in_release for w in f.workdirs if w.branch == "release/p2"] == [True]


def test_dirty_count(tmp_path):
    def extra(repo, root):
        (repo / "AGENTS.md").write_text("changed", encoding="utf-8")
        (repo / "README.md").write_text("changed", encoding="utf-8")

    project, cfg = _project(_hub(tmp_path, extra))
    assert max(w.changed_files for w in collect_facts(project, cfg, None).workdirs) == 2


def test_guide_docs_found_off_default(tmp_path):
    def extra(repo, root):
        run(["switch", "-q", "-c", "docs/baseline"], repo)
        write_commit(repo, {"docs/PRODUCTION-BASELINE.md": "baseline"}, "baseline", date="2026-11-15")
        run(["switch", "-q", "main"], repo)

    project, cfg = _project(_hub(tmp_path, extra))
    f = collect_facts(project, cfg, None)
    assert "AGENTS.md" in f.guide_docs
    assert "docs/PRODUCTION-BASELINE.md" in f.guide_docs_off_default


def test_denied_doc_never_read(tmp_path):
    def extra(repo, root):
        write_commit(repo, {"docs/DEPLOY-secrets.md": "PASSWORD=x"}, "oops", date="2026-08-02")

    project, cfg = _project(_hub(tmp_path, extra))
    f = collect_facts(project, cfg, None)
    assert f.guide_docs and not any(is_denied(p, cfg.deny) for p in f.guide_docs)
    assert "docs/DEPLOY-secrets.md" not in f.guide_docs


def test_gh_unavailable_keeps_prs_none(hub_project):
    project, cfg = hub_project
    assert collect_facts(project, cfg, FakeGh([], ok=False)).prs is None


def test_gh_prs_used_for_github_remote(tmp_path):
    root = tmp_path / "r"
    make_repo(root / "HUB", remote="https://github.com/o/hub.git", date="2026-06-13")
    project, cfg = _project(root)
    pr = PullRequest(number=1, title="t", branch="fix/a", state="MERGED", merged_at=date(2026, 11, 21))
    f = collect_facts(project, cfg, FakeGh([pr], homepage="https://hub.example"))
    assert f.prs == [pr] and f.homepage == "https://hub.example"


def test_empty_repo_and_detached(tmp_path):
    empty = tmp_path / "e"
    (empty / "EMPTY").mkdir(parents=True)
    run(["init", "-q", "-b", "main"], empty / "EMPTY")
    p_empty, cfg_e = _project(empty)
    f = collect_facts(p_empty, cfg_e, None)
    assert f.commit_count == 0 and f.first_commit is None and f.last_activity is None

    def extra(repo, root):
        run(["worktree", "add", "-q", "--detach", str(root / "HUB-D"), "HEAD~1"], repo)

    p_det, cfg_d = _project(_hub(tmp_path / "d", extra))
    assert any(w.branch == "(detached)" for w in collect_facts(p_det, cfg_d, None).workdirs)


def test_dict_roundtrip(hub_project):
    project, cfg = hub_project
    f = collect_facts(project, cfg, None)
    assert facts_from_dict(json.loads(json.dumps(facts_to_dict(f)))) == f


def test_untrusted_filter_never_runs_and_status_skipped(tmp_path):
    marker = tmp_path / "pwned.txt"

    def extra(repo, root):
        write_commit(repo, {".gitattributes": "*.txt filter=evil\n"}, "attrs", date="2026-08-03")
        run(["config", "filter.evil.clean", f"sh -c 'echo hacked > \"{marker.as_posix()}\"; cat'"], repo)
        (repo / "file1.txt").write_text("changed later", encoding="utf-8")

    project, cfg = _project(_hub(tmp_path, extra))
    f = collect_facts(project, cfg, None, fetch=True)
    assert not marker.exists()
    assert f.workdirs[0].changed_files == -1
    assert any("filter.evil.clean" in n for n in f.notes)


def test_guide_docs_are_redacted(tmp_path):
    def extra(repo, root):
        write_commit(repo, {"docs/DEPLOY.md": "ssh hermes@203.0.113.7"}, "deploy", date="2026-08-02")

    project, cfg = _project(_hub(tmp_path, extra))
    f = collect_facts(project, cfg, None)
    assert "203.0.113.7" not in f.guide_docs["docs/DEPLOY.md"]


def test_any_release_line_counts_as_live(tmp_path):
    def extra(repo, root):
        a = add_worktree(repo, root / "HUB-INTERNAL", "release/internal")
        write_commit(a, {"a.txt": "a"}, "internal", date="2026-11-14")
        run(["tag", "-a", "prod-internal-p2", "-m", "i"], a, date="2026-11-15")
        b = add_worktree(repo, root / "HUB-PUBLIC", "release/public")
        write_commit(b, {"b.txt": "b"}, "public", date="2026-11-14")
        run(["tag", "-a", "prod-public-p2", "-m", "p"], b, date="2026-11-15")

    project, cfg = _project(_hub(tmp_path, extra))
    f = collect_facts(project, cfg, None)
    live = {w.branch for w in f.workdirs if w.in_release}
    assert {"release/internal", "release/public"} <= live
