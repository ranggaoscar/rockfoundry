import shutil

from gitfixtures import add_worktree, make_repo, run
from rockfoundry.config import Config
from rockfoundry.discover import discover_projects, normalize_remote


def test_normalize_remote_variants():
    assert (
        normalize_remote("https://user:tok@github.com/Ranggaoscar/BresciaHub.git")
        == "github.com/ranggaoscar/bresciahub"
    )
    assert (
        normalize_remote("git@github.com:ranggaoscar/bresciahub.git") == "github.com/ranggaoscar/bresciahub"
    )
    assert normalize_remote(None) is None


def test_worktrees_grouped_into_one_project(tmp_path, rf_home):
    main = make_repo(tmp_path / "root1" / "HUB", remote="https://github.com/o/hub.git")
    add_worktree(main, tmp_path / "root1" / "HUB-FEATURE", "feat/a")
    add_worktree(main, tmp_path / "elsewhere" / "hub-x", "feat/b")
    make_repo(tmp_path / "root1" / "SITE", remote="git@github.com:o/site.git")
    projects = discover_projects(Config(roots=[tmp_path / "root1"]))
    assert [p.slug for p in projects] == ["hub", "site"]
    assert len(projects[0].workdirs) == 3
    assert projects[0].main_path.name == "HUB"


def test_clone_of_same_remote_joins_project(tmp_path, rf_home):
    make_repo(tmp_path / "r" / "HUB", remote="https://github.com/o/hub.git")
    make_repo(tmp_path / "r" / "HUB-COPY", remote="https://github.com/o/hub.git")
    projects = discover_projects(Config(roots=[tmp_path / "r"]))
    assert len(projects) == 1 and len(projects[0].workdirs) == 2


def test_no_remote_uses_folder_name(tmp_path, rf_home):
    make_repo(tmp_path / "r" / "My Tool")
    p = discover_projects(Config(roots=[tmp_path / "r"]))[0]
    assert p.slug == "my-tool" and p.name == "My Tool" and p.remote is None


def test_prunable_worktree_skipped_with_note(tmp_path, rf_home):
    main = make_repo(tmp_path / "r" / "HUB", remote="https://github.com/o/hub.git")
    wt = add_worktree(main, tmp_path / "r" / "HUB-GONE", "feat/gone")
    shutil.rmtree(wt)
    p = discover_projects(Config(roots=[tmp_path / "r"]))[0]
    assert all(w.path.resolve() != wt.resolve() for w in p.workdirs)
    assert any("HUB-GONE" in n for n in p.notes)


def test_credentials_never_kept(tmp_path, rf_home):
    make_repo(tmp_path / "r" / "HUB", remote="https://user:secret123@github.com/o/hub.git")
    p = discover_projects(Config(roots=[tmp_path / "r"]))[0]
    assert "secret123" not in repr(p)


def test_non_git_folders_ignored(tmp_path, rf_home):
    (tmp_path / "r" / "Tools").mkdir(parents=True)
    assert discover_projects(Config(roots=[tmp_path / "r"])) == []


def test_detached_worktree_listed(tmp_path, rf_home):
    main = make_repo(tmp_path / "r" / "HUB", remote="https://github.com/o/hub.git", commits=2)
    run(["worktree", "add", "-q", "--detach", str(tmp_path / "r" / "HUB-D"), "HEAD~1"], main)
    p = discover_projects(Config(roots=[tmp_path / "r"]))[0]
    assert any(w.detached and w.branch is None for w in p.workdirs)


def test_local_windows_path_remote_gives_clean_name(tmp_path, rf_home):
    make_repo(tmp_path / "r" / "hunter", remote=r"C:\AI PROJECTS\hermes-agent-hunter")
    p = discover_projects(Config(roots=[tmp_path / "r"]))[0]
    assert p.name == "hermes-agent-hunter" and p.slug == "hermes-agent-hunter"
