# Agentic V1 Task Breakdown

## P0: product and persistence

- [ ] Keep canonical PRD and reset docs aligned.
- [ ] Replace hosted DB client with SQLite Prisma client.
- [ ] Define local models for projects, messages, decisions, assumptions, questions, contradictions, requirements, references, tool runs, agent runs, artifacts, provider metadata, and revisions.
- [ ] Remove account, billing, payment, entitlement, managed-AI, and cloud-storage runtime dependencies.

## P1: deterministic agent runtime

- [ ] Define Zod schemas for all initial agent actions.
- [ ] Validate action permissions and human approval.
- [ ] Implement decision graph edges and affected-concept lookup.
- [ ] Implement confidence/provenance transitions.
- [ ] Implement question-quality rejection and stop conditions.
- [ ] Implement readiness categories: Business, Product, Data.
- [ ] Implement contradiction detection and resolution history.

## P2: tools and artifacts

- [ ] Add extensible Tool Registry.
- [ ] Implement safe website and GitHub reference inspection.
- [ ] Treat references as untrusted and never execute remote code.
- [ ] Generate BRD.md, PRD.md, and ERD.md with Mermaid.
- [ ] Add deterministic cross-document consistency validation.

## P3: UI and provider experience

- [ ] Chat-first empty state and local project sidebar.
- [ ] Conversation persistence and agent/tool message states.
- [ ] Inline contextual question options and natural-language answers.
- [ ] Context/readiness drawer.
- [ ] Documents preview and export view.
- [ ] Provider settings with explicit Mock Provider and BYOK.
- [ ] Responsive mobile drawer/sheet behavior.

## P4: quality

- [ ] Domain fixtures for warehouse, rental, sales CRM, school, restaurant, marketplace, habit, content, construction, and field sales.
- [ ] Unit tests for state, graph, provenance, question quality, contradictions, readiness, actions, tools, and artifacts.
- [ ] Deterministic E2E with Mock Provider.
- [ ] Real browser visual and interaction verification.
- [ ] Run format, lint, typecheck, test, integration, E2E, and build.
