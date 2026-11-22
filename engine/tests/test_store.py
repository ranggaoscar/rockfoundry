from datetime import datetime

from rockfoundry.store import HistoryEvent, ProjectStore
from samples import bresciahub_like_facts


def test_store_roundtrip_and_history_append(rf_home):
    facts = bresciahub_like_facts()
    s = ProjectStore(rf_home)
    s.write_facts(facts)
    assert s.read_facts(facts.slug) == facts
    s.append_history(facts.slug, HistoryEvent(datetime(2026, 11, 22, 10), "note", "halo"))
    assert s.read_history(facts.slug)[-1].text == "halo"
    s.write_card(facts.slug, "# kartu")
    assert s.read_card(facts.slug) == "# kartu"
    assert s.list_slugs() == ["bresciahub"]


def test_missing_project_reads_none(rf_home):
    s = ProjectStore(rf_home)
    assert s.read_facts("nope") is None and s.read_card("nope") is None
    assert s.read_history("nope") == []
