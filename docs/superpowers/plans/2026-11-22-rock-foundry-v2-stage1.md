# Rock Foundry v2 Stage 1 — Project Memory, Cards and Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `rockfoundry` repo into a read-only project-memory engine (Python CLI) plus a Hermes plugin that shows every project as a gallery tile with a plain-language project card.

**Architecture:** `engine/` is a zero-runtime-dependency Python package that discovers git projects under configured roots, collects facts with read-only git/`gh` calls, optionally asks an LLM for the narrative sections (cached by facts hash), and writes `card.md`/`facts.json`/`history.jsonl` under `~/.rockfoundry/projects/<slug>/`. `hermes-plugin/` wraps the engine: hooks refresh cards after Hermes sessions, a skill tells agents to read cards, slash commands expose them, a FastAPI router serves them, and `desktop/plugin.js` renders the Projects gallery in Hermes Desktop.

**Tech Stack:** Python ≥3.11 (stdlib `tomllib`, `argparse`, `subprocess`, `dataclasses`), pytest, ruff, uv; Hermes plugin API (`plugin.yaml` + `register(ctx)`, FastAPI `APIRouter`), Hermes Desktop Plugin SDK (`@hermes/plugin-sdk`, plain ESM, `react/jsx-runtime`); GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-22-rock-foundry-project-memory-design.md`

## Global Constraints

- Python `requires-python = ">=3.11"`; engine has **no runtime dependencies** (stdlib only). Dev deps: `pytest`, `ruff`.
- Engine never writes inside scanned project folders and only runs read-only git commands: `log`, `worktree list`, `for-each-ref`, `merge-base --is-ancestor`, `rev-list`, `rev-parse`, `status --porcelain --untracked-files=no`, `show <ref>:<path>`, `remote get-url`, `symbolic-ref`. `git fetch` only when `--fetch` is passed.
- Home dir: `$ROCKFOUNDRY_HOME` if set, else `~/.rockfoundry`. Config `config.toml`; per project `projects/<slug>/{card.md,facts.json,narrative.json,history.jsonl}`.
- Config defaults: `scan_depth = 2`, `stale_days = 30`, `release_tags = ["v*", "release-*", "prod-*"]`, `deny = ["*.env", ".env*", "*credential*", "*secret*", "*token*", "*.pem", "*.key", "id_*", "auth.json"]`.
- Workdir statuses (first match): `live` (HEAD in latest release marker) → `merged` (HEAD ancestor of `origin/<default>` or branch has a merged PR) → `hanging` (touched ≤ `stale_days`) → `abandoned`. Tidy-able = `live`/`merged` with 0 changed files; check-first = `live`/`merged` with >0.
- Project activity: `active` ≤7 days, `slow` ≤60 days, `sleeping` >60 days.
- PR lookup limit 200. Narrative input ≤ ~8k tokens per project (cap guide docs at 24,000 characters total), never source code.
- Every string written to `card.md`, `narrative.json` or returned by the plugin API passes through `safety.redact`.
- Human-facing card text is Indonesian, plain language; git terms only inside the `<details>` "Catatan teknis buat agent" block. README.md English, README.id.md Indonesian.
- Nothing is pushed, tagged remotely, or opened as a PR without the owner's explicit OK in chat.
- `IDEA.md` (owner's untracked file) is never touched.
- Scan target: 100 worktrees in < 30 s without narrative.

## Review Focus

- A worktree registered in `git worktree list` whose folder was deleted or moved (prunable) — expect it to be skipped with a note, not a crash. Test in Task 3.
- A repo whose `origin` URL embeds credentials (`https://user:token@github.com/...`) — expect the token never to appear in facts, card or logs. Test in Task 3.
- A repo with no commits yet, or a detached HEAD worktree — expect a card with "belum ada commit"/branch "(detached)", not an exception. Test in Task 4.
- `gh` missing, not logged in, or rate-limited — expect facts from git only and a card line "Status PR belum ketahuan (GitHub CLI tidak tersedia)". Test in Task 4.
- Narrative provider returns non-JSON or times out — expect the card to render with "belum diringkas" sections and no cache write. Test in Task 6.

---

### Task 0: Repo reset to a clean v2 branch

**Files:**
- Delete (from new branch tree): `apps/`, `packages/`, `PRD.md`, `PROJECT_MANIFEST.json`, `DEMO.md`, `README_START_HERE.md`, `product/`, `design/`, `delivery/`, `decisions/`, `technical/`, `deployment/`, `backups/`, `archive/`, `agent/`, `public/`, every file in `docs/` except `docs/superpowers/`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.env.example`, `next.pid`
- Modify: `.gitignore`
- Keep: `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, `.github/` (workflows replaced in Task 12), `docs/superpowers/**`, untracked `IDEA.md`

- [ ] **Step 1: Confirm the only local changes are deletions plus untracked files**

Run: `git status --short | grep -v '^ D' | grep -v '^??'`
Expected: empty output. If anything else shows, stop and report to the owner.

- [ ] **Step 2: Create the archive tag locally (no push)**

Run: `git tag -a legacy/product-studio origin/main -m "Rock Foundry v1: Product Studio, WebMCP, Work OS (archived before v2)"`
Expected: `git show legacy/product-studio --no-patch` prints the tag pointing at `3a83f06`.

- [ ] **Step 3: Restore deleted files and switch to the new branch**

Run: `git restore --worktree --staged -- apps packages` then `git switch -c feat/v2-project-memory origin/main`
Expected: `git status --short` shows only `?? IDEA.md` and `?? docs/superpowers/`.

- [ ] **Step 4: Remove the v1 tree**

