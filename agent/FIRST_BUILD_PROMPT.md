# First Build Prompt

You are implementing the RockFoundry MVP described in this folder. Read `README_START_HERE.md`, `PRD.md`, `PROJECT_MANIFEST.json`, `technical/SYSTEM_ARCHITECTURE.md`, and `agent/AGENTS.md` before writing code.

Build only the P0 vertical slice:

1. Create a project from an idea and target readiness level.
2. Extract a schema-valid project profile using a replaceable AI adapter.
3. Generate at most three contextual questions from the requirements graph.
4. Save answers as versioned canonical state, decisions, assumptions, and contradictions.
5. Calculate Prototype/MVP/Production readiness with named blockers.
6. Render a consistent Markdown package and download it as ZIP.

Use the acceptance criteria as executable behavior. Keep all state-sensitive rules on the server. Use mock adapters for providers in development. Do not implement billing, URL/repo analysis, code generation, team features, private repositories, or auto-renewal in this first milestone. Add focused tests for question quality, conflict detection, and manifest/export consistency. At the end, report changed files, tests run, and any decision that remains blocked.
