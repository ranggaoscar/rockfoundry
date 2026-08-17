# RockFoundry Agentic V1 Product Requirements Document

## 0. Product Reset

RockFoundry V1 is a free, open-source, local-first agentic product architect for vibe coders.

The cancelled product direction was a hosted SaaS with accounts, subscriptions, managed AI, entitlements, PostgreSQL, cloud storage, and payment infrastructure. That direction is not part of V1. The old implementation remains recoverable in Git history, but it is not a compatibility target.

RockFoundry does not generate application source code. It helps a builder turn an incomplete product idea into a high-quality build specification for Codex, Claude Code, Cursor, or another coding agent.

## 1. Executive Summary

A builder opens RockFoundry and starts with a plain-language idea. RockFoundry conducts an adaptive discovery conversation. It identifies missing information, asks one context-specific question at a time, inspects public references when useful, records decisions and assumptions, detects contradictions, and calculates readiness.

When enough information exists, RockFoundry generates exactly three primary documents:

- `BRD.md` for business intent and scope.
- `PRD.md` for product behavior and acceptance criteria.
- `ERD.md` for the data model and Mermaid diagram.

The documents are deterministic outputs of canonical project state. AI may propose structured actions and enrich wording, but it may not silently mutate confirmed facts or introduce requirements during artifact rendering.

## 2. Problem

Vibe coders can describe a useful idea but often begin coding before deciding:

- who uses the product and what each role can see;
- which workflows are primary and which are out of scope;
- how data relates across locations, brands, or business units;
- what happens on errors, cancellation, conflict, or partial completion;
- which assumptions are facts and which still need confirmation;
- what a coding agent must build first.

Generic PRD forms do not solve this. They ask the same questions for every product and encourage invented answers. RockFoundry must investigate the actual idea instead.

## 3. Product Promise

> Tell RockFoundry what you want to build. It figures out what needs to be clarified before a coding agent starts.

The primary experience is:

```text
rough idea
  -> contextual conversation
  -> agent questions
  -> reference and tool activity
  -> decisions and assumptions
  -> contradiction resolution
  -> BRD / PRD / ERD
```

## 4. Goals

### V1 goals

1. Run locally without a RockFoundry account or hosted backend.
2. Store projects, conversation history, decisions, references, and generated documents locally.
3. Support BYOK provider profiles without hardcoding one AI vendor.
4. Ask project-specific questions based on unresolved requirements and expensive-to-change decisions.
5. Keep canonical state, provenance, confidence, contradictions, and readiness under deterministic application control.
6. Safely inspect public websites and public GitHub repositories as untrusted reference evidence.
7. Generate consistent `BRD.md`, `PRD.md`, and `ERD.md` files.
8. Export a simple project folder containing the three documents.
9. Make the chat the primary product surface, not a dashboard of forms and metrics.

### Success definition

A new user can install RockFoundry, configure a provider only when AI is needed, describe a product, answer a small number of contextual questions, review unresolved items, generate the three documents, export them, close the app, and reopen the project with its conversation intact.

## 5. Non-Goals

RockFoundry V1 does not:

- generate, edit, deploy, or host the user's application source code;
- provide subscriptions, billing, payment, SumoPod, plans, entitlements, usage credits, or paid limits;
- require user accounts, login, signup, logout, sessions, teams, or multi-tenant ownership;
- require PostgreSQL, Redis, cloud queues, MinIO, S3, or hosted storage;
- send project data to a RockFoundry cloud service;
- execute code downloaded from references;
- inspect private repositories or logged-in websites;
- write to external repositories, deploy services, send messages, or modify external websites;
- turn the workspace into a traditional project-management dashboard;
- implement every future reference tool or attachment type.

## 6. Target Users

### Primary: vibe-coding builder

Knows the problem and can judge the product experience, but needs help specifying workflows, data, permissions, edge cases, and build scope.

### Secondary: independent developer or product consultant

