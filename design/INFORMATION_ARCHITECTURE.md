# RockFoundry Agentic V1 Information Architecture

The information architecture is conversation-first. Most actions happen in the workspace without navigating away from the conversation.

```text
RockFoundry
├── Workspace
│   ├── Empty idea state
│   └── Active project conversation
│       ├── inline question options
│       ├── tool activity
│       ├── decision confirmation
│       └── artifact result
├── Project sidebar
│   ├── New project
│   ├── Recent projects
│   └── Search projects when the list is long
├── Context drawer
│   ├── Readiness
│   ├── Decisions
│   ├── Assumptions
│   ├── Contradictions
│   └── References
├── Documents view
│   ├── BRD.md
│   ├── PRD.md
│   └── ERD.md
└── Settings
    └── AI Provider
```

## Rules

- The default route opens the workspace, not a marketing landing page, login form, or dashboard.
- The conversation is the default active surface for every project.
- Context and documents are secondary views that preserve return to the conversation.
- No billing, pricing, account, team, or authentication routes belong in V1.
- URL and GitHub references may be pasted directly into the composer.
- Slash commands are optional shortcuts and do not create a separate command-focused area.
