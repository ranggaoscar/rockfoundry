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


def test_duplicate_names_are_told_apart(tmp_path, rf_home):
    make_repo(tmp_path / "r" / "agent-a", remote="https://github.com/NousResearch/hermes-agent.git")
    make_repo(tmp_path / "r" / "agent-b", remote="https://github.com/ranggaoscar/hermes-agent.git")
    make_repo(tmp_path / "r" / "local-agent" / "hermes-agent")
    names = sorted(p.name for p in discover_projects(Config(roots=[tmp_path / "r"], scan_depth=2)))
    assert names == [
        "hermes-agent (NousResearch)",
        "hermes-agent (local-agent)",
        "hermes-agent (ranggaoscar)",
    ]


def _drive(tmp_path, monkeypatch):
    import rockfoundry.discover as d

    drive = tmp_path / "drive"
    monkeypatch.setattr(d, "is_drive_root", lambda p: p == drive)
    return drive


def test_drive_root_finds_deep_projects(tmp_path, rf_home, monkeypatch):
    drive = _drive(tmp_path, monkeypatch)
    make_repo(drive / "Users" / "me" / "Documents" / "work" / "deep-app")
    slugs = [p.slug for p in discover_projects(Config(roots=[drive]))]
    assert slugs == ["deep-app"]


def test_drive_root_skips_system_and_tool_folders(tmp_path, rf_home, monkeypatch):
    drive = _drive(tmp_path, monkeypatch)
    make_repo(drive / "Users" / "me" / "AppData" / "Local" / "hermes" / "hermes-agent")
    make_repo(drive / "Program Files" / "tool")
    make_repo(drive / "Windows" / "thing")
    make_repo(drive / "code" / "site" / "node_modules" / "dep")
    make_repo(drive / "code" / ".hidden-clone")
    make_repo(drive / "code" / "site")
    slugs = [p.slug for p in discover_projects(Config(roots=[drive]))]
    assert slugs == ["site"]


def test_normal_folder_keeps_shallow_depth(tmp_path, rf_home):
    make_repo(tmp_path / "r" / "a" / "b" / "too-deep")
    assert discover_projects(Config(roots=[tmp_path / "r"])) == []


def test_drive_root_keeps_a_repo_named_like_a_noise_folder(tmp_path, rf_home, monkeypatch):
    drive = _drive(tmp_path, monkeypatch)
    make_repo(drive / "work" / "build")
    make_repo(drive / "work" / "dist" / "inner-tool")
    assert [p.slug for p in discover_projects(Config(roots=[drive]))] == ["build"]


def test_url_encoded_remote_name_is_decoded(tmp_path, rf_home):
    make_repo(tmp_path / "r" / "x", remote="https://github.com/o/IDEA%20CUT.git")
    p = discover_projects(Config(roots=[tmp_path / "r"]))[0]
    assert p.name == "IDEA CUT" and p.slug == "idea-cut"


def test_repo_name_ending_in_git_letters_is_kept(tmp_path, rf_home):
    make_repo(tmp_path / "r" / "x", remote="https://github.com/o/legit.git")
    assert discover_projects(Config(roots=[tmp_path / "r"]))[0].name == "legit"
