"""Rock Foundry plugin for Hermes: keeps project cards fresh and exposes /proyek."""

from __future__ import annotations

import importlib.util
import logging
import sys
import threading
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "vendor"))  # bundled engine

from rockfoundry.config import load_config, rockfoundry_home
from rockfoundry.gh import GhClient
from rockfoundry.scan import find_project_for_path, scan
from rockfoundry.store import HistoryEvent, ProjectStore

log = logging.getLogger("rockfoundry")
HERE = Path(__file__).resolve().parent
# The weekly job only rescans. It never browses URLs taken from scanned repos (untrusted).
WEEKLY_CRON = (
    'hermes cron create "0 8 * * 1" "Jalankan perintah terminal: rockfoundry scan --llm claude. '
    'Laporkan proyek yang gagal saja." --name rockfoundry-weekly'
)


def _sibling(name: str):
    spec = importlib.util.spec_from_file_location(f"rockfoundry_plugin_{name}", HERE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_in_background(fn) -> None:
    threading.Thread(target=fn, daemon=True, name="rockfoundry-refresh").start()


def _store() -> ProjectStore:
    return ProjectStore(rockfoundry_home())


def _session_summary(folders: set[str]) -> str:
    return f"Sesi Hermes kerja di {', '.join(sorted(folders))}"


def _refresh_after_session(paths: set[Path]) -> None:
    cfg = load_config()
    if cfg is None:
        return
    store = _store()
    touched: dict[str, set[str]] = {}
    for p in paths:
        slug = find_project_for_path(p, store)
        if slug:
            touched.setdefault(slug, set()).add(_workdir_name(p, slug, store))
    for slug, folders in touched.items():
        scan(cfg, store, only=slug, gh=GhClient())
        store.append_history(slug, HistoryEvent(datetime.now(), "session", _session_summary(folders)))
        _rerender(store, slug)


def _workdir_name(path: Path, slug: str, store: ProjectStore) -> str:
    facts = store.read_facts(slug)
    best = path.name
    for w in facts.workdirs if facts else []:
        base = Path(w.path)
        try:
            path.resolve().relative_to(base.resolve())
            best = base.name
            break
        except ValueError:
            continue
    return best


def _rerender(store: ProjectStore, slug: str) -> None:
    from rockfoundry.scan import render_from_store

    render_from_store(store, slug, date.today())


def _list_text(store: ProjectStore) -> str:
    slugs = store.list_slugs()
    if not slugs:
        return "Belum ada proyek. Buka halaman Projects di Hermes Desktop atau jalankan: rockfoundry scan"
    lines = ["Proyek lu:"]
    for slug in slugs:
        f = store.read_facts(slug)
        if f:
            lines.append(f"- {f.name} (`/proyek {slug}`)")
    return "\n".join(lines)


def make_command(ctx):
    def provider(prompt: str) -> str:
        return ctx.llm.complete(messages=[{"role": "user", "content": prompt}], max_tokens=1200).text

    def handle(raw: str) -> str:
        store = _store()
        arg = (raw or "").strip()
        if not arg:
            return _list_text(store)
        if arg == "jadwal":
            return (
                "Biar semua kartu diperbarui tiap Senin jam 8 pagi, jalankan perintah ini "
                f"(sekali saja):\n\n{WEEKLY_CRON}"
            )
        if arg.split()[0] == "refresh":
            cfg = load_config()
            if cfg is None:
                return "Belum ada config. Pilih folder proyek dulu di halaman Projects."
            only = arg.split()[1] if len(arg.split()) > 1 else None

            def job() -> None:
                results = scan(cfg, store, only=only, provider=provider, gh=GhClient())
                failed = [r.name for r in results if not r.ok]
                if failed:
                    log.warning("rockfoundry refresh gagal: %s", ", ".join(failed))

            run_in_background(lambda: _safe(job))
            what = f"proyek {only}" if only else "semua proyek"
            return (
                f"Lagi memperbarui {what} di belakang. Kartu bakal ke-update dalam beberapa menit; "
                "cek lagi pakai /proyek <nama> atau halaman Projects."
            )
        card = store.read_card(arg)
        return card if card else f"Proyek '{arg}' gak ketemu. Ketik /proyek untuk daftar."

    return handle


def register(ctx) -> None:
    sessions = _sibling("sessions").SessionPaths()

    def on_tool(tool_name=None, args=None, session_id=None, **_):
        try:
            sessions.record(session_id, tool_name, args)
        except Exception:  # hooks must never break Hermes
            log.exception("rockfoundry post_tool_call")

    def on_end(session_id=None, **_):
        try:
            paths = sessions.pop(session_id)
            if paths:
                run_in_background(lambda: _safe(_refresh_after_session, paths))
        except Exception:
            log.exception("rockfoundry on_session_end")

    ctx.register_hook("post_tool_call", on_tool)
    ctx.register_hook("on_session_end", on_end)
    ctx.register_skill(
        "rockfoundry",
        (HERE / "skills" / "rockfoundry" / "SKILL.md").read_text(encoding="utf-8"),
    )
    ctx.register_command("proyek", make_command(ctx), description="Kartu proyek Rock Foundry")


def _safe(fn, *args) -> None:
    try:
        fn(*args)
    except Exception:
        log.exception("rockfoundry refresh")
