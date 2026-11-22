"""Gallery tile images: a logo from the repo, or a screenshot of the live site."""

from __future__ import annotations

from fnmatch import fnmatch
from pathlib import Path

from rockfoundry.facts import ProjectFacts
from rockfoundry.gitutil import git_bytes, try_git
from rockfoundry.store import ProjectStore

LOGO_PATTERNS = (
    "logo.svg",
    "logo.png",
    "public/favicon.svg",
    "public/favicon.png",
    "public/favicon.ico",
    "assets/logo*",
    "apps/*/public/favicon.*",
    "apps/*/public/logo*",
)
LOGO_EXTENSIONS = {".svg", ".png", ".ico", ".jpg", ".jpeg", ".webp"}
MAX_BYTES = 1_000_000


def _ref(f: ProjectFacts, repo: Path) -> str | None:
    if not f.default_branch:
        return None
    remote = f"origin/{f.default_branch}"
    if try_git(["rev-parse", "--verify", "--quiet", remote], repo):
        return remote
    return f.default_branch


def find_logo(f: ProjectFacts, main_path: Path, store: ProjectStore) -> Path | None:
    ref = _ref(f, main_path)
    if ref is None:
        return None
    listing = (try_git(["ls-tree", "-r", "--name-only", ref], main_path) or "").splitlines()
    for pattern in LOGO_PATTERNS:
        for path in sorted(p for p in listing if fnmatch(p, pattern)):
            ext = Path(path).suffix.lower()
            if ext not in LOGO_EXTENSIONS:
                continue
            size = try_git(["cat-file", "-s", f"{ref}:{path}"], main_path)
            if not size or int(size) > MAX_BYTES:
                continue
            data = git_bytes(["show", "--no-textconv", f"{ref}:{path}"], main_path)
            if data is None:
                continue
            target = store.project_dir(f.slug) / f"image{'.jpg' if ext == '.jpeg' else ext}"
            target.parent.mkdir(parents=True, exist_ok=True)
            for old in target.parent.glob("image.*"):
                old.unlink()
            target.write_bytes(data)
            return target
    return None


def save_screenshot(slug: str, png: bytes, store: ProjectStore) -> Path:
    target = store.project_dir(slug) / "image-live.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(png)
    return target
