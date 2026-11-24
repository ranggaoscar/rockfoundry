from gitfixtures import make_repo, run
from rockfoundry.gitutil import git


def test_untrusted_fsmonitor_never_runs(tmp_path):
    repo = make_repo(tmp_path / "evil")
    marker = tmp_path / "pwned.txt"
    run(["config", "core.fsmonitor", f"echo hacked > '{marker.as_posix()}'"], repo)
    git(["status", "--porcelain", "--untracked-files=no"], repo)
    assert not marker.exists()


def test_exec_config_risks_flags_custom_filter_but_not_lfs(tmp_path):
    from rockfoundry.gitutil import exec_config_risks

    repo = make_repo(tmp_path / "r")
    run(["config", "filter.lfs.clean", "git-lfs clean -- %f"], repo)
    run(["config", "filter.lfs.required", "true"], repo)
    run(["config", "core.fsmonitor", "true"], repo)
    assert exec_config_risks(repo) == []
    run(["config", "filter.evil.clean", "sh -c 'echo hi'"], repo)
    assert exec_config_risks(repo) == ["filter.evil.clean"]


def test_lfs_lookalike_filter_is_flagged(tmp_path):
    from rockfoundry.gitutil import exec_config_risks

    repo = make_repo(tmp_path / "r")
    run(["config", "filter.lfs.clean", "git-lfs clean -- %f; echo pwned"], repo)
    assert exec_config_risks(repo) == ["filter.lfs.clean"]


def test_repo_hooks_never_run_on_fetch(tmp_path):
    import os
    import stat

    from gitfixtures import publish
    from rockfoundry.gitutil import git

    repo = make_repo(tmp_path / "hub")
    publish(repo, tmp_path / "hub.git")
    marker = tmp_path / "hooked.txt"
    hook = repo / ".git" / "hooks" / "reference-transaction"
    hook.write_text(f"#!/bin/sh\necho ran > '{marker.as_posix()}'\n", encoding="utf-8")
    os.chmod(hook, hook.stat().st_mode | stat.S_IEXEC)
    git(["fetch", "--quiet", "origin", "+refs/heads/main:refs/remotes/origin/check"], repo)
    assert not marker.exists()


def test_multiline_lfs_value_is_flagged(tmp_path):
    from rockfoundry.gitutil import exec_config_risks

    repo = make_repo(tmp_path / "r")
    run(["config", "filter.lfs.clean", "git-lfs clean -- %f\necho pwned"], repo)
    assert exec_config_risks(repo) == ["filter.lfs.clean"]


def test_hardening_disables_signature_programs_and_credential_helpers():
    from rockfoundry.gitutil import HARDENING

    flags = set(HARDENING[1::2])
    assert {
        "log.showSignature=false",
        "gpg.program=",
        "gpg.ssh.program=",
        "gpg.x509.program=",
        "credential.helper=",
    } <= flags


def test_gpg_program_is_flagged(tmp_path):
    from rockfoundry.gitutil import exec_config_risks

    repo = make_repo(tmp_path / "r")
    run(["config", "gpg.program", "evil"], repo)
    assert exec_config_risks(repo) == ["gpg.program"]


def test_child_env_drops_tokens_and_keys(monkeypatch):
    from rockfoundry.gitutil import child_env

    for k in ("GH_TOKEN", "GITHUB_TOKEN", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "HERMES_SECRET"):
        monkeypatch.setenv(k, "x")
    env = child_env()
    assert not {"GH_TOKEN", "GITHUB_TOKEN", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "HERMES_SECRET"} & set(env)
    assert env.get("PATH") and env["GIT_TERMINAL_PROMPT"] == "0"


def test_gh_runs_with_child_env(monkeypatch):
    import rockfoundry.gh as gh_mod

    seen = {}

    class Done:
        returncode, stdout = 0, "[]"

    def fake_run(cmd, **kwargs):
        seen["env"] = kwargs.get("env")
        return Done()

    monkeypatch.setenv("GH_TOKEN", "leak")
    monkeypatch.setattr(gh_mod.subprocess, "run", fake_run)
    gh_mod.GhClient().pull_requests("o/r")
    assert seen["env"] is not None and "GH_TOKEN" not in seen["env"]
