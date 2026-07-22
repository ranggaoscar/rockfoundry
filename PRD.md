# Product Requirements Document — RockFoundry MVP

## Problem

Non-coders can prompt coding agents but often start without decisions about users, data, permissions, scope, deployment, or launch. Agents then invent requirements, causing expensive rework.

## Product

RockFoundry interviews a builder about a specific idea, records decisions in structured project state, analyzes declared references, flags conflicts, and exports an agent-ready Markdown build package.

## Primary job

When I have a rough app idea, help me make the smallest set of high-impact decisions so I can hand a clear, internally consistent package to Codex, Claude Code, or Cursor.

## MVP success path

1. Builder creates a project and submits a 2–10 sentence idea.
2. System extracts a project profile and proposes assumptions.
3. Builder completes adaptive rounds of at most three questions.
4. Builder optionally adds URL and public GitHub references.
5. System updates decisions, flags contradictions, and shows readiness by category.
6. Builder fixes blocking gaps and exports a ZIP.

## Release criteria

- Every generated question names a project-specific noun or constraint.
- A project cannot claim Production Ready with a blocker in security, access, deployment, or data ownership.
- Export contains the manifest, decision log, open questions, and agent instructions.
- Paid access activates only after a verified payment webhook.

See `product/FEATURE_SCOPE.md` for inclusions and `product/NON_GOALS.md` for exclusions.
