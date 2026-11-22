from pathlib import Path

from sessions import SessionPaths


def test_collects_paths_from_tool_args():
    s = SessionPaths()
    s.record("s1", "terminal", {"command": "ls", "workdir": "C:/AI PROJECTS/HUB"})
    s.record("s1", "write_file", {"path": "C:/AI PROJECTS/HUB/a.py", "content": "x"})
    s.record("s1", "web_search", {"query": "C:/not/a/path/really"})
    assert s.pop("s1") == {Path("C:/AI PROJECTS/HUB"), Path("C:/AI PROJECTS/HUB/a.py")}
    assert s.pop("s1") == set()


def test_ignores_non_string_args():
    s = SessionPaths()
    s.record("s2", "terminal", {"workdir": None, "cwd": 3})
    assert s.pop("s2") == set()