Run `git rm -r -q` on every path in the Delete list (use `git ls-files docs | grep -v '^docs/superpowers/'` for the docs files).
Expected: `git ls-files | cut -d/ -f1 | sort -u` lists only `.github`, `.gitignore`, `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE`, `SECURITY.md`.

- [ ] **Step 5: Update `.gitignore`**

Replace contents with entries for: `node_modules/`, `.pnpm-store/`, `.venv/`, `__pycache__/`, `*.pyc`, `.pytest_cache/`, `.ruff_cache/`, `dist/`, `build/`, `*.egg-info/`, `.superpowers/`, `.env*`.

- [ ] **Step 6: Commit**

```bash
git add -A .gitignore docs/superpowers
git commit -m "chore: archive v1 and start Rock Foundry v2 (project memory)"
```

---

### Task 1: Engine package, home dir and config

**Files:**
- Create: `engine/pyproject.toml`, `engine/src/rockfoundry/__init__.py`, `engine/src/rockfoundry/config.py`, `engine/tests/conftest.py`, `engine/tests/test_config.py`

**Interfaces:**
- Produces:
  - `rockfoundry_home() -> Path`
  - `@dataclass ProjectOverride(name: str | None = None, release_tags: list[str] | None = None, homepage: str | None = None)`
  - `@dataclass Config(roots: list[Path], scan_depth: int = 2, stale_days: int = 30, release_tags: list[str] = [...defaults], deny: list[str] = [...defaults], projects: dict[str, ProjectOverride] = {})`
  - `default_config_path() -> Path` (= `rockfoundry_home() / "config.toml"`)
  - `load_config(path: Path | None = None) -> Config | None` (None when file missing)
  - `write_default_config(roots: list[Path], path: Path | None = None) -> Config`
  - `conftest.py` fixture `rf_home(tmp_path, monkeypatch) -> Path` setting `ROCKFOUNDRY_HOME`.

- [ ] **Step 1: Write `pyproject.toml`**

Hatchling build, package `rockfoundry` from `src/`, `requires-python = ">=3.11"`, no dependencies, `[project.scripts] rockfoundry = "rockfoundry.cli:main"`, `[dependency-groups] dev = ["pytest>=8", "ruff>=0.6"]`, ruff `line-length = 100`.

- [ ] **Step 2: Write failing tests**

```python
def test_home_respects_env(rf_home):
    assert rockfoundry_home() == rf_home

def test_load_missing_returns_none(rf_home):
    assert load_config() is None

def test_write_then_load_roundtrip(rf_home, tmp_path):
    cfg = write_default_config([tmp_path / "A", Path("D:/HERMES DESIGN AGENT/working")])
    loaded = load_config()
    assert loaded.roots == cfg.roots
    assert loaded.scan_depth == 2 and loaded.stale_days == 30
    assert "*credential*" in loaded.deny and "prod-*" in loaded.release_tags

def test_project_override_parsed(rf_home):
    default_config_path().write_text(
        'roots = ["C:/AI PROJECTS"]\n[projects.bresciahub]\nname = "BresciaHub"\n'
        'release_tags = ["prod-*"]\nhomepage = "https://bresciahub.id"\n', encoding="utf-8")
    cfg = load_config()
    assert cfg.projects["bresciahub"].release_tags == ["prod-*"]
    assert cfg.projects["bresciahub"].homepage == "https://bresciahub.id"
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `uv run --project engine pytest engine/tests/test_config.py -v`
Expected: FAIL (ImportError).

- [ ] **Step 4: Implement `config.py`**

Read with `tomllib`; write TOML by hand (strings via `json.dumps` for quoting, forward-slash paths). Create parent dirs on write.

- [ ] **Step 5: Run tests to verify they pass**

Run: `uv run --project engine pytest engine/tests/test_config.py -v`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add engine
git commit -m "feat(engine): add package skeleton and config"
```

---

### Task 2: Safety — deny-list and redaction

**Files:**
- Create: `engine/src/rockfoundry/safety.py`, `engine/tests/test_safety.py`

**Interfaces:**
- Produces: `is_denied(path: str, patterns: list[str]) -> bool` (case-insensitive `fnmatch` on the basename **and** on each path segment); `redact(text: str) -> str`.

- [ ] **Step 1: Write failing tests**

```python
@pytest.mark.parametrize("p", ["gcp-credentials.json", "youtube_token.json", ".env.production",
                               "apps/api/.env", "certs/server.KEY", "id_ed25519", "auth.json"])
def test_denied(p): assert is_denied(p, DEFAULT_DENY)

@pytest.mark.parametrize("p", ["README.md", "docs/PRODUCTION-BASELINE.md", "AGENTS.md"])
def test_allowed(p): assert not is_denied(p, DEFAULT_DENY)

def test_redacts_ipv4(): assert "203.0.113.7" not in redact("host 203.0.113.7 ok")
def test_redacts_keys():
    out = redact("sk-abc123def456ghi789 ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 AKIAABCDEFGHIJKLMNOP")
    assert "sk-abc" not in out and "ghp_" not in out and "AKIA" not in out
def test_redacts_assignments(): assert redact("JWT_SECRET=hunter2") == "JWT_SECRET=[disensor]"
def test_redacts_jwt_and_long_hex():
    assert "eyJ" not in redact("token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc")
    assert "8e0bc272" not in redact("sha256:8e0bc272fff56ba0a8b432d0be1335c25af34c84f907dd05f916262763dcbbcf")
def test_keeps_dates_and_versions(): assert redact("v0.5 rilis 15 Nov 2026, PR 23") == "v0.5 rilis 15 Nov 2026, PR 23"
```

- [ ] **Step 2: Run to verify failure** — `uv run --project engine pytest engine/tests/test_safety.py -v` → FAIL.

- [ ] **Step 3: Implement `safety.py`**

