import pytest

pytest.importorskip("fastapi")
from conftest import PLUGIN, load
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    api = load("rockfoundry_api", PLUGIN / "dashboard" / "plugin_api.py")
    app = FastAPI()
    app.include_router(api.router)
    return TestClient(app)


def test_list_sorted_newest_first(scanned, client):
    data = client.get("/projects").json()
    assert [p["slug"] for p in data] == ["hub", "site"]
    assert {
        "slug",
        "name",
        "what_is",
        "activity",
        "live",
        "last_activity",
        "badges",
        "image_url",
        "workdirs",
    } <= set(data[0])
    assert data[0]["workdirs"] == 1


def test_unknown_slug_404(scanned, client):
    assert client.get("/projects/nope").status_code == 404


def test_detail_is_redacted(scanned, client, rf_home):
    from datetime import datetime

    from rockfoundry.store import HistoryEvent, ProjectStore

    ProjectStore(rf_home).append_history("hub", HistoryEvent(datetime.now(), "note", "server 203.0.113.7"))
    body = client.get("/projects/hub").text
    assert "203.0.113.7" not in body and "card_markdown" in body
    assert client.get("/projects/hub").json()["card_path"].endswith("card.md")


def test_setup_requires_existing_folders(rf_home, client, tmp_path):
    assert client.get("/setup").json()["configured"] is False
    assert client.post("/setup", json={"roots": [str(tmp_path / "missing")]}).status_code == 400
    (tmp_path / "ok").mkdir()
    assert client.post("/setup", json={"roots": [str(tmp_path / "ok")]}).status_code == 200
    assert client.get("/setup").json()["configured"] is True


def test_image_404_when_missing(scanned, client):
    assert client.get("/projects/hub/image").status_code == 404


def test_image_returned_as_data_url(scanned, client, rf_home):
    (rf_home / "projects" / "hub" / "image.svg").write_text(
        "<svg xmlns='http://www.w3.org/2000/svg'/>", encoding="utf-8"
    )
    body = client.get("/projects/hub/image").json()
    assert body["data_url"].startswith("data:image/svg+xml;base64,")
    assert client.get("/projects").json()[0]["image_url"] == "/projects/hub/image"
