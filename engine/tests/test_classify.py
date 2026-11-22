from dataclasses import replace
from datetime import date

from rockfoundry.classify import (
    activity_bucket,
    classify_all,
    classify_workdir,
    decision_badges,
    summarize_folders,
)
from rockfoundry.facts import WorkdirFacts
from samples import bresciahub_like_facts

TODAY = date(2026, 11, 22)


def wf():
    return WorkdirFacts(
        path="x", branch="b", last_commit=TODAY, changed_files=0, in_release=False, in_default=False
    )


def test_live_wins():
    assert classify_workdir(replace(wf(), in_release=True, in_default=True), set(), TODAY, 30) == "live"


def test_merged_by_ancestry():
    assert classify_workdir(replace(wf(), in_default=True), set(), TODAY, 30) == "merged"


def test_squash_merged_via_pr():
    assert classify_workdir(replace(wf(), branch="fix/chat"), {"fix/chat"}, TODAY, 30) == "merged"


def test_hanging_vs_abandoned():
    assert classify_workdir(replace(wf(), last_commit=date(2026, 11, 1)), set(), TODAY, 30) == "hanging"
    assert classify_workdir(replace(wf(), last_commit=date(2026, 10, 1)), set(), TODAY, 30) == "abandoned"


def test_no_commit_is_abandoned():
    assert classify_workdir(replace(wf(), last_commit=None), set(), TODAY, 30) == "abandoned"


def test_activity_buckets():
    assert activity_bucket(date(2026, 11, 15), TODAY) == "active"
    assert activity_bucket(date(2026, 10, 1), TODAY) == "slow"
    assert activity_bucket(date(2026, 8, 31), TODAY) == "sleeping"
    assert activity_bucket(None, TODAY) == "sleeping"


def test_badges():
    badges = decision_badges(bresciahub_like_facts(), TODAY)
    kinds = {b.kind for b in badges}
    assert kinds == {"merged_after_release", "hanging_work", "main_folder_behind", "docs_off_default"}
    merged = next(b for b in badges if b.kind == "merged_after_release")
    assert merged.text == "8 PR baru sejak rilis 15 Nov — udah live belum?"


def test_folder_summary_counts():
    s = summarize_folders(classify_all(bresciahub_like_facts(), TODAY, 30))
    assert (s.total, s.live) == (6, 3) and len(s.tidy) == 2 and len(s.check_first) == 1
    assert len(s.hanging) == 2 and len(s.abandoned) == 1
    assert s.locations == {"C:/AI PROJECTS": 4, "D:/HERMES DESIGN AGENT/working": 2}