`DEFAULT_DENY` re-exported from `config`. Replacement token is `[disensor]`. Patterns: IPv4, IPv6 (≥3 groups), `sk-[A-Za-z0-9_-]{16,}`, `gh[pousr]_[A-Za-z0-9]{20,}`, `AKIA[0-9A-Z]{16}`, JWT `eyJ[\w-]+\.[\w-]+\.[\w-]+`, hex `\b[0-9a-f]{32,}\b`, and `(\w*(KEY|TOKEN|SECRET|PASSWORD)\w*)=\S+` → `\1=[disensor]` (case-insensitive).

- [ ] **Step 4: Run to verify pass** — all pass.

- [ ] **Step 5: Commit** — `git commit -m "feat(engine): add deny-list and redaction"`

---

### Task 3: Git helper and project discovery

**Files:**
- Create: `engine/src/rockfoundry/gitutil.py`, `engine/src/rockfoundry/discover.py`, `engine/tests/gitfixtures.py`, `engine/tests/test_discover.py`

**Interfaces:**
- Consumes: `Config` (Task 1).
- Produces:
  - `class GitError(Exception)`; `git(args: list[str], cwd: Path, timeout: float = 30) -> str` (stripped stdout; raises `GitError` on non-zero; sets `GIT_TERMINAL_PROMPT=0`, `LC_ALL=C`).
  - `normalize_remote(url: str | None) -> str | None` → `"github.com/owner/repo"` (lowercase, no scheme/credentials/`.git`; handles `git@github.com:owner/repo.git`).
  - `@dataclass Workdir(path: Path, branch: str | None, detached: bool)`
  - `@dataclass Project(slug: str, name: str, remote: str | None, main_path: Path, workdirs: list[Workdir], notes: list[str])`
  - `discover_projects(cfg: Config) -> list[Project]` sorted by slug.
  - Test helper `gitfixtures.make_repo(path: Path, remote: str | None = None, commits: int = 1) -> Path`, `add_worktree(repo: Path, path: Path, branch: str) -> Path`, `commit(repo: Path, message: str, date: str | None = None) -> str`.

- [ ] **Step 1: Write failing tests**

```python
def test_normalize_remote_variants():
    assert normalize_remote("https://user:tok@github.com/Ranggaoscar/BresciaHub.git") == "github.com/ranggaoscar/bresciahub"
    assert normalize_remote("git@github.com:ranggaoscar/bresciahub.git") == "github.com/ranggaoscar/bresciahub"
    assert normalize_remote(None) is None

def test_worktrees_grouped_into_one_project(tmp_path, rf_home):
    main = make_repo(tmp_path / "root1" / "HUB", remote="https://github.com/o/hub.git")
    add_worktree(main, tmp_path / "root1" / "HUB-FEATURE", "feat/a")
    add_worktree(main, tmp_path / "elsewhere" / "hub-x", "feat/b")   # outside roots
    other = make_repo(tmp_path / "root1" / "SITE", remote="git@github.com:o/site.git")
    cfg = Config(roots=[tmp_path / "root1"])
    projects = discover_projects(cfg)
    assert [p.slug for p in projects] == ["hub", "site"]
    assert len(projects[0].workdirs) == 3

def test_clone_of_same_remote_joins_project(tmp_path, rf_home): ...  # second clone, same remote → still one project, 2 workdirs

def test_no_remote_uses_folder_name(tmp_path, rf_home): ...          # slug "my-tool" from folder "My Tool"

def test_prunable_worktree_skipped_with_note(tmp_path, rf_home):
    main = make_repo(tmp_path / "r" / "HUB", remote="https://github.com/o/hub.git")
    wt = add_worktree(main, tmp_path / "r" / "HUB-GONE", "feat/gone")
    shutil.rmtree(wt)
    p = discover_projects(Config(roots=[tmp_path / "r"]))[0]
    assert all(w.path != wt for w in p.workdirs)
    assert any("HUB-GONE" in n for n in p.notes)

def test_credentials_never_kept(tmp_path, rf_home):
    make_repo(tmp_path / "r" / "HUB", remote="https://user:secret123@github.com/o/hub.git")
    p = discover_projects(Config(roots=[tmp_path / "r"]))[0]
    assert "secret123" not in repr(p)

def test_non_git_folders_ignored(tmp_path, rf_home): ...             # plain folder → no project
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement `gitutil.py` and `discover.py`**

Walk each root to `scan_depth` (skip `node_modules`, `.git`, `.venv`); a folder counts when `.git` exists (dir or file). For each, `git rev-parse --git-common-dir` → group key = normalized remote, else resolved common dir. Within a group, `main_path` = folder whose `.git` is a directory (prefer the one whose common dir is its own); then add every entry of `git worktree list --porcelain` from `main_path` (dedupe by resolved path; missing folder → note `"Folder kerja hilang: <name>"`). Slug = last path segment of the normalized remote (or folder name), lowercased, non-alphanumerics → `-`, de-duplicated with `-2`. Name = override name, else repo/folder name as written.

- [ ] **Step 4: Run to verify pass.**

- [ ] **Step 5: Commit** — `git commit -m "feat(engine): discover projects and group worktrees"`

---

### Task 4: Facts collection (git + optional gh)

**Files:**
- Create: `engine/src/rockfoundry/gh.py`, `engine/src/rockfoundry/facts.py`, `engine/tests/test_facts.py`

**Interfaces:**
- Consumes: `git`, `Project`, `Workdir`, `Config`, `is_denied`.
- Produces:
  - `@dataclass PullRequest(number: int, title: str, branch: str, state: str, merged_at: date | None)`
  - `class GhClient`: `available() -> bool`, `pull_requests(repo: str, limit: int = 200) -> list[PullRequest]`, `homepage(repo: str) -> str | None`. Fake for tests: `FakeGh(prs: list[PullRequest], homepage: str | None = None, ok: bool = True)` in `tests/fakes.py`.
  - `@dataclass ReleaseMarker(name: str, date: date, commit: str)`
  - `@dataclass WorkdirFacts(path: str, branch: str, last_commit: date | None, changed_files: int, in_release: bool, in_default: bool, status: str = "")`
  - `@dataclass ProjectFacts(schema_version: int, slug: str, name: str, remote: str | None, default_branch: str | None, first_commit: date | None, commit_count: int, last_activity: date | None, release: ReleaseMarker | None, prs: list[PullRequest] | None, workdirs: list[WorkdirFacts], main_behind: int, main_ahead: int, guide_docs: dict[str, str], guide_docs_off_default: list[str], homepage: str | None, notes: list[str])` — `prs is None` means "GitHub status unknown". `guide_docs` maps doc path → text (deny-list applied, total ≤ 24,000 chars). `schema_version = 1`.
  - `collect_facts(project: Project, cfg: Config, gh: GhClient | None, fetch: bool = False) -> ProjectFacts`
  - `facts_to_dict(f: ProjectFacts) -> dict` / `facts_from_dict(d: dict) -> ProjectFacts` (dates as ISO strings).

- [ ] **Step 1: Write failing tests** (fixture repos from Task 3 helpers, fixed commit dates)

```python
def test_basic_facts(hub_project, rf_cfg):
    f = collect_facts(hub_project, rf_cfg, gh=None)
    assert f.default_branch == "main" and f.commit_count == 3
    assert f.first_commit == date(2026, 6, 13) and f.prs is None