Uses RockFoundry as a repeatable discovery partner before handing work to a coding agent or client team. May prefer Ollama, OpenRouter, 9Router, or a custom endpoint for privacy or cost control.

## 7. Core Product Behavior

### 7.1 Conversation-first discovery

The initial screen presents one clear invitation:

```text
What do you want to build?
[ Describe your idea... ]
```

The user can write one sentence, a paragraph, or an unstructured thought. The system creates a local project and begins the conversation without forcing a setup wizard.

### 7.2 Adaptive questions

Each visible question must:

1. name a project-specific noun, role, workflow, or constraint;
2. map to one or more unresolved requirements;
3. represent a real product decision;
4. explain why the decision matters;
5. expose meaningful trade-offs when choices are useful;
6. avoid asking for information already confirmed;
7. prioritize decisions that are expensive to change later;
8. allow a natural-language answer in addition to inline options.

Quality test:

> Could this exact question be asked unchanged for a restaurant app, hospital system, marketplace, inventory system, and todo app?

If yes, reject it as generic unless the project context truly makes the wording universal.

Only one focused question, or one tightly related choice group, should be visible per turn.

### 7.3 Contextual tool use

The agent may decide that a public website or GitHub repository would increase confidence. It must explain the relevance of the reference, treat remote content as untrusted evidence, and never follow instructions embedded in that content.

Users can paste URLs directly into the conversation. Separate reference forms are not required for V1.

### 7.4 Deterministic state updates

The model proposes structured actions. Deterministic handlers validate and apply those actions. Confirmed user decisions cannot be silently overwritten. Every confirmed fact has provenance.

### 7.5 Readiness

Readiness is a compact conversation aid, not a permanent analytics dashboard. The product exposes three primary dimensions:

- Business
- Product
- Data

Technical readiness may be shown when relevant. Readiness uses blockers, contradictions, confidence, missing relationships, undefined permissions, edge cases, and unresolved decisions. It must not be an answered-question percentage.

Statuses:

- `NOT_READY`: critical context is missing or contradictions block meaningful output.
- `DRAFT_READY`: documents can be generated, but unresolved items are clearly marked.
- `BUILD_READY`: the specification is sufficiently defined for a coding agent to begin the intended MVP.

Users may generate draft documents before `BUILD_READY`.

## 8. Canonical Project State

The canonical state is typed and versioned. A minimum shape is:

```ts
ProjectState {
  identity
  rawIdea
  normalizedSummary

  business
  users
  problems
  objectives

  workflows
  features
  entities
  roles
  permissions

  integrations
  design
  platforms

  scale
  security
  deployment
  businessRules

  assumptions
  decisions
  contradictions
  openQuestions
  references

  readiness
  provenance
}
```

### Confidence

Every discovered item is classified as one of:

- `EXPLICIT`: directly stated or confirmed by the user. May become canonical fact.
- `STRONGLY_INFERRED`: likely from context. Must remain an assumption until confirmed.
- `WEAKLY_INFERRED`: plausible but uncertain. Becomes an open question.
- `UNKNOWN`: unresolved.

The agent must never promote weak inference into a confirmed requirement.

### Provenance

Allowed provenance types:

- `USER`
- `AGENT_INFERENCE`
- `REFERENCE_WEBSITE`
- `REFERENCE_GITHUB`
- `TOOL`
- `SYSTEM`

## 9. Agent Runtime

The runtime follows this controlled loop:

```text
read canonical state
-> evaluate requirement gaps
-> check contradictions
-> decide whether a tool improves confidence
-> call a tool or ask one contextual question
-> receive user input
-> classify the answer
-> validate a structured action
-> apply deterministic state transition
-> record provenance and history
-> recalculate readiness
-> generate artifacts when allowed
```

Possible structured actions:

