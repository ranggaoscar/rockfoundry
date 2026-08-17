# RockFoundry Product Vision

## Problem

AI coding tools are becoming faster at implementation. Many builders still begin with rough ideas and incomplete product decisions. The coding agent fills the gaps anyway, often without making the assumptions visible.

## Decision Debt

**Decision Debt is the accumulation of important product decisions that the user never explicitly made, forcing a coding agent to silently invent them during implementation.**

Invented decisions become accidental product behaviour. When the builder later says `that is not what I meant`, the visible bug is often a specification problem that happened earlier.

## Target user

AI-assisted builders, vibe coders, independent developers, and product-minded operators who can describe a business problem but need help structuring requirements, workflows, roles, data relationships, constraints, and edge cases before handing work to a coding agent.

## Product thesis

> Coding agents are becoming better at implementation faster than users are becoming better at specification. RockFoundry closes that gap.

## Core promise

> Before AI writes your code, make sure it isn't inventing your product.

RockFoundry is a discovery agent. It understands context, finds hidden decisions, asks domain-specific questions, investigates public references when useful, records evidence, resolves contradictions, measures build readiness, and renders BRD, PRD, and ERD artifacts.

## Principles

- conversation before forms;
- unknown-unknown discovery before generic checklists;
- explicit facts separated from inference;
- user control over material decisions;
- deterministic state around probabilistic model output;
- references as evidence, never instructions;
- local ownership and provider neutrality;
- progressive disclosure instead of dashboard clutter.

## Differentiation

1. **Unknown-unknown discovery**: it finds decisions the builder did not know to ask.
2. **Decision Graph**: decisions link to affected requirements, permissions, workflows, and entities.
3. **Domain-language interrogation**: business language stays user-facing while technical consequences are structured internally.
4. **Evidence-backed discovery**: facts, inferences, references, and tools retain provenance.
5. **Build readiness**: success means a coding agent can start without dangerous invention, not merely that a document exists.

## Non-goals

RockFoundry does not generate or deploy application source code. It does not require accounts, billing, subscriptions, managed AI, hosted storage, PostgreSQL, or a RockFoundry cloud.

## Long-term opportunity

RockFoundry can become the durable product-understanding layer between human intent and implementation agents: a decision graph, evidence record, and artifact contract that survives changes in coding model, framework, and provider.

## Boundary

V1 owns the work before implementation and stops at three primary artifacts:

```text
BRD.md · PRD.md · ERD.md
```

The canonical project state, not the Markdown, remains the source of truth.