def test_release_marker_from_tag(hub_with_prod_tag, rf_cfg):
    f = collect_facts(hub_with_prod_tag, rf_cfg, gh=None)
    assert f.release.name == "prod-internal-p2" and f.release.date == date(2026, 11, 15)
    assert [w.in_release for w in f.workdirs if w.branch == "release/p2"] == [True]

def test_dirty_count(hub_with_dirty_worktree, rf_cfg):
    assert max(w.changed_files for w in collect_facts(hub_with_dirty_worktree, rf_cfg, None).workdirs) == 2

def test_guide_docs_found_off_default(hub_with_baseline_branch, rf_cfg):
    f = collect_facts(hub_with_baseline_branch, rf_cfg, None)
    assert "AGENTS.md" in f.guide_docs
    assert "docs/PRODUCTION-BASELINE.md" in f.guide_docs_off_default

def test_denied_doc_never_read(hub_with_env_in_docs, rf_cfg):
    f = collect_facts(hub_with_env_in_docs, rf_cfg, None)
    assert not any(is_denied(p, rf_cfg.deny) for p in f.guide_docs)

def test_gh_unavailable_keeps_prs_none(hub_project, rf_cfg):
    assert collect_facts(hub_project, rf_cfg, FakeGh([], ok=False)).prs is None

def test_empty_repo_and_detached(empty_repo_project, detached_project, rf_cfg):
    assert collect_facts(empty_repo_project, rf_cfg, None).commit_count == 0
    assert any(w.branch == "(detached)" for w in collect_facts(detached_project, rf_cfg, None).workdirs)

def test_dict_roundtrip(hub_project, rf_cfg):
    f = collect_facts(hub_project, rf_cfg, None)
    assert facts_from_dict(json.loads(json.dumps(facts_to_dict(f)))) == f
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement `gh.py` and `facts.py`**

`GhClient` shells out to `gh pr list --repo <owner/repo> --state all --limit 200 --json number,title,headRefName,state,mergedAt` and `gh repo view <owner/repo> --json homepageUrl`; `available()` = `gh auth status` exit 0; any failure → treat as unavailable. Default branch: `git symbolic-ref --short refs/remotes/origin/HEAD` → strip `origin/`, fallback `main`/`master` if present. Release marker: newest (by creator date) tag matching override or `cfg.release_tags`. `in_release`/`in_default` via `merge-base --is-ancestor`. Guide docs read with `git show <ref>:<path>` from `origin/<default>` (fallback local default), for `AGENTS.md`, `CLAUDE.md`, `README.md`, and `docs/` files matching `PRODUCTION*`, `DEPLOY*`, `RELEASE*` (case-insensitive); same docs found only on other branches (`for-each-ref refs/heads refs/remotes` + `git ls-tree`) go into `guide_docs_off_default`. Run per-workdir git calls in a `ThreadPoolExecutor(max_workers=8)`.

- [ ] **Step 4: Run to verify pass.**

- [ ] **Step 5: Commit** — `git commit -m "feat(engine): collect project facts from git and gh"`

---

### Task 5: Classification and decision badges

**Files:**
- Create: `engine/src/rockfoundry/classify.py`, `engine/tests/test_classify.py`

**Interfaces:**
- Consumes: `ProjectFacts`, `WorkdirFacts`, `PullRequest`.
- Produces:
  - `classify_workdir(w: WorkdirFacts, merged_branches: set[str], today: date, stale_days: int) -> str` → `"live" | "merged" | "hanging" | "abandoned"`
  - `classify_all(f: ProjectFacts, today: date, stale_days: int) -> ProjectFacts` (returns copy with each `status` set)
  - `activity_bucket(last: date | None, today: date) -> str` → `"active" | "slow" | "sleeping"`
  - `@dataclass Badge(kind: str, text: str)`; `decision_badges(f: ProjectFacts, today: date) -> list[Badge]`
  - `@dataclass FolderSummary(total: int, live: int, tidy: list[str], check_first: list[str], hanging: list[str], abandoned: list[str], locations: dict[str, int])`; `summarize_folders(f: ProjectFacts) -> FolderSummary`

