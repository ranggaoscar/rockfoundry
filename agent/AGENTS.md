# RockFoundry Agent Instructions

Start with `README_START_HERE.md`, then treat `PROJECT_MANIFEST.json` as canonical state. Do not implement beyond the MVP boundary in `product/NON_GOALS.md`.

## Working rules

- Update manifest/state rules before changing generated Markdown templates.
- Keep questions tied to project-specific nouns and a material decision.
- Enforce ownership, webhook verification, and safe reference fetching on the server.
- Use adapters for AI and payments, but implement only the first provider unless a task requires more.
- Add a focused automated check for non-trivial logic; run relevant tests before handoff.

## Delivery order

1. Core state, interview, readiness, export.
2. Auth and public reference analysis.
3. Managed AI and QRIS Cloud Starter.

Read `technical/SYSTEM_ARCHITECTURE.md` before choosing implementation details and `delivery/ACCEPTANCE_CRITERIA.md` before declaring a feature done.
