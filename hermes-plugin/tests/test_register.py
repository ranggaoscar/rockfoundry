from pathlib import Path
from types import SimpleNamespace

from conftest import PLUGIN, load


class FakeCtx:
    def __init__(self):
        self.hooks, self.commands, self.skills, self.tools = {}, {}, {}, {}
        self.llm = SimpleNamespace(complete=lambda **k: SimpleNamespace(text="{}"))

    def register_hook(self, name, fn):
        self.hooks[name] = fn

    def register_tool(self, name, toolset, schema, handler, **kwargs):
        assert schema["name"] == name
        self.tools[name] = handler

    def register_command(self, name, fn, description=""):
        self.commands[name] = fn

    def register_skill(self, name, path, description=""):
        # Mirrors Hermes v0.23: takes a path to SKILL.md and raises if it is not a file.
        path = Path(path)
        if not path.is_file():
            raise FileNotFoundError(f"SKILL.md not found at {path}")
        self.skills[name] = path.read_text(encoding="utf-8")


def plugin():
    mod = load("rockfoundry_plugin", PLUGIN / "__init__.py")
    mod.run_in_background = lambda fn: fn()
    return mod


def test_register_wires_hooks_command_and_skill():
    ctx = FakeCtx()
    plugin().register(ctx)
    assert {"post_tool_call", "on_session_end"} <= set(ctx.hooks)
    assert "project" in ctx.commands
    assert "card.md" in ctx.skills["rockfoundry"]


def test_session_end_refreshes_project_and_logs_history(scanned, rf_home):
    from rockfoundry.store import ProjectStore

    ctx = FakeCtx()
    plugin().register(ctx)
    ctx.hooks["post_tool_call"](
        tool_name="terminal",
        args={"workdir": str(scanned / "HUB")},
        result="",
        task_id="t",
        session_id="s9",
    )
    ctx.hooks["on_session_end"](session_id="s9", completed=True)
    events = ProjectStore(rf_home).read_history("hub")
    assert events and events[-1].kind == "session" and "HUB" in events[-1].text


def test_hooks_never_raise(rf_home):
    ctx = FakeCtx()
    plugin().register(ctx)
    ctx.hooks["post_tool_call"](tool_name="terminal", args=None, session_id=None)
    ctx.hooks["on_session_end"]()


def test_project_command(scanned):
    ctx = FakeCtx()
    plugin().register(ctx)
    assert "hub" in ctx.commands["project"]("")
    assert "Project card" in ctx.commands["project"]("hub")
    assert "not found" in ctx.commands["project"]("nope")
    assert "hermes cron create" in ctx.commands["project"]("schedule")


def test_weekly_job_never_browses_repo_urls():
    cron = plugin().WEEKLY_CRON.lower()
    assert "homepage" not in cron and "browser" not in cron and "screenshot" not in cron


def test_full_refresh_runs_in_background(scanned):
    mod = load("rockfoundry_plugin_bg", PLUGIN / "__init__.py")
    queued = []
    mod.run_in_background = queued.append
    ctx = FakeCtx()
    mod.register(ctx)
    reply = ctx.commands["project"]("refresh")
    assert queued and "Refreshing" in reply


def test_refresh_tool_runs_in_background(scanned):
    import json

    mod = load("rockfoundry_plugin_tool", PLUGIN / "__init__.py")
    queued = []
    mod.run_in_background = queued.append
    ctx = FakeCtx()
    mod.register(ctx)
    out = json.loads(ctx.tools["rockfoundry_refresh_projects"]({"project": "hub"}))
    assert out["status"] == "started" and queued


def test_weekly_job_uses_hermes_tool_not_vendor_cli():
    cron = plugin().WEEKLY_CRON
    assert "rockfoundry_refresh_projects" in cron and "claude" not in cron.lower()


def test_manifest_declares_tool_hooks_and_floor():
    text = (PLUGIN / "plugin.yaml").read_text(encoding="utf-8")
    assert 'requires_hermes: ">=0.23.3"' in text
    assert "rockfoundry_refresh_projects" in text