- [ ] **Step 1: Write failing tests**

```python
TODAY = date(2026, 11, 22)
def wf(): return WorkdirFacts(path="x", branch="b", last_commit=TODAY, changed_files=0, in_release=False, in_default=False)

def test_live_wins(): assert classify_workdir(replace(wf(), in_release=True, in_default=True), set(), TODAY, 30) == "live"
def test_squash_merged_via_pr(): assert classify_workdir(replace(wf(), branch="fix/chat"), {"fix/chat"}, TODAY, 30) == "merged"
def test_hanging_vs_abandoned():
    assert classify_workdir(replace(wf(), last_commit=date(2026, 11, 1)), set(), TODAY, 30) == "hanging"
    assert classify_workdir(replace(wf(), last_commit=date(2026, 10, 1)), set(), TODAY, 30) == "abandoned"
def test_activity_buckets():
    assert activity_bucket(date(2026, 11, 15), TODAY) == "active"
    assert activity_bucket(date(2026, 10, 1), TODAY) == "slow"
    assert activity_bucket(date(2026, 8, 31), TODAY) == "sleeping"
def test_badges():
    # release 2026-11-15, 8 PRs merged 21–22 Nov, main_behind 210, baseline doc only off default
    kinds = {b.kind for b in decision_badges(bresciahub_like_facts(), TODAY)}
    assert kinds == {"merged_after_release", "hanging_work", "main_folder_behind", "docs_off_default"}
def test_folder_summary_counts():
    s = summarize_folders(classify_all(bresciahub_like_facts(), TODAY, 30))
    assert (s.total, s.live) == (6, 3) and len(s.tidy) == 2 and len(s.check_first) == 1
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** — `merged_branches` = branches of PRs with `state == "MERGED"`; `main_folder_behind` when `main_behind > 50`; `hanging_work` when any `hanging`; badge texts in Indonesian (e.g. `"8 PR baru sejak rilis 15 Nov — udah live belum?"`).
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(engine): classify work folders and derive badges"`

---

### Task 6: Narrative providers and cache

**Files:**
- Create: `engine/src/rockfoundry/narrative.py`, `engine/tests/test_narrative.py`

**Interfaces:**
- Consumes: `ProjectFacts`, `facts_to_dict`, `redact`.
- Produces:
  - `@dataclass Narrative(what_is: str, position: str, do_not_touch: list[str], opportunities: list[str])`
  - `NarrativeProvider = Callable[[str], str]` (prompt → raw model text)
  - `make_provider(name: str) -> NarrativeProvider | None` — `"none"` → None; `"claude"` → runs `claude -p <prompt> --output-format text`; `"codex"` → runs `codex exec <prompt>`; timeout 180 s.
  - `build_prompt(f: ProjectFacts) -> str`
  - `facts_hash(f: ProjectFacts) -> str` (sha256 of `json.dumps(facts_to_dict(f), sort_keys=True)`)
  - `get_narrative(f: ProjectFacts, provider: NarrativeProvider | None, cache_path: Path, force: bool = False) -> Narrative | None`

- [ ] **Step 1: Write failing tests**

```python
def test_none_provider_returns_none(tmp_path, facts): assert get_narrative(facts, None, tmp_path / "n.json") is None
def test_valid_json_parsed_and_cached(tmp_path, facts):
    calls = []
    def prov(p): calls.append(p); return '```json\n{"what_is":"x","position":"y","do_not_touch":["a"],"opportunities":["b"]}\n```'
    n1 = get_narrative(facts, prov, tmp_path / "n.json"); n2 = get_narrative(facts, prov, tmp_path / "n.json")
    assert n1 == n2 == Narrative("x", "y", ["a"], ["b"]) and len(calls) == 1
def test_cache_invalidated_when_facts_change(tmp_path, facts): ...   # replace(facts, commit_count=+1) → second call
def test_bad_json_not_cached(tmp_path, facts):
    assert get_narrative(facts, lambda p: "sorry", tmp_path / "n.json") is None
    assert not (tmp_path / "n.json").exists()
def test_provider_timeout_returns_none(tmp_path, facts):
    def boom(p): raise subprocess.TimeoutExpired("claude", 180)
    assert get_narrative(facts, boom, tmp_path / "n.json") is None
def test_prompt_has_no_code_and_is_redacted(facts_with_ip_in_docs):
    p = build_prompt(facts_with_ip_in_docs)
    assert "203.0.113.7" not in p and "Jangan pernah menyalin alamat server" in p
def test_output_redacted(tmp_path, facts):
    n = get_narrative(facts, lambda p: '{"what_is":"server 10.0.0.5","position":"","do_not_touch":[],"opportunities":[]}', tmp_path / "n.json")
    assert "10.0.0.5" not in n.what_is
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** — prompt (Indonesian) asks for one JSON object with exactly those four keys; plain language for a non-programmer owner; `do_not_touch` from guide docs only; `opportunities` 3–5 items from facts/docs only and must not claim competitor research; explicit line `"Jangan pernah menyalin alamat server, kredensial, atau path rahasia."`. Strip code fences, `json.loads`, validate types, redact every string, write cache `{"hash": ..., "narrative": {...}}`.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(engine): add optional cached narrative"`

---

### Task 7: Card rendering and store

**Files:**
- Create: `engine/src/rockfoundry/card.py`, `engine/src/rockfoundry/store.py`, `engine/tests/test_card.py`, `engine/tests/test_store.py`, `docs/card-format.md`