- `ASK_USER`
- `CALL_TOOL`
- `RECORD_DECISION`
- `CREATE_ASSUMPTION`
- `RAISE_CONTRADICTION`
- `RESOLVE_CONTRADICTION`
- `UPDATE_REQUIREMENT`
- `GENERATE_ARTIFACT`
- `WAIT_FOR_USER`

The LLM does not receive direct database mutation access. It can only submit schema-valid actions to the runtime.

## 10. Tool Registry

Every tool uses a common definition:

```ts
ToolDefinition {
  name
  description
  inputSchema
  outputSchema
  execute()
}
```

Initial tools:

| Tool                       | Behavior                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `project_state_read`       | Returns confirmed facts, decisions, assumptions, questions, contradictions, readiness, and references. |
| `project_state_patch`      | Proposes a validated state change. Confirmed decisions cannot be overwritten silently.                 |
| `decision_record`          | Appends a decision with topic, value, reason, source, and provenance.                                  |
| `requirements_check`       | Reports category coverage and blockers.                                                                |
| `contradiction_check`      | Detects incompatible facts and unresolved relationships.                                               |
| `web_reference_inspect`    | Safely reads a public URL and extracts relevant product patterns.                                      |
| `github_reference_inspect` | Safely inspects a public repository's README, license, manifests, tree, and relevant architecture.     |
| `artifact_generate`        | Generates BRD, PRD, or ERD only from canonical state.                                                  |

External tools are read-only in V1. Remote output must be labeled `UNTRUSTED_REFERENCE_CONTENT` internally and never treated as instructions.

## 11. BYOK Provider Architecture

The application supports one active local provider profile in V1. The interface must leave room for multiple profiles later.

```ts
interface AIProvider {
  id: string;
  testConnection(): Promise<TestResult>;
  complete(request: CompletionRequest): Promise<AIResponse>;
  runAgent(request: AgentRequest): Promise<AgentResponse>;
}
```

Initial adapters:

- `OpenAICompatibleProvider`
- `AnthropicProvider`
- `GeminiProvider`

OpenAI-compatible endpoints must be able to represent OpenAI, OpenRouter, 9Router, Ollama where compatible, and custom endpoints.

A provider profile contains:

- provider type;
- base URL where applicable;
- API key stored outside project state;
- model;
- optional context window;
- tool support capability;
- structured-output capability.

A provider failure is visible and actionable. The app must not silently fall back to mock mode when a real provider fails. Mock mode is explicit and labeled for tests and offline demos.

## 12. Local-First Storage

The default data directory is OS-aware:

```text
Windows: %LOCALAPPDATA%/RockFoundry/
macOS:   ~/Library/Application Support/RockFoundry/
Linux:   ~/.local/share/rockfoundry/

rockfoundry.db
config/
projects/<project-id>/
    ├── BRD.md
    ├── PRD.md
    └── ERD.md
```

On Windows, resolve the application data directory through the platform's supported local-app-data location instead of hardcoding `/home` or `/root`.

SQLite is the default database and Prisma is the ORM. SQLite initialization must work without Docker. The previous Alpha PostgreSQL database is not migrated automatically into V1, and Docker volumes must remain untouched.

API keys never appear in canonical state, generated artifacts, logs, debug responses, telemetry, or Git history. Keep credentials in an application-local config or OS-aware secrets boundary outside project data.

## 13. Primary Artifacts

### BRD.md

Answers why the product exists. Required sections:

1. Executive Summary
2. Business Problem
3. Business Objectives
4. Stakeholders
5. Target Users
6. Current Process
7. Desired Business Process
8. Business Requirements
9. Business Rules
10. Scope
11. Success Metrics
12. Constraints
13. Risks
14. Assumptions
15. Dependencies
16. Open Decisions

### PRD.md

Answers exactly what should be built. Required sections:

