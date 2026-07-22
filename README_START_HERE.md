# RockFoundry Build Package

This package defines the MVP for RockFoundry: an open-source, adaptive product-planning app for non-coders and vibe coders. It turns a rough idea into a consistent Markdown package that a coding agent can implement without guessing core requirements.

## Read in this order

1. `PRD.md` — product outcome and MVP boundary.
2. `PROJECT_MANIFEST.json` — canonical structured state and decisions.
3. `technical/SYSTEM_ARCHITECTURE.md` — implementation shape.
4. `delivery/IMPLEMENTATION_PLAN.md` and `TASK_BREAKDOWN.md` — build sequence.
5. `agent/FIRST_BUILD_PROMPT.md` — paste this into a coding agent.

Markdown files describe the product. `PROJECT_MANIFEST.json` is the source of truth when documents disagree. Update the manifest first, then regenerate affected Markdown.

## MVP outcome

A visitor can create a project, answer short context-specific interview rounds, add up to three URLs and one public GitHub repository, review decisions and contradictions, see readiness, and export a build package. Cloud Starter customers can save projects and use managed AI for Rp49,000 per 30 days; self-hosted users bring their own key.

## Boundaries

Do not build a code generator, visual editor, team collaboration product, private-repo ingestion, or recurring payment system in this MVP.

See `decisions/OPEN_QUESTIONS.md` before choosing unresolved vendor or policy details.