**Interfaces:**
- Consumes: Tasks 4–6 types, `redact`.
- Produces:
  - `@dataclass HistoryEvent(at: datetime, kind: str, text: str)` — kinds: `"session"`, `"release"`, `"pr_merged"`, `"note"`, `"scan"`.
  - `class ProjectStore(home: Path)`: `project_dir(slug) -> Path`, `write_facts(f)`, `read_facts(slug) -> ProjectFacts | None`, `write_card(slug, text)`, `read_card(slug) -> str | None`, `narrative_path(slug) -> Path`, `append_history(slug, e)`, `read_history(slug, limit: int = 50) -> list[HistoryEvent]`, `list_slugs() -> list[str]`.
  - `render_card(f: ProjectFacts, badges: list[Badge], folders: FolderSummary, narrative: Narrative | None, history: list[HistoryEvent], today: date) -> str`

- [ ] **Step 1: Write failing tests**

```python
def test_card_sections_in_order(bresciahub_like):
    md = render_card(*bresciahub_like, today=date(2026, 11, 22))
    order = ["## Apa ini", "## Posisi sekarang", "## Lagi menggantung", "## Rapihin folder",
             "## Jangan disentuh", "## Perlu lu putusin", "## Peluang", "## Riwayat singkat",
             "<summary><b>Catatan teknis buat agent</b>"]
    assert [md.index(s) for s in order] == sorted(md.index(s) for s in order)

def test_no_git_jargon_outside_details(bresciahub_like):
    md = render_card(*bresciahub_like, today=date(2026, 11, 22))
    human = md.split("<details>")[0]
    for word in ("worktree", "SHA", "origin/", "merge-base", "HEAD"):
        assert word not in human

def test_without_narrative_says_belum_diringkas(bresciahub_like_no_narrative):
    md = render_card(*bresciahub_like_no_narrative, today=date(2026, 11, 22))
    assert md.count("belum diringkas") >= 3

def test_unknown_release_is_honest(facts_without_release):
    assert "Belum ada rilis tercatat" in render_card(*facts_without_release, today=date(2026, 11, 22))

def test_gh_unknown_line(facts_prs_none):
    assert "Status PR belum ketahuan (GitHub CLI tidak tersedia)" in render_card(*facts_prs_none, today=date(2026, 11, 22))

def test_card_is_redacted(facts_with_ip_in_notes):
    assert "203.0.113.7" not in render_card(*facts_with_ip_in_notes, today=date(2026, 11, 22))

def test_store_roundtrip_and_history_append(rf_home, facts):
    s = ProjectStore(rf_home); s.write_facts(facts)
    assert s.read_facts(facts.slug) == facts
    s.append_history(facts.slug, HistoryEvent(datetime(2026, 11, 22, 10), "note", "halo"))
    assert s.read_history(facts.slug)[-1].text == "halo"
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** — layout and wording follow the 22 Nov BresciaHub draft (header blockquote "Disusun otomatis oleh Rock Foundry · <tanggal>"; "Posisi sekarang" table; "Lagi menggantung" table grouped by date; folder summary bullets; "Peluang" prefixed with the note "Disusun dari catatan proyek saja. Belum ada riset kompetitor."). Writes are atomic (`.tmp` + `os.replace`). `docs/card-format.md` documents the sections and `facts.json` schema v1.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(engine): render project cards and persist them"`

---

### Task 8: Scan orchestration and CLI

**Files:**
- Create: `engine/src/rockfoundry/scan.py`, `engine/src/rockfoundry/cli.py`, `engine/tests/test_scan.py`, `engine/tests/test_cli.py`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `@dataclass ScanResult(slug: str, name: str, ok: bool, error: str | None, seconds: float)`
  - `scan(cfg: Config, store: ProjectStore, only: str | None = None, provider: NarrativeProvider | None = None, gh: GhClient | None = None, fetch: bool = False, today: date | None = None) -> list[ScanResult]` — one project failing never stops the others; appends `"release"` and `"pr_merged"` history events when newly seen since the previous `facts.json`.
  - `find_project_for_path(path: Path, store: ProjectStore) -> str | None` (slug whose any workdir contains `path`).
  - `main(argv: list[str] | None = None) -> int` with subcommands `scan [--project] [--llm none|claude|codex] [--fetch] [--force-narrative]`, `list [--json]`, `card SLUG`, `note SLUG TEXT`, `doctor`. Missing config on `scan` → interactive prompt for roots when stdin is a TTY, else exit 2 with `"Belum ada config. Jalankan: rockfoundry scan (di terminal) untuk memilih folder."`.

- [ ] **Step 1: Write failing tests**

