from dataclasses import replace
from datetime import date, datetime

import pytest
from rockfoundry.card import render_card
from rockfoundry.classify import classify_all, decision_badges, summarize_folders
from rockfoundry.narrative import Narrative
from rockfoundry.store import HistoryEvent
from samples import bresciahub_like_facts

TODAY = date(2026, 11, 22)
NARR = Narrative(
    "Sistem sales 5 brand batu alam.",
    "Live terakhir 15 Nov.",
    ["Dua zona jangan dicampur."],
    ["Selesaikan paket SEO."],
)


def args(f, narrative=NARR, history=None):
    f = classify_all(f, TODAY, 30)
    return (
        f,
        decision_badges(f, TODAY),
        summarize_folders(f),
        narrative,
        history or [HistoryEvent(datetime(2026, 11, 22, 9), "session", "Hermes benerin chat.")],
    )


@pytest.fixture
def bresciahub_like():
    return args(bresciahub_like_facts())


def test_card_sections_in_order(bresciahub_like):
    md = render_card(*bresciahub_like, today=TODAY)
    order = [
        "## What this is",
        "## Where it stands",
        "## Hanging work",
        "## Folder cleanup",
        "## Do not touch",
        "## Decisions for you",
        "## Opportunities",
        "## History",
        "<summary><b>Technical notes for agents</b>",
    ]
    positions = [md.index(s) for s in order]
    assert positions == sorted(positions)


def test_no_git_jargon_outside_details(bresciahub_like):
    human = render_card(*bresciahub_like, today=TODAY).split("<details>")[0]
    for word in ("worktree", "SHA", "origin/", "merge-base", "HEAD"):
        assert word not in human


def test_key_numbers_present(bresciahub_like):
    md = render_card(*bresciahub_like, today=TODAY)
    assert "15 Nov" in md and "8 PRs" in md and "6 work folders" in md


def test_without_narrative_says_not_summarized():
    md = render_card(*args(bresciahub_like_facts(), narrative=None), today=TODAY)
    assert md.count("Not summarized yet") >= 3


def test_unknown_release_is_honest():
    md = render_card(*args(replace(bresciahub_like_facts(), release=None)), today=TODAY)
    assert "No release recorded yet" in md


def test_gh_unknown_line():
    md = render_card(*args(replace(bresciahub_like_facts(), prs=None)), today=TODAY)
    assert "PR status unknown (GitHub CLI not available)" in md


def test_card_is_redacted():
    f = replace(bresciahub_like_facts(), notes=["server 203.0.113.7 mati"])
    assert "203.0.113.7" not in render_card(*args(f), today=TODAY)
