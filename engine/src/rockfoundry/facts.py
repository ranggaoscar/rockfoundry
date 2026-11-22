"""Collect facts about a project with read-only git (and optional gh) calls. No AI here."""

from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from datetime import date
from fnmatch import fnmatch
from pathlib import Path, PurePosixPath

from rockfoundry.config import Config
from rockfoundry.discover import Project, Workdir
from rockfoundry.gh import PullRequest
from rockfoundry.gitutil import exec_config_risks, git, try_git
from rockfoundry.safety import is_denied, redact

SCHEMA_VERSION = 1
GUIDE_ROOT_FILES = ("AGENTS.md", "CLAUDE.md", "README.md")
GUIDE_DOC_PATTERNS = ("production*", "deploy*", "release*")
GUIDE_CHAR_BUDGET = 24_000


@dataclass
class ReleaseMarker:
    name: str
    date: date
    commit: str


@dataclass
class WorkdirFacts:
    path: str
    branch: str
    last_commit: date | None
    changed_files: int
    in_release: bool
    in_default: bool
    status: str = ""


@dataclass
class ProjectFacts:
    schema_version: int
    slug: str
    name: str
    remote: str | None
    default_branch: str | None
    first_commit: date | None
    commit_count: int
    last_activity: date | None
    release: ReleaseMarker | None
    prs: list[PullRequest] | None
    workdirs: list[WorkdirFacts]
    main_behind: int
    main_ahead: int
    guide_docs: dict[str, str]
    guide_docs_off_default: list[str]
    homepage: str | None
    notes: list[str] = field(default_factory=list)


def _date(text: str | None) -> date | None:
    text = (text or "").strip()
    return date.fromisoformat(text[:10]) if text else None


def _default_branch(repo: Path) -> tuple[str | None, str | None]:
    """Return (branch name, ref to compare against)."""
    ref = try_git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], repo)
    if ref and ref.startswith("origin/"):
        return ref.removeprefix("origin/"), ref
    for name in ("main", "master"):
        if try_git(["rev-parse", "--verify", "--quiet", f"refs/remotes/origin/{name}"], repo):
            return name, f"origin/{name}"
        if try_git(["rev-parse", "--verify", "--quiet", f"refs/heads/{name}"], repo):
            return name, name
    return None, None


def _release(repo: Path, patterns: list[str]) -> ReleaseMarker | None:
    out = try_git(
        [
            "for-each-ref",
            "--sort=-creatordate",
            "--format=%(refname:short)\t%(creatordate:short)\t%(objectname)\t%(*objectname)",
            "refs/tags",
        ],
        repo,
    )
    for line in (out or "").splitlines():
        name, created, obj, peeled = (line.split("\t") + ["", "", "", ""])[:4]
        if any(fnmatch(name, p) for p in patterns):
            return ReleaseMarker(name=name, date=_date(created) or date.min, commit=peeled or obj)
    return None


def _is_ancestor(repo: Path, rev: str, target: str | None) -> bool:
    if not target:
        return False
    try:
        git(["merge-base", "--is-ancestor", rev, target], repo)
        return True
    except Exception:
        return False


def _workdir_facts(
    w: Workdir, default_ref: str | None, release_patterns: list[str] | None
) -> tuple[WorkdirFacts, list[str]]:
    head = try_git(["rev-parse", "--verify", "--quiet", "HEAD"], w.path)
    risks = exec_config_risks(w.path)
    if risks:  # git status could run a repo-defined program here: don't
        changed = -1
    else:
        status = try_git(["status", "--porcelain", "--untracked-files=no"], w.path) or ""
        changed = len([ln for ln in status.splitlines() if ln.strip()])
    facts = WorkdirFacts(
        path=str(w.path),
        branch=w.branch or "(detached)",
        last_commit=_date(try_git(["log", "-1", "--format=%cs", "HEAD"], w.path)) if head else None,
        changed_files=changed,
        in_release=bool(head and release_patterns)
        and bool(try_git(["tag", "--contains", "HEAD", "--list", *(release_patterns or [])], w.path)),
        in_default=bool(head) and _is_ancestor(w.path, "HEAD", default_ref),
    )
    return facts, risks


def _is_guide_doc(path: str) -> bool:
    p = PurePosixPath(path)
    if str(p) in GUIDE_ROOT_FILES:
        return True
    return p.parts[:1] == ("docs",) and any(fnmatch(p.name.lower(), g) for g in GUIDE_DOC_PATTERNS)


def _guide_docs(repo: Path, ref: str | None, deny: list[str]) -> tuple[dict[str, str], list[str]]:
    docs: dict[str, str] = {}
    if ref:
        listing = try_git(["ls-tree", "-r", "--name-only", ref], repo) or ""
        budget = GUIDE_CHAR_BUDGET
        for path in sorted(p for p in listing.splitlines() if _is_guide_doc(p)):
            if is_denied(path, deny) or budget <= 0:
                continue
            text = try_git(["show", "--no-textconv", f"{ref}:{path}"], repo)
            if text is None:
                continue
            docs[path] = redact(text)[:budget]
            budget -= len(docs[path])
    off: set[str] = set()
    refs = try_git(["for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes"], repo)
    for other in (refs or "").splitlines():
        if other == ref or other.endswith("/HEAD") or other == "origin":
            continue
        listing = try_git(["ls-tree", "-r", "--name-only", other, "--", "docs"], repo) or ""
        for path in listing.splitlines():
            if _is_guide_doc(path) and path not in docs and not is_denied(path, deny):
                off.add(path)
    return docs, sorted(off)