```python
def test_scan_writes_cards_and_leaves_repos_untouched(tmp_path, rf_home, two_projects_cfg):
    before = repo_status_snapshot(two_projects_cfg.roots)
    res = scan(two_projects_cfg, ProjectStore(rf_home), today=date(2026, 11, 22))
    assert all(r.ok for r in res) and len(res) == 2
    assert (rf_home / "projects" / "hub" / "card.md").exists()
    assert repo_status_snapshot(two_projects_cfg.roots) == before

def test_one_broken_project_does_not_stop_scan(...): ...   # corrupt one .git → ok False for it, True for other
def test_new_release_appends_history(...): ...             # scan, add tag, scan → "release" event
def test_find_project_for_path(...): ...                   # nested path inside a worktree → slug
def test_cli_list_json(capsys, ...): assert json.loads(out)[0]["slug"] == "hub"
def test_cli_scan_without_config_non_tty(...): assert main(["scan"]) == 2
def test_cli_never_prints_remote_credentials(...): ...     # remote with token → absent from all CLI output
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** — `argparse`; `doctor` prints git version, gh availability, config path, roots that exist/missing, and whether `claude`/`codex` are on PATH.
- [ ] **Step 4: Run full engine suite** — `uv run --project engine pytest engine -q` → all pass; `uv run --project engine ruff check engine` → no errors.
- [ ] **Step 5: Commit** — `git commit -m "feat(engine): add scan orchestration and CLI"`

---

### Task 9: Read-only check on the owner's real projects

**Files:** none committed (results reported in chat).

- [ ] **Step 1: Snapshot repos** — for every folder under `C:/AI PROJECTS` and `D:/HERMES DESIGN AGENT/working` that has `.git`: record `git status --porcelain` output to a scratch file.
- [ ] **Step 2: Run** `ROCKFOUNDRY_HOME=<scratch>/rf uv run --project engine rockfoundry scan` with a config whose roots are those two folders.
  Expected: finishes; BresciaHub < 30 s; `list` shows BresciaHub, Aletra Digital, Virtual Stone Showroom, Rock Foundry, Brescia Academy, Brescia Bali Project Operations, Trading Desk.
- [ ] **Step 3: Compare BresciaHub card with the 22 Nov draft** — 100 work folders, release 15 Nov, folder counts consistent with the draft after PR-based merges are applied; differences explained in chat.
- [ ] **Step 4: Re-snapshot and diff** — Expected: identical to Step 1.
- [ ] **Step 5: Grep outputs for secrets** — grep `<scratch>/rf` for the owner's real server addresses, `ghp_` and `sk-` → no matches.

---

### Task 10: Hermes plugin — agent side and API

**Files:**
- Create: `hermes-plugin/plugin.yaml`, `hermes-plugin/__init__.py`, `hermes-plugin/sessions.py`, `hermes-plugin/plugin_api.py`, `hermes-plugin/skills/rockfoundry/SKILL.md`, `hermes-plugin/tests/test_sessions.py`, `hermes-plugin/tests/test_api.py`

**Interfaces:**
- Consumes: `load_config`, `scan`, `ProjectStore`, `find_project_for_path`, `HistoryEvent`, `make_provider`.
- Produces:
  - `sessions.SessionPaths`: `record(session_id: str, tool_name: str, args: dict) -> None` (collects `workdir`, `cwd`, `path`, `file_path` string args), `pop(session_id: str) -> set[Path]`.
  - `register(ctx)`: `ctx.register_hook("post_tool_call", ...)`, `ctx.register_hook("on_session_end", ...)`, `ctx.register_skill("rockfoundry", <SKILL.md text>)`, `ctx.register_command("proyek", ...)` handling `""` (list), `<name>` (card), `refresh [name]`, `jadwal` (creates weekly Hermes cron running `rockfoundry scan --llm` via the documented cron API; asks for confirmation first).
  - Narrative inside Hermes: provider = `lambda prompt: ctx.llm.complete(messages=[{"role": "user", "content": prompt}], max_tokens=1200).text`.
  - `plugin_api.router` (FastAPI `APIRouter`): `GET /projects` → `[{slug, name, what_is, activity, live, last_activity, badges, image_url}]` sorted by `last_activity` desc; `GET /projects/{slug}` → `{facts, card_markdown, narrative, history}`; `POST /projects/{slug}/refresh` → `ScanResult`; `GET /projects/{slug}/image` → image bytes or 404; `GET /setup` / `POST /setup {roots: [str]}` for first run.

- [ ] **Step 1: Write failing tests** — `SessionPaths` collects `workdir` from a `terminal` call and `path` from a file tool, ignores non-path args, `pop` clears; API tests with FastAPI `TestClient` against a temp `ROCKFOUNDRY_HOME` populated by `scan` (skip API tests if `fastapi` missing, since Hermes provides it at runtime): list sorted newest first, unknown slug → 404, every string in responses passes `redact` (inject an IP into a note; assert absent).
- [ ] **Step 2: Run to verify failure** — `uv run --project engine --with fastapi --with httpx pytest hermes-plugin/tests -v`.
- [ ] **Step 3: Implement.** On `on_session_end`: `paths = session_paths.pop(session_id)`; slugs = `{find_project_for_path(p) for p in paths} - {None}`; for each slug run `scan(only=slug, provider=None)` in a background thread, then append `HistoryEvent(kind="session", text=<one-sentence summary via ctx.llm>)`; never raise out of a hook (log and continue). `plugin.yaml`: name `rockfoundry`, version `2.0.0`, hooks `post_tool_call`, `on_session_end`, `python_dependencies: ["rockfoundry @ git+https://github.com/ranggaoscar/rockfoundry#subdirectory=engine"]`. `SKILL.md`: before working in a project folder, read `~/.rockfoundry/projects/<slug>/card.md` (find slug with `rockfoundry list --json`), obey "Jangan disentuh" and the technical notes; never edit the card.
- [ ] **Step 4: Run tests to verify pass, then** `hermes plugins validate hermes-plugin` → no errors.
- [ ] **Step 5: Commit** — `git commit -m "feat(plugin): add Hermes hooks, skill, command and API"`

---

### Task 11: Hermes Desktop Projects page (gallery + project page)

**Files:**
- Create: `hermes-plugin/desktop/plugin.js`, `hermes-plugin/desktop/README.md`

**Interfaces:**
- Consumes: plugin API from Task 10 via the SDK's scoped REST client (`ctx.rest`) at `/api/plugins/rockfoundry/*`.
- Produces: plugin id `rockfoundry`; route `/projects` (`ROUTES_AREA`) + sidebar nav (`SIDEBAR_NAV_AREA`, label `Projects`, codicon `library`).

- [ ] **Step 1: Verify SDK calls against the installed docs** — in `%LOCALAPPDATA%/hermes/hermes-agent/website/docs/developer-guide/desktop-plugin-sdk.md` confirm: `ctx.registerMany`, `ROUTES_AREA`, `SIDEBAR_NAV_AREA`, `ctx.rest`, `host.navigate`, the UI kit components, and how to start a new chat with a cwd and a first message (`session.new` / `host.request`). Note the exact calls at the top of `desktop/README.md`. If no API starts a chat with a message, buttons copy the prompt to the clipboard, open a new chat, and show a toast "Prompt udah dicopy, tinggal paste".
- [ ] **Step 2: Implement the page** — states: first run (folder picker posting `/setup`), loading, empty ("Belum ada proyek. Pilih folder proyek lu."), gallery, project page. Gallery: responsive grid (min tile 220 px), tile = image (`/projects/{slug}/image`, fallback initials), name, `what_is` one line, status dot (`active` green, `slow` gray, `sleeping` muted) + "aktif hari ini / N hari lalu", badge "N perlu diputusin" when badges exist; sorted as the API returns. Project page: header (image, name, what_is, start date, agents seen in history), three stat tiles (Live terakhir, Menggantung, Bisa diberesin), card sections rendered from markdown with the technical `<details>` collapsed, buttons **Lanjutin**, **Brainstorm**, and **Kerjain** per opportunity; a **Refresh** action calling `POST /refresh`. Use the SDK UI kit and theme variables only; no hard-coded colors.
- [ ] **Step 3: Manual check in Hermes Desktop** — copy/symlink `hermes-plugin` into `$HERMES_HOME/plugins/rockfoundry`, open Hermes Desktop → Capabilities → Plugins → enable; Projects appears in the sidebar; gallery shows the owner's projects; opening BresciaHub shows the card; Lanjutin opens a chat in the BresciaHub folder with the card context. Take screenshots for the README (`docs/images/gallery.png`, `docs/images/project.png`) with private numbers acceptable but no IPs.
- [ ] **Step 4: Commit** — `git commit -m "feat(plugin): add Projects gallery to Hermes Desktop"`

---

### Task 12: Tile images (logo and live screenshot)

**Files:**
- Create: `engine/src/rockfoundry/images.py`, `engine/tests/test_images.py`
- Modify: `engine/src/rockfoundry/scan.py` (call `find_logo` on every scan), `hermes-plugin/__init__.py` (screenshot during `/proyek jadwal` runs)

**Interfaces:**
- Produces: `find_logo(f: ProjectFacts, main_path: Path) -> Path | None` — first existing of `logo.svg|png`, `public/favicon.svg|png|ico`, `assets/logo*`, `apps/*/public/favicon.*`, `apps/*/public/logo*` read via `git show origin/<default>:<path>` and copied to `projects/<slug>/image.<ext>`; `save_screenshot(slug: str, png: bytes, store: ProjectStore) -> Path` writing `image-live.png`. API `/image` prefers `image-live.png`, then logo, else 404.

- [ ] **Step 1: Failing tests** — logo found in `public/favicon.svg` and copied; none → None; screenshot preferred over logo by the API.
- [ ] **Step 2: Implement** — screenshot: during the weekly job, for projects with `homepage`, the plugin asks Hermes's browser tool to open the URL and capture a 1280×800 PNG; any failure is logged and skipped.
- [ ] **Step 3: Run tests, commit** — `git commit -m "feat: add tile images from logo or live screenshot"`

---

### Task 13: README, docs and CI

**Files:**
- Create: `README.md` (rewrite), `README.id.md`, `docs/safety.md`, `.github/workflows/ci.yml`
- Modify: `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`
- Delete: old workflow files in `.github/workflows/` that reference pnpm/Next.js

- [ ] **Step 1: README.md (English)** — sections: one-line pitch ("A project memory for builders who work with AI agents — Hermes does the work, Rock Foundry remembers it."), gallery screenshot, why (forgetting across many agent work folders), what a card contains, how it works (facts without AI, optional cached narrative, read-only, deny-list), install (`uv tool install "git+https://github.com/ranggaoscar/rockfoundry#subdirectory=engine"`, then `hermes plugins install` from the repo's `hermes-plugin`), CLI usage, roadmap (4 stages), "Looking for v1 (Product Studio)? See tag `legacy/product-studio`.", license MIT. No link to `foundry.rockbase.web.id`.
- [ ] **Step 2: README.id.md** — same content in Indonesian.
- [ ] **Step 3: docs/safety.md** — exact read-only command list, deny-list defaults, redaction rules, where files are written.
- [ ] **Step 4: CONTRIBUTING/SECURITY/CHANGELOG** — contributing: uv + pytest + ruff; security: report via GitHub private advisories, never include real hosts/keys in issues; changelog `## 2.0.0 — 2026-11-22`.
- [ ] **Step 5: CI** — `ci.yml` matrix `ubuntu-latest`, `windows-latest`, Python 3.11 and 3.13: `uv run --project engine ruff check engine hermes-plugin` and `uv run --project engine --with fastapi --with httpx pytest engine hermes-plugin -q`.
- [ ] **Step 6: Verify** — run the CI commands locally; both pass.
- [ ] **Step 7: Commit** — `git commit -m "docs: rewrite README for Rock Foundry v2 and add CI"`

---

### Task 14: Final verification and hand-off

- [ ] **Step 1:** Full suite + lint pass locally (commands from Task 13 Step 5).
- [ ] **Step 2:** `git ls-files` contains no `RF-002`, no `.env`, and a `git grep` for the owner's real server addresses and SSH key name returns nothing on the branch tip.
- [ ] **Step 3:** Report to the owner: what was built, Task 9 numbers, screenshots, and the reminder about the VPS address in public history (key-only SSH, firewall).
- [ ] **Step 4:** Ask the owner before: pushing `feat/v2-project-memory`, pushing tag `legacy/product-studio`, opening the PR to `main`.
