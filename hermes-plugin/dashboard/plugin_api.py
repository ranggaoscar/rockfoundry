"""Backend routes for the Rock Foundry Projects page: /api/plugins/rockfoundry/*."""

from __future__ import annotations

import base64
import mimetypes
import sys
from dataclasses import asdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "vendor"))  # bundled engine

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from rockfoundry.classify import activity_bucket, decision_badges, summarize_folders
from rockfoundry.config import load_config, rockfoundry_home, write_default_config
from rockfoundry.facts import facts_to_dict
from rockfoundry.gh import GhClient
from rockfoundry.narrative import cached_narrative
from rockfoundry.safety import redact
from rockfoundry.scan import scan
from rockfoundry.store import ProjectStore

router = APIRouter()
IMAGE_NAMES = (
    "image-live.png",
    "image.svg",
    "image.png",
    "image.ico",
    "image.jpg",
    "image.webp",
)


def _store() -> ProjectStore:
    return ProjectStore(rockfoundry_home())


def _clean(value):
    if isinstance(value, str):
        return redact(value)
    if isinstance(value, dict):
        return {k: _clean(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_clean(v) for v in value]
    return value


def _image(store: ProjectStore, slug: str) -> Path | None:
    for name in IMAGE_NAMES:
        path = store.project_dir(slug) / name
        if path.is_file():
            return path
    return None


@router.get("/projects")
async def list_projects():
    store, today, rows = _store(), date.today(), []
    for slug in store.list_slugs():
        f = store.read_facts(slug)
        if f is None:
            continue
        narrative = cached_narrative(store.narrative_path(slug))
        rows.append(
            {
                "slug": slug,
                "name": f.name,
                "what_is": narrative.what_is if narrative else None,
                "activity": activity_bucket(f.last_activity, today),
                "live": f.release.date.isoformat() if f.release else None,
                "last_activity": f.last_activity.isoformat() if f.last_activity else None,
                "badges": [b.text for b in decision_badges(f, today)],
                "workdirs": len(f.workdirs),
                "image_url": f"/projects/{slug}/image" if _image(store, slug) else None,
            }
        )
    rows.sort(key=lambda r: r["last_activity"] or "", reverse=True)
    return _clean(rows)


@router.get("/projects/{slug}")
async def project_detail(slug: str):
    store = _store()
    if slug not in store.list_slugs():
        raise HTTPException(status_code=404, detail="Proyek gak ketemu")
    f = store.read_facts(slug)
    narrative = cached_narrative(store.narrative_path(slug))
    folders = summarize_folders(f)
    return _clean(
        {
            "facts": {k: v for k, v in facts_to_dict(f).items() if k != "guide_docs"},
            "folders": asdict(folders),
            "card_markdown": store.read_card(slug) or "",
            "card_path": str(store.project_dir(slug) / "card.md"),
            "narrative": asdict(narrative) if narrative else None,
            "history": [
                {"at": e.at.isoformat(), "kind": e.kind, "text": e.text} for e in store.read_history(slug)
            ],
        }
    )


@router.post("/projects/{slug}/refresh")
async def refresh(slug: str):
    cfg = load_config()
    if cfg is None:
        raise HTTPException(status_code=409, detail="Belum ada config")
    results = scan(cfg, _store(), only=slug, gh=GhClient())
    if not results:
        raise HTTPException(status_code=404, detail="Proyek gak ketemu")
    return _clean(asdict(results[0]))


@router.get("/projects/{slug}/image")
async def project_image(slug: str):
    store = _store()
    if slug not in store.list_slugs():
        raise HTTPException(status_code=404)
    path = _image(store, slug)
    if path is None:
        raise HTTPException(status_code=404)
    mime = "image/svg+xml" if path.suffix == ".svg" else mimetypes.guess_type(path.name)[0] or "image/png"
    return {"data_url": f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"}


class SetupBody(BaseModel):
    roots: list[str]


@router.get("/setup")
async def get_setup():
    cfg = load_config()
    return {
        "configured": cfg is not None,
        "roots": [r.as_posix() for r in cfg.roots] if cfg else [],
    }


@router.post("/setup")
async def post_setup(body: SetupBody):
    roots = [Path(r.strip()) for r in body.roots if r.strip()]
    missing = [str(r) for r in roots if not r.is_dir()]
    if not roots or missing:
        raise HTTPException(status_code=400, detail={"missing": missing})
    write_default_config(roots)
    return {"configured": True, "roots": [r.as_posix() for r in roots]}
