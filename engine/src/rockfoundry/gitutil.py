"""Thin read-only wrapper around the git command line."""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path

# Only what git and gh need to run and find their own config/login. Tokens and API keys in the
# host environment (GH_TOKEN, GITHUB_TOKEN, model keys, ...) are never passed on.
_ENV_KEEP = {
    "PATH",
    "PATHEXT",
    "SYSTEMROOT",
    "SYSTEMDRIVE",
    "WINDIR",
    "COMSPEC",
    "PROGRAMFILES",
    "PROGRAMFILES(X86)",
    "PROGRAMDATA",
    "HOME",
    "USERPROFILE",
    "HOMEDRIVE",
    "HOMEPATH",
    "APPDATA",
    "LOCALAPPDATA",
    "TEMP",
    "TMP",
    "TMPDIR",
    "LANG",
    "XDG_CONFIG_HOME",
    "XDG_CACHE_HOME",
    "XDG_RUNTIME_DIR",
    "DBUS_SESSION_BUS_ADDRESS",
    "GH_CONFIG_DIR",
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "NO_PROXY",
    "https_proxy",
    "http_proxy",
    "no_proxy",
}


def child_env() -> dict[str, str]:
    env = {k: v for k, v in os.environ.items() if k.upper() in {e.upper() for e in _ENV_KEEP}}
    env.update(GIT_TERMINAL_PROMPT="0", LC_ALL="C", GIT_OPTIONAL_LOCKS="0", GH_PROMPT_DISABLED="1")
    return env


class GitError(Exception):
    pass


# Scanned repos are untrusted: never let their config run programs.
HARDENING = [
    "-c",
    "core.fsmonitor=false",
    "-c",
    "core.untrackedCache=false",
    "-c",
    "core.sshCommand=ssh -o BatchMode=yes",
    "-c",
    "protocol.ext.allow=never",
    "-c",
    "diff.external=",
    "-c",
    f"core.hooksPath={os.devnull}",
    "-c",
    "maintenance.auto=false",
    "-c",
    "gc.auto=0",
    "-c",
    "log.showSignature=false",
    "-c",
    "gpg.program=",
    "-c",
    "gpg.ssh.program=",
    "-c",
    "gpg.x509.program=",
    "-c",
    "credential.helper=",
]


def git(args: list[str], cwd: Path, timeout: float = 30) -> str:
    env = child_env()
    try:
        proc = subprocess.run(
            ["git", *HARDENING, *args],
            cwd=cwd,
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise GitError(f"git {args[0]} failed: {exc.__class__.__name__}") from exc
    if proc.returncode != 0:
        raise GitError(f"git {args[0]} failed ({proc.returncode})")
    return proc.stdout.strip()


_RISKY_KEY = re.compile(
    r"^(filter\..+\.(clean|smudge|process)"
    r"|core\.(hookspath|sshcommand|gitproxy|askpass|editor|pager|fsmonitor|alternaterefscommand)"
    r"|remote\..+\.(uploadpack|receivepack|proxy)"
    r"|credential\..*"
    r"|diff\..+\.(textconv|command)"
    r"|merge\..+\.driver"
    r"|uploadpack\.packobjectshook"
    r"|include\.path|includeif\..+\.path"
    r"|sequence\.editor|gpg\..*program|http\..*proxy)$"
)


_KNOWN_SAFE = {
    "filter.lfs.clean": "git-lfs clean -- %f",
    "filter.lfs.smudge": "git-lfs smudge -- %f",
    "filter.lfs.process": "git-lfs filter-process",
}


def _known_safe(key: str, value: str) -> bool:
    if any(ord(ch) < 32 for ch in value):  # newlines etc. could smuggle a second command
        return False
    if _KNOWN_SAFE.get(key) == value:
        return True
    return key == "core.fsmonitor" and value.lower() in ("true", "false")


def exec_config_risks(repo: Path) -> list[str]:
    """Repo-local config keys that could make git run a program. Reading config runs nothing."""
    out = try_git(["config", "--list", "--show-scope", "-z"], repo) or ""
    risks: set[str] = set()
    tokens = out.split("\0")  # -z with --show-scope: scope NUL key LF value NUL ...
    for scope, entry in zip(tokens[0::2], tokens[1::2], strict=False):
        if scope not in ("local", "worktree"):
            continue
        key, _, value = entry.partition("\n")
        key = key.lower()
        if _RISKY_KEY.match(key) and not _known_safe(key, value):
            risks.add(key)
    return sorted(risks)


def git_bytes(args: list[str], cwd: Path, timeout: float = 30) -> bytes | None:
    """Like git() but returns raw stdout bytes (for images); None on any failure."""
    env = child_env()
    try:
        proc = subprocess.run(
            ["git", *HARDENING, *args], cwd=cwd, env=env, capture_output=True, timeout=timeout
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    return proc.stdout if proc.returncode == 0 else None


def try_git(args: list[str], cwd: Path, timeout: float = 30) -> str | None:
    try:
        return git(args, cwd, timeout)
    except GitError:
        return None
