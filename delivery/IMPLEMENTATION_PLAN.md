# Agentic V1 Implementation Plan

Build a coherent local vertical slice before adding breadth. Continue through normal engineering failures; stop only for a genuine destructive or security blocker.

## Milestone 1: canonical reset

- Rewrite PRD, README, product vision, positioning, architecture, provider, privacy, UI research, and agent handoff docs.
- Remove cancelled SaaS requirements from active plans and tests.

## Milestone 2: local persistence

- Replace PostgreSQL/PrismaPg with SQLite/Prisma.
- Model local project, conversation, decision, assumption, question, contradiction, requirement, reference, tool run, agent run, artifact, provider metadata, and revisions.
- Do not migrate or destroy Alpha PostgreSQL data.

## Milestone 3: deterministic agent runtime

- Add structured action schemas.
- Add action validation and deterministic handlers.
- Add decision graph edges, provenance, confidence, requirements coverage, contradiction checks, and readiness.
- Preserve human approval for material product decisions.

## Milestone 4: provider system

- Add explicit Mock Provider.
- Add OpenAI-compatible, Anthropic, and Gemini adapters.
- Add local provider settings and test connection.
- Keep keys outside project state.

## Milestone 5: tools and references

- Register state, decision, requirements, contradiction, website, GitHub, and artifact tools.
- Enforce SSRF, size, timeout, license, prompt-injection, and no-execution safeguards.

## Milestone 6: artifacts

- Generate only BRD.md, PRD.md, and ERD.md.
- Add Mermaid ERD output.
- Validate cross-document consistency and preserve unresolved decisions.

## Milestone 7: chat-first UI

- Empty first launch.
- Sidebar, conversation, sticky composer, inline question options, compact tool activity, status, drawers, documents, provider settings, mobile behavior, and error states.
- Use Mobbin evidence only when verified; record limitations honestly.

## Milestone 8: quality gate

- Core, agent, question quality, tool safety, artifact, integration, E2E, browser, lint, typecheck, and build checks.
- Run real provider smoke only when credentials are explicitly configured; otherwise report skipped.

## Commits

Use focused milestones when committing:

```text
docs: reset rockfoundry product direction for agentic v1
refactor: remove legacy saas infrastructure
feat: add local project and conversation state
feat: add local byok provider system
feat: implement rockfoundry agent runtime
feat: add agent discovery tools
feat: generate build ready brd prd and erd
feat: build chat first agent workspace
test: complete rockfoundry agentic v1 quality gate
```

Do not merge into `main`, release, deploy a hosted SaaS, or delete old Git history.
