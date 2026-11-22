"""Rock Foundry plugin for Hermes: keeps project cards fresh and exposes /project."""

from __future__ import annotations

import importlib.util
import json
import logging
import sys
import threading
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "vendor"))  # bundled engine

from rockfoundry.config import load_config, rockfoundry_home
from rockfoundry.scan import find_project_for_path, github_client, scan
from rockfoundry.store import HistoryEvent, ProjectStore

log = logging.getLogger("rockfoundry")
HERE = Path(__file__).resolve().parent
# The weekly job only rescans. It never browses URLs taken from scanned repos (untrusted).
REFRESH_TOOL = "rockfoundry_refresh_projects"
REFRESH_SCHEMA = {
    "name": REFRESH_TOOL,
    "description": (
        "Refresh Rock Foundry project cards in the background: rescan the user's project folders "
        "(read-only) and update the AI summaries with the current model. Use when the user asks to "
        "refresh or update their project cards, or from the weekly Rock Foundry job."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "project": {
                "type": "string",
                "description": "Project slug to refresh; leave out to refresh every project.",
            }
        },
    },
}
# The weekly job asks Hermes to call our tool, so summaries use the user's Hermes model.
WEEKLY_CRON = (
    f'hermes cron create "0 8 * * 1" "Call the {REFRESH_TOOL} tool to refresh every project card, '
    'then report only the projects that failed." --name rockfoundry-weekly'
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
    return f"Hermes session worked in {', '.join(sorted(folders))}"


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
        scan(cfg, store, only=slug, gh=github_client(cfg))
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
        return "No projects yet. Open the Projects page in Hermes Desktop to choose your project folders."
    lines = ["Your projects:"]
    for slug in slugs:
        f = store.read_facts(slug)
        if f:
            lines.append(f"- {f.name} (`/project {slug}`)")
    return "\n".join(lines)


def make_command(ctx):
    def provider(prompt: str) -> str:
        return ctx.llm.complete(messages=[{"role": "user", "content": prompt}], max_tokens=1200).text

    def handle(raw: str) -> str:
        store = _store()
        arg = (raw or "").strip()
        if not arg:
            return _list_text(store)
        if arg == "schedule":
            return f"To refresh every card each Monday at 08:00, run this command once:\n\n{WEEKLY_CRON}"
        if arg.split()[0] == "refresh":
            cfg = load_config()
            if cfg is None:
                return "No config yet. Choose your project folders on the Projects page first."
            only = arg.split()[1] if len(arg.split()) > 1 else None
            start_refresh(cfg, store, only, provider)
            what = f"project {only}" if only else "every project"
            return (
                f"Refreshing {what} in the background. Cards update in a few minutes; "
                "check again with /project <name> or the Projects page."
            )
        card = store.read_card(arg)
        return card if card else f"Project '{arg}' not found. Type /project to list them."

    return handle


def start_refresh(cfg, store: ProjectStore, only: str | None, provider) -> None:
    def job() -> None:
        results = scan(cfg, store, only=only, provider=provider, gh=github_client(cfg))
        failed = [r.name for r in results if not r.ok]
        if failed:
            log.warning("rockfoundry refresh failed: %s", ", ".join(failed))

    run_in_background(lambda: _safe(job))


def make_tool(ctx):
    def provider(prompt: str) -> str:
        return ctx.llm.complete(messages=[{"role": "user", "content": prompt}], max_tokens=1200).text

    def handle(args: dict | None = None, **_) -> str:
        cfg = load_config()
        if cfg is None:
            return json.dumps(
                {"status": "not_configured", "message": "Choose project folders on the Projects page."}
            )
        only = (args or {}).get("project") or None
        start_refresh(cfg, _store(), only, provider)
        return json.dumps({"status": "started", "project": only or "all"})

    return handle


def register(ctx) -> None:
    sessions = _sibling("sessions").SessionPaths()
    ctx.register_tool(name=REFRESH_TOOL, toolset="rockfoundry", schema=REFRESH_SCHEMA, handler=make_tool(ctx))

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
    ctx.register_skill("rockfoundry", HERE / "skills" / "rockfoundry" / "SKILL.md")  # Hermes wants a path
    ctx.register_command("project", make_command(ctx), description="Rock Foundry project cards")


def _safe(fn, *args) -> None:
    try:
        fn(*args)
    except Exception:
        log.exception("rockfoundry refresh")
