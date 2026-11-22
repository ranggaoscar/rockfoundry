"""Remember which folders each Hermes session touched (hook payloads carry no cwd)."""

from __future__ import annotations

import threading
from pathlib import Path

PATH_KEYS = ("workdir", "cwd", "path", "file_path")


class SessionPaths:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._paths: dict[str, set[Path]] = {}
        self._tools: dict[str, int] = {}

    def record(self, session_id: str | None, tool_name: str | None, args: dict | None) -> None:
        if not session_id or not isinstance(args, dict):
            return
        found = {Path(v) for k, v in args.items() if k in PATH_KEYS and isinstance(v, str) and v.strip()}
        with self._lock:
            self._tools[session_id] = self._tools.get(session_id, 0) + 1
            if found:
                self._paths.setdefault(session_id, set()).update(found)

    def pop(self, session_id: str | None) -> set[Path]:
        with self._lock:
            self._tools.pop(session_id or "", None)
            return self._paths.pop(session_id or "", set())
