# RockFoundry Agentic V1 UI Direction

## Design read

RockFoundry is a serious local developer/productivity tool for vibe coders. The product is a conversation, not a SaaS dashboard. Use a calm ChatGPT-like workspace with restrained visual language, high readability, and progressive disclosure.

## Core hierarchy

```text
idea composer
  -> conversation
  -> contextual question
  -> inline answer or natural reply
  -> compact tool activity
  -> decision confirmation
  -> documents
```

The conversation receives most of the viewport. Secondary context appears only when requested.

## Layout

### Desktop

- Compact left sidebar, approximately 250-280px.
- Wide centered conversation column.
- Sticky bottom composer inside the conversation column.
- No permanent right analytics panel.
- Project header exposes name, compact discovery status, Documents, and a small overflow menu.

### Tablet

- Sidebar collapses behind a menu button.
- Conversation remains the primary surface.
- Context and documents use sheets or drawers.

### Mobile

- Conversation only by default.
- Sidebar opens as a drawer.
- Documents, readiness, decisions, assumptions, contradictions, and settings use sheets or full-screen secondary views.
- Composer stays reachable above the safe-area inset.

## Empty state

First launch must show only:

```text
RockFoundry
What do you want to build?
[ Describe your idea... ]
Examples: CRM for marble sales, rental car booking, inventory for three warehouses
```

Do not ask for provider configuration, account creation, pricing, or technical choices before the idea is submitted.

## Conversation rules

- User, agent, tool activity, warning, decision confirmation, and artifact result have distinct but quiet treatments.
- Prefer whitespace, type scale, and alignment over large message cards.
- Show one focused contextual question per turn.
- Inline options are shortcuts, not a form. Natural-language answers must always work.
- Show the recommendation and why it matters when the agent asks a decision question.
- Tool activity is compact and collapsed by default. Never show chain-of-thought, raw tool JSON, provider payloads, or secrets.

## Progressive disclosure

Use drawers, sheets, popovers, and lightweight document views for:

- readiness details;
- decisions;
- assumptions;
- contradictions;
- references;
- tool history;
- BRD, PRD, and ERD preview;
- provider settings.

The default workspace must not resemble an admin panel.

## Visual language

Use:

- neutral background and surfaces;
- one restrained accent;
- readable sans-serif typography;
- subtle borders;
- restrained shadows;
- compact status indicators;
- clean Markdown rendering;
- visible keyboard focus;
- explicit loading, error, empty, and disabled states.

Avoid:

- purple/blue AI gradients;
- glassmorphism and glow effects;
- dashboard KPI tiles;
- excessive rounded cards;
- decorative status dots;
- fake progress percentages for model execution;
- unnecessary illustrations and motion.

## Research note

Mobbin MCP searches were run for ChatGPT, Claude, AI workspace chat, onboarding, tool activity, and provider settings. The returned screen and flow metadata is recorded in `PRD.md`. Visual inspection was unavailable because the auxiliary vision endpoint required an API key that was not configured. Do not claim visual findings from Mobbin. Validate the implementation in a real browser instead.

## Quality bar

A UI is not complete when it merely compiles. Verify first launch, project creation, conversation, contextual question options, tool activity, documents, provider settings, sidebar behavior, mobile viewport, keyboard use, and error states in a real browser.

## Copy

Use plain, direct language. Natural language is primary. Avoid generic marketing claims, account language, pricing language, and technical configuration before it is relevant.

## Source of truth

`PRD.md` defines the full product contract. This file defines only the visual and interaction direction. Do not reintroduce the old dashboard, billing, account, or hosted-service model from archived documents.

## Status

This is the Agentic V1 direction. It supersedes the former `calm workspace` direction that used persistent overview, interview, references, readiness, and billing tabs.
