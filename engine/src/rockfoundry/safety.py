"""Safety rules: files Rock Foundry never opens, and text it never writes out."""

from __future__ import annotations

import re
from fnmatch import fnmatch

from rockfoundry.config import DEFAULT_DENY

__all__ = ["DEFAULT_DENY", "is_denied", "redact"]

MASK = "[redacted]"


def is_denied(path: str, patterns: list[str]) -> bool:
    """True when any path segment matches a deny pattern (case-insensitive)."""
    segments = [s for s in re.split(r"[\\/]+", path.lower()) if s]
    lowered = [p.lower() for p in patterns]
    return any(fnmatch(seg, pat) for seg in segments for pat in lowered)


_PATTERNS = [
    re.compile(r"(?i)\b(\w*(?:KEY|TOKEN|SECRET|PASSWORD)\w*)=\S+"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?(?:-----END [A-Z ]*PRIVATE KEY-----|\Z)", re.DOTALL),
    re.compile(r"\beyJ[\w-]+\.[\w-]+\.[\w-]+"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
    re.compile(r"(?i)\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b"),
    re.compile(r"(?i)\b[0-9a-f]{32,}\b"),
]


def redact(text: str) -> str:
    """Mask IP addresses, key-like strings and secret assignments."""
    out = _PATTERNS[0].sub(lambda m: f"{m.group(1)}={MASK}", text)
    for pattern in _PATTERNS[1:]:
        out = pattern.sub(MASK, out)
    return out
