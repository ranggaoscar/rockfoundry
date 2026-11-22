"""Small Indonesian formatting helpers shared by badges and cards."""

from __future__ import annotations

from datetime import date

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]


def fmt_date(d: date | None, with_year: bool = False) -> str:
    if d is None:
        return "—"
    text = f"{d.day} {_MONTHS[d.month - 1]}"
    return f"{text} {d.year}" if with_year else text


def ago(d: date | None, today: date) -> str:
    if d is None:
        return "belum ada aktivitas"
    days = (today - d).days
    if days <= 0:
        return "hari ini"
    if days == 1:
        return "kemarin"
    if days < 14:
        return f"{days} hari lalu"
    if days < 60:
        return f"{days // 7} minggu lalu"
    return f"{days // 30} bulan lalu"