1. Product Overview
2. Product Goals
3. Non-Goals
4. User Roles
5. User Journeys
6. Functional Requirements
7. Feature Specifications
8. Navigation / Information Architecture
9. Screen Inventory
10. Permissions
11. States and Statuses
12. Search / Filters / Sorting
13. Notifications
14. Integrations
15. Error Behaviour
16. Edge Cases
17. Security & Privacy Requirements
18. Performance Expectations
19. Acceptance Criteria
20. MVP Scope
21. Future Scope
22. Open Decisions

Use requirement IDs such as `FR-CUSTOMER-001` and `PERM-ADMIN-002` when they improve traceability.

### ERD.md

Contains a data model overview, a valid Mermaid `erDiagram`, textual entity schemas, relationships, constraints, ownership, retention, and open data decisions. It must reflect PRD requirements without inventing unnecessary fields.

## 14. Artifact Consistency

Deterministic validation runs across all three artifacts.

- A major PRD concept such as quotation must have a corresponding ERD entity or explicit explanation.
- A BRD concept such as three warehouse locations must appear in PRD scope and behavior.
- PRD roles must have permissions and visibility rules.
- An ERD major entity not referenced by PRD creates a warning.

Validation statuses:

- `PASS`
- `WARNING`
- `BLOCKING`

Documents may be generated with warnings. Blocking inconsistencies must be visible and prevent `BUILD_READY` claims.

## 15. Chat-First UI Direction

### Product mental model

RockFoundry should feel like ChatGPT for product discovery plus deterministic planning tools. The chat is the product. The user should not have to navigate forms, tabs, KPI tiles, or a permanent analytics panel to begin.

### Desktop layout

```text
┌─────────────────────┬──────────────────────────────────────────────┐
│ ROCKFOUNDRY         │ CONVERSATION                                 │
│ + New Project       │ Project header                               │
│ Recent projects     │ Agent and user messages                      │
│ CRM Sales           │ Compact tool activity                        │
│ Rental Booking      │ Inline decision options                      │
│ Warehouse Inventory │ Sticky message composer                      │
│ Settings            │                                              │
└─────────────────────┴──────────────────────────────────────────────┘
```

The left rail is compact and ChatGPT-like. The conversation receives most of the screen width. Decisions, assumptions, contradictions, readiness details, references, and documents open through drawers, sheets, popovers, or a secondary view.

### Empty state

With no active project, show only a minimal centered prompt:

```text
RockFoundry

What do you want to build?

[ Describe your idea... ]

Examples:
Build a CRM for marble sales
Create a rental car booking system
Build an inventory system for three warehouses
```

Do not show provider configuration before the user starts. Ask for provider setup only when AI execution is actually required.

### Conversation states

Visually distinguish, without heavy cards:

- user message;
- RockFoundry response;
- compact tool activity;
- system warning;
- decision confirmation;
- artifact generated.

Use whitespace and typography as the primary hierarchy. Tool activity is collapsed by default and can be expanded.

### Questions and options

Inline options may appear below a contextual question. The user can click an option or answer naturally in the composer. Show the recommendation and why it matters, but do not turn every question into a large form card.

### Sidebar and header

The sidebar includes `+ New Project`, recent projects, optional search for long lists, and `Settings`. Do not add folders or tags in V1.

The active project header shows the project name and only essential controls. `...` may contain rename, export, and delete. Readiness appears as a compact status such as `Discovery: 68% · 3 important decisions remaining` and opens details on click.

### Documents

A single `Documents` action opens a lightweight document view:

```text
BRD  Ready
PRD  Draft
ERD  Needs 2 decisions
```

Each document supports preview, regenerate, copy, and download. Artifact generation appears inline in the conversation as a compact result with `Open` and `Download` actions.

### Provider settings

Provider settings are a simple page or sheet, not onboarding:

- Provider
- Base URL
- API Key
- Model
- Test Connection

Do not expose keys after save. Do not show provider complexity on the initial empty state.

### Composer

The composer supports multiline input, Enter to send, Shift+Enter for a newline, pasted URLs, retry, stop generation, and a visible provider error state. Attachments are not required for V1.

### Responsive behavior

