# Contributing

Thanks for helping. Rock Foundry is a small Python engine plus a Hermes plugin.

## Setup

```bash
uv sync --project engine
uv run --project engine pytest engine/tests
uv run --project engine --with fastapi --with httpx pytest hermes-plugin/tests
uv run --project engine ruff check . && uv run --project engine ruff format --check .
```

## Rules

- Tests first: every behaviour change comes with a test that failed before the change.
- The engine stays **read-only** and **dependency-free** (stdlib only). See [docs/safety.md](docs/safety.md).
- After changing `engine/src/rockfoundry`, run `python scripts/sync_engine.py` so the plugin's
  bundled copy matches (a test enforces this).
- Human-facing card text is plain Indonesian; git terms only in the technical block.
- Never put real hosts, IP addresses, keys or tokens in issues, tests or fixtures.
