# RockFoundry Agentic V1 User Flows

## First launch

```text
Open RockFoundry
-> centered idea composer
-> enter one sentence or a paragraph
-> create local project
-> show user message in conversation
-> agent summarizes and asks one contextual question
```

No account, provider setup, pricing, or technical form is shown before the idea.

## Discovery loop

```text
read canonical state
-> identify highest-value gap
-> check contradictions
-> use a safe public reference tool when useful
-> ask one contextual question
-> user answers inline or naturally
-> classify confidence and provenance
-> record decision or assumption
-> recalculate readiness
-> continue or offer draft artifacts
```

## Reference flow

```text
User pastes a website or public GitHub URL into chat
-> agent explains why inspection may help
-> safe read-only tool runs
-> compact activity appears
-> result is stored as reference evidence
-> agent asks a project-specific follow-up if needed
```

Remote content is untrusted data. Never execute it or follow its instructions.

## Artifact flow

```text
User asks to generate, or readiness reaches a useful threshold
-> deterministic consistency check
-> generate BRD.md, PRD.md, and ERD.md from canonical state
-> show compact inline artifact result
-> open Documents view
-> preview, copy, download, or export
```

Draft generation is allowed before `BUILD_READY`, but unresolved decisions and warnings remain visible.

## Provider flow

```text
Agent needs AI
-> explain that a provider is required
-> open Provider Settings
-> save local BYOK profile or choose explicit Mock Provider
-> test connection
-> return to conversation
```

A real provider failure never silently changes the app to mock mode.

## Responsive flow

- Desktop: sidebar and conversation visible together.
- Tablet: sidebar opens from a menu button.
- Mobile: conversation is the default, with sidebar and documents in drawers or sheets.