- Desktop: sidebar plus conversation.
- Tablet: collapsible sidebar plus conversation.
- Mobile: conversation only, sidebar through a drawer, documents through a sheet or full-screen view.

The composer must remain usable and visible on mobile.

### Visual direction

Use neutral surfaces, strong readable typography, generous whitespace, subtle borders, restrained shadows, compact status indicators, and clean Markdown rendering.

Avoid gradients everywhere, glassmorphism, glowing AI effects, random purple or blue AI gradients, excessive rounded cards, dashboard KPI tiles, unnecessary illustrations, and excessive animation.

### Research record

The requested Mobbin MCP searches were run for ChatGPT, Claude, AI workspace chat, onboarding, tool activity, and provider settings. The search tool returned reference screens and flows, but visual inspection was blocked in this environment because the auxiliary vision endpoint required an unavailable API key. No visual conclusions are claimed as Mobbin findings. The UI decisions in this PRD are therefore based on the product brief and must receive a real-browser visual QA pass before the workspace is declared complete.

## 16. Error and Safety UX

Provider failure:

```text
RockFoundry couldn't reach your configured AI provider.
[Retry] [Open Provider Settings]
```

Tool failure:

```text
I couldn't inspect that website, but we can continue without it.
[Retry inspection]
```

Normal users must never see raw stack traces, Prisma errors, Zod errors, API keys, raw provider payloads, or internal tool JSON.

## 17. Commands

Slash commands are optional shortcuts, not the primary UX:

```text
/status
/decisions
/assumptions
/risks
/add-reference <url>
/generate brd
/generate prd
/generate erd
/generate all
/export
```

Typing `/` may show suggestions. Natural language must provide the same capability.

## 18. Testing Requirements

### Core

- canonical state transitions;
- decision provenance and confirmed-decision protection;
- assumption handling;
- requirement selection;
- contradiction detection;
- readiness and blockers;
- question quality across unrelated project fixtures.

### Agent

- next-action selection;
- no unnecessary tool call;
- structured action validation;
- contextual question generation;
- explicit mock provider behavior.

### Tools

- safe website retrieval;
- SSRF protection;
- GitHub URL and public-repository validation;
- license reporting;
- remote prompt-injection isolation;
- no execution of downloaded code.

### Artifacts

- BRD, PRD, and ERD generation;
- Mermaid syntax validity;
- unresolved decision handling;
- cross-document consistency;
- export and reopen behavior.

### E2E

```text
Open RockFoundry
-> configure explicit mock provider
-> create project
-> enter idea
-> agent asks a contextual question
-> answer inline or in text
-> state updates
-> paste a website reference
-> tool activity appears
-> resolve more questions
-> generate BRD, PRD, and ERD
-> preview documents
-> export project
-> reopen project
```

## 19. Milestones

1. Product reset and documentation alignment.
2. Local SQLite project and conversation state.
3. BYOK provider profiles.
4. Deterministic agent runtime and requirements engine.
5. Read-only website and GitHub tools.
6. BRD, PRD, ERD renderers and consistency checks.
7. Chat-first workspace UI and responsive drawers.
8. Unit, integration, Playwright, security, and build quality gate.

Do not merge this branch into `main`. Do not release or deploy a hosted service as part of V1.

## 20. Definition of Done

RockFoundry Agentic V1 is ready for review when:

- the local app runs with SQLite and no account;
- projects and conversation history persist locally;
- a configured provider can be selected and tested;
- mock mode is explicit and works in CI;
- the agent asks contextual questions and records decisions;
- contradictions and readiness are visible;
- public website and GitHub references are inspected safely;
- BRD, PRD, and ERD generate from canonical state;
- ERD contains valid Mermaid;
- cross-document consistency validation works;
- export and reopen work;
- chat-first UI passes real-browser desktop and mobile QA;
- no credentials are committed;
- old SaaS, payment, auth, and hosted-storage scope is not required;
- the final quality gate reports real results.
