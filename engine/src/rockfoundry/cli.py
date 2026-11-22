"""Command line: rockfoundry scan | list | card | note | doctor."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import date, datetime
from pathlib import Path

from rockfoundry.classify import activity_bucket, decision_badges
from rockfoundry.config import (
    default_config_path,
    load_config,
    rockfoundry_home,
    write_default_config,
)
from rockfoundry.fmt import ago
from rockfoundry.gh import GhClient
from rockfoundry.gitutil import try_git
from rockfoundry.narrative import make_provider
from rockfoundry.scan import render_from_store, scan
from rockfoundry.store import HistoryEvent, ProjectStore

NO_CONFIG = "Belum ada config. Jalankan: rockfoundry scan (di terminal) untuk memilih folder."


def _ask_roots() -> list[Path]:
    print("Folder mana yang berisi proyek lu? Satu per baris, kosongkan baris untuk selesai.")
    roots: list[Path] = []
    while True:
        line = input("> ").strip().strip('"')
        if not line:
            return roots
        roots.append(Path(line))


def _cmd_scan(args, store: ProjectStore) -> int:
    cfg = load_config()
    if cfg is None:
        if not sys.stdin.isatty():
            print(NO_CONFIG)
            return 2
        roots = _ask_roots()
        if not roots:
            print(NO_CONFIG)
            return 2
        cfg = write_default_config(roots)
    results = scan(
        cfg,
        store,
        only=args.project,
        provider=make_provider(args.llm),
        gh=GhClient(),
        fetch=args.fetch,
        force_narrative=args.force_narrative,
    )
    for r in results:
        mark = "ok " if r.ok else "GAGAL"
        print(f"{mark} {r.name} ({r.seconds:.1f} dtk)" + ("" if r.ok else f": {r.error}"))
    if args.project and not results:
        print(f"Proyek '{args.project}' gak ketemu.")
        return 1
    return 0 if all(r.ok for r in results) else 1


def _rows(store: ProjectStore) -> list[dict]:
    today = date.today()
    rows = []
    for slug in store.list_slugs():
        f = store.read_facts(slug)
        if f is None:
            continue
        rows.append(
            {
                "slug": slug,
                "name": f.name,
                "activity": activity_bucket(f.last_activity, today),
                "last_activity": f.last_activity.isoformat() if f.last_activity else None,
                "live": f.release.date.isoformat() if f.release else None,
                "badges": [b.text for b in decision_badges(f, today)],
                "workdirs": len(f.workdirs),
            }
        )
    return sorted(rows, key=lambda r: r["last_activity"] or "", reverse=True)


def _cmd_list(args, store: ProjectStore) -> int:
    rows = _rows(store)
    if args.json:
        print(json.dumps(sorted(rows, key=lambda r: r["slug"]), ensure_ascii=False, indent=2))
        return 0
    if not rows:
        print("Belum ada proyek. Jalankan: rockfoundry scan")
    today = date.today()
    for r in rows:
        last = date.fromisoformat(r["last_activity"]) if r["last_activity"] else None
        print(f"{r['name']:<36} {r['activity']:<9} {ago(last, today):<16} {r['workdirs']} folder")
    return 0


def _cmd_card(args, store: ProjectStore) -> int:
    card = store.read_card(args.slug)
    if card is None:
        print(f"Proyek '{args.slug}' gak ketemu. Lihat: rockfoundry list")
        return 1
    print(card)
    return 0


def _cmd_note(args, store: ProjectStore) -> int:
    if store.read_facts(args.slug) is None:
        print(f"Proyek '{args.slug}' gak ketemu. Lihat: rockfoundry list")
        return 1
    store.append_history(args.slug, HistoryEvent(datetime.now(), "note", args.text))
    render_from_store(store, args.slug, date.today())
    print("Catatan disimpan.")
    return 0


def _cmd_doctor(args, store: ProjectStore) -> int:
    cfg = load_config()
    git_version = try_git(["--version"], Path.cwd()) or "TIDAK ADA"
    print(f"git            : {git_version}")
    print(f"GitHub CLI     : {'siap' if GhClient().available() else 'tidak tersedia / belum login'}")
    print(f"claude (narasi): {'ada' if shutil.which('claude') else 'tidak ada'}")
    print(f"Rock Foundry   : {rockfoundry_home()}")
    print(f"Config         : {default_config_path() if cfg else 'belum ada'}")
    for root in cfg.roots if cfg else []:
        print(f"  folder {'ada ' if root.is_dir() else 'HILANG'} {root}")
    return 0


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(prog="rockfoundry", description="Buku proyek buat builder.")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("scan", help="Perbarui kartu semua proyek")
    p.add_argument("--project")
    p.add_argument("--llm", choices=["none", "claude"], default="none")
    p.add_argument("--fetch", action="store_true")
    p.add_argument("--force-narrative", action="store_true")
    p = sub.add_parser("list", help="Daftar proyek")
    p.add_argument("--json", action="store_true")
    p = sub.add_parser("card", help="Tampilkan kartu proyek")
    p.add_argument("slug")
    p = sub.add_parser("note", help="Tambah catatan ke riwayat")
    p.add_argument("slug")
    p.add_argument("text")
    sub.add_parser("doctor", help="Cek kesiapan")
    args = parser.parse_args(argv)
    store = ProjectStore(rockfoundry_home())
    handlers = {
        "scan": _cmd_scan,
        "list": _cmd_list,
        "card": _cmd_card,
        "note": _cmd_note,
        "doctor": _cmd_doctor,
    }
    return handlers[args.command](args, store)


if __name__ == "__main__":
    raise SystemExit(main())
