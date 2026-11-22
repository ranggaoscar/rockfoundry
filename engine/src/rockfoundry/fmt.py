"""Small date helpers shared by badges and cards."""

from __future__ import annotations

from datetime import date

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def fmt_date(d: date | None, with_year: bool = False) -> str:
    if d is None:
        return "—"
    text = f"{d.day} {_MONTHS[d.month - 1]}"
    return f"{text} {d.year}" if with_year else text


def ago(d: date | None, today: date) -> str:
    if d is None:
        return "no activity yet"
    days = (today - d).days
    if days <= 0:
        return "today"
    if days == 1:
        return "yesterday"
    if days < 14:
        return f"{days} days ago"
    if days < 60:
        return f"{days // 7} weeks ago"
    months = days // 30
    return f"{months} month{'s' if months > 1 else ''} ago"