def _github_repo(remote: str | None) -> str | None:
    if remote and remote.startswith("github.com/"):
        return remote.removeprefix("github.com/")
    return None


def collect_facts(project: Project, cfg: Config, gh, fetch: bool = False) -> ProjectFacts:
    repo = project.main_path
    notes = [redact(n) for n in project.notes]
    if fetch and not exec_config_risks(repo):
        try_git(["fetch", "--quiet", "origin"], repo, timeout=120)
    override = cfg.projects.get(project.slug)
    default_branch, default_ref = _default_branch(repo)
    patterns = (override.release_tags if override and override.release_tags else None) or cfg.release_tags
    release = _release(repo, patterns)

    with ThreadPoolExecutor(max_workers=8) as pool:
        pairs = list(
            pool.map(
                lambda w: _workdir_facts(w, default_ref, patterns if release else None), project.workdirs
            )
        )
    workdirs = [facts for facts, _ in pairs]
    risky = sorted({key for _, risks in pairs for key in risks})
    if risky:
        notes.append(
            f"This repo's git config can run programs ({', '.join(risky)}); "
            "Rock Foundry skips the change check and fetch here."
        )

    count = int(try_git(["rev-list", "--count", default_ref], repo) or 0) if default_ref else 0
    first = None
    if count:
        roots = (try_git(["rev-list", "--max-parents=0", default_ref], repo) or "").split()
        dates = [_date(try_git(["log", "-1", "--format=%cs", r], repo)) for r in roots]
        first = min((d for d in dates if d), default=None)
    activity = [w.last_commit for w in workdirs if w.last_commit]
    if default_ref and count:
        activity.append(_date(try_git(["log", "-1", "--format=%cs", default_ref], repo)))
    behind = ahead = 0
    if default_ref and default_ref.startswith("origin/"):
        counts = try_git(["rev-list", "--left-right", "--count", f"{default_ref}...HEAD"], repo)
        if counts and re.fullmatch(r"\d+\s+\d+", counts):
            behind, ahead = (int(x) for x in counts.split())

    prs = None
    homepage = override.homepage if override else None
    gh_repo = _github_repo(project.remote)
    if gh is not None and gh_repo and gh.available():
        try:
            prs = gh.pull_requests(gh_repo, limit=200)
        except Exception:
            prs = None
        if homepage is None:
            homepage = gh.homepage(gh_repo)

    docs, off = _guide_docs(repo, default_ref, cfg.deny)
    return ProjectFacts(
        schema_version=SCHEMA_VERSION,
        slug=project.slug,
        name=project.name,
        remote=project.remote,
        default_branch=default_branch,
        first_commit=first,
        commit_count=count,
        last_activity=max((d for d in activity if d), default=None),
        release=release,
        prs=prs,
        workdirs=workdirs,
        main_behind=behind,
        main_ahead=ahead,
        guide_docs=docs,
        guide_docs_off_default=off,
        homepage=homepage,
        notes=notes,
    )


def _iso(value):
    return value.isoformat() if isinstance(value, date) else value


def facts_to_dict(f: ProjectFacts) -> dict:
    def convert(obj):
        if isinstance(obj, dict):
            return {k: convert(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [convert(v) for v in obj]
        return _iso(obj)

    return convert(asdict(f))


def facts_from_dict(d: dict) -> ProjectFacts:
    release = d.get("release")
    prs = d.get("prs")
    return ProjectFacts(
        schema_version=d["schema_version"],
        slug=d["slug"],
        name=d["name"],
        remote=d.get("remote"),
        default_branch=d.get("default_branch"),
        first_commit=_date(d.get("first_commit")),
        commit_count=d["commit_count"],
        last_activity=_date(d.get("last_activity")),
        release=ReleaseMarker(release["name"], _date(release["date"]), release["commit"])
        if release
        else None,
        prs=None
        if prs is None
        else [
            PullRequest(p["number"], p["title"], p["branch"], p["state"], _date(p.get("merged_at")))
            for p in prs
        ],
        workdirs=[
            WorkdirFacts(
                path=w["path"],
                branch=w["branch"],
                last_commit=_date(w.get("last_commit")),
                changed_files=w["changed_files"],
                in_release=w["in_release"],
                in_default=w["in_default"],
                status=w.get("status", ""),
            )
            for w in d["workdirs"]
        ],
        main_behind=d["main_behind"],
        main_ahead=d["main_ahead"],
        guide_docs=dict(d["guide_docs"]),
        guide_docs_off_default=list(d["guide_docs_off_default"]),
        homepage=d.get("homepage"),
        notes=list(d.get("notes", [])),
    )
