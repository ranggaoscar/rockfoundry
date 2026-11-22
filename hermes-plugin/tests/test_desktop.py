import json
import re
import shutil
import subprocess
from datetime import date

import pytest
from conftest import PLUGIN
from rockfoundry.card import render_card
from rockfoundry.classify import classify_all, decision_badges, summarize_folders
from samples import bresciahub_like_facts

node = shutil.which("node")


@pytest.mark.skipif(node is None, reason="node not installed")
def test_card_markdown_parses_into_blocks(tmp_path):
    today = date(2026, 11, 22)
    f = classify_all(bresciahub_like_facts(), today, 30)
    md = render_card(f, decision_badges(f, today), summarize_folders(f), None, [], today)
    src = (PLUGIN / "desktop" / "plugin.js").read_text(encoding="utf-8")
    src = re.sub(r"^import .*$", "", src, flags=re.M)
    src = (
        "const host = {}, Button = () => null, ROUTES_AREA = 'r', SIDEBAR_NAV_AREA = 's';\n"
        "const useState = () => [], useEffect = () => {}, useCallback = f => f;\n"
        "const jsx = () => null, jsxs = () => null, Fragment = 'f';\n" + src
    )
    mod = tmp_path / "plugin.mjs"
    mod.write_text(src, encoding="utf-8")
    script = tmp_path / "run.mjs"
    script.write_text(
        f"import {{ parseBlocks }} from {json.dumps(mod.as_uri())};\n"
        f"const md = {json.dumps(md)};\n"
        "const b = parseBlocks(md.split(String.fromCharCode(10)));\n"
        "console.log(JSON.stringify(b.map(x => x.type)));\n",
        encoding="utf-8",
    )
    proc = subprocess.run([node, str(script)], capture_output=True, text=True, encoding="utf-8")
    assert proc.returncode == 0, proc.stderr
    out = proc.stdout
    types = json.loads(out)
    assert types[0] == "h" and "table" in types and "list" in types and types[-1] == "details"
