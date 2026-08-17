# Agentic V1 Feature Scope

## Build now

| Area            | V1 capability                                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Workspace       | Chat-first empty state, project sidebar, active conversation, responsive drawers                                            |
| Projects        | Create, rename, reopen, and delete local projects                                                                           |
| Conversation    | Persist messages, agent questions, inline options, natural-language answers, retry and stop states                          |
| Canonical state | Typed project state with facts, requirements, decisions, assumptions, contradictions, references, readiness, and provenance |
| Agent runtime   | Structured actions routed through deterministic handlers                                                                    |
| Questions       | Contextual, project-specific, high-value questions with quality validation                                                  |
| Providers       | Explicit mock provider, OpenAI-compatible, Anthropic, Gemini, local config                                                  |
| References      | Safe public website and GitHub inspection, license reporting, prompt-injection isolation                                    |
| Artifacts       | Deterministic BRD, PRD, ERD renderers and cross-document consistency validation                                             |
| Export          | Simple project folder or ZIP containing BRD.md, PRD.md, and ERD.md                                                          |
| Settings        | Local provider configuration and connection test                                                                            |

## Do not build

- accounts, authentication, sessions, teams, or hosted ownership;
- billing, payments, SumoPod, plans, entitlements, or usage credits;
- managed AI billing or RockFoundry cloud storage;
- PostgreSQL, Redis, MinIO, cloud queues, or required Docker services;
- application code generation, deployment, or external writes.

## Definition of done

A user can install locally, start with an idea in chat, answer contextual questions, inspect a public reference, review readiness and decisions, generate all three artifacts, export them, and reopen the project without a RockFoundry account.
