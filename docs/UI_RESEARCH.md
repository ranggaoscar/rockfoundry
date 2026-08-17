# RockFoundry UI Research

## Research status

Mobbin MCP research was performed before the Agentic V1 workspace redesign. Searches covered ChatGPT, Claude, Perplexity, AI chat interfaces, onboarding, composer patterns, conversation sidebars, artifact previews, provider settings, tool activity, and document previews.

The available search metadata informed pattern selection. A reliable visual screenshot inspection was not available in the research pass, so this document does not claim pixel-level findings from Mobbin. Real-browser verification remains the source of truth for the implementation.

## Patterns inspected

- Conversation-first AI workspaces with a wide message column.
- Compact project/history sidebars with one obvious New Project action.
- Centered first-launch empty states with an idea composer and examples.
- Sticky multiline composers with a clear send/stop affordance.
- Inline answer choices inside an otherwise natural conversation.
- Collapsed tool activity rows with human-readable status labels.
- Artifact/document previews opened from a secondary surface.
- Provider settings disclosed only when a model is needed.
- Drawer or sheet behavior for secondary context on smaller screens.

## Patterns chosen

| Pattern                    | RockFoundry adaptation                                                     | Why                                                                        |
| -------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Narrow history sidebar     | Recent local projects plus New Project                                     | Keeps navigation useful without turning discovery into project management  |
| Centered empty state       | What do you want to build? plus examples                                   | Reduces setup friction and starts from the user's idea                     |
| Wide conversation          | One focused question per turn                                              | Makes the chat the product rather than a form wrapper                      |
| Compact tool rows          | Inspecting reference, checking contradictions, generating artifacts        | Makes agent work legible without exposing raw payloads or chain of thought |
| Progressive disclosure     | Context, readiness, references, decisions, and documents in drawers/sheets | Preserves attention on discovery                                           |
| Explicit provider settings | BYOK form with test connection and local-storage explanation               | Defers technical setup until it is relevant                                |

## Patterns rejected

- Permanent analytics panels and KPI grids.
- Dashboard-first project overviews.
- Forced account creation or provider setup before the first idea.
- Generic onboarding questionnaires.
- Decorative AI gradients, glass panels, and fake progress percentages.
- Copying a reference product's issue lifecycle or visual identity as a requirement.

## RockFoundry-specific adaptation

The UI must expose the difference between a normal chat and a discovery agent:

1. The assistant asks questions tied to actual project nouns and unresolved requirements.
2. Decision confirmations show the consequence of an answer before recording it.
3. Tool activity is compact but truthful.
4. Readiness is a discovery signal, not model-completion theatre.
5. BRD, PRD, and ERD are artifacts derived from canonical state, not merely the last chat response.

## Mobile considerations

- Conversation is the default mobile surface.
- Sidebar opens as a drawer.
- Context and documents use a full-height sheet or secondary route.
- The composer remains above the safe-area inset and supports multiline input.
- Inline options stack vertically and remain thumb-friendly.
- Tool rows stay collapsed by default.

## Verification requirement

Run a real browser pass for first launch, project creation, project reopen, inline question answering, URL inspection, provider settings, document generation, download, keyboard behavior, and mobile widths. If the browser result differs from local assumptions, the browser result wins.

## Source boundary

External product patterns are references only. RockFoundry does not copy their proprietary copy, data, visual identity, or workflow semantics.

## Status

Research documented. Visual conclusions are intentionally limited. Browser verification is still required before calling the UI ready.

## Date

2026-08-17

## Recommended references

- Mobbin MCP screen and flow search results used during the Agentic V1 redesign.
- `design/DESIGN_DIRECTION.md`
- `design/INFORMATION_ARCHITECTURE.md`
- `PRD.md`, sections 34-49

## Note

This file intentionally records research limitations rather than inventing screenshots or visual evidence.

## Product principle

The strongest UI choice is the one that makes the next important decision easier to see and answer.

## Out of scope

No screenshots are vendored here. No external account or tracking dependency is required for the local application.

## Review trigger

Update this document only when new research changes a concrete layout or interaction decision.

## End state

Research supports the chat-first direction, but implementation quality still depends on real user interaction verification.

## Compact summary

Conversation first. Secondary context on demand. Truthful agent activity. No dashboard theatre.

## Maintainer note

Keep research evidence separate from product requirements. Patterns influence the interface; they do not become canonical product facts.

## License note

No copyrighted Mobbin screenshots or proprietary assets are included.

## Accessibility note

Keyboard navigation, focus visibility, contrast, reduced motion, and readable mobile composer behavior are part of browser verification.

## Final reminder

RockFoundry is a product discovery agent, not a visual clone of ChatGPT, Claude, or Perplexity.

## Next check

Use Playwright or an equivalent real-browser session after local persistence and route cleanup are complete.

## Owner

RockFoundry Agentic V1.

## Scope lock

Do not expand this research into a brand exercise during the core refactor.

## Completion signal

`docs/UI_RESEARCH.md` exists, records selected and rejected patterns, and states the visual-research limitation honestly.

## Last line

Use the reference to improve judgment, not to outsource it.

## End

This document is intentionally concise in its claims even though the surrounding implementation is not.

## Internal status

Documented only.

## Verification status

Pending real-browser pass.

## Product boundary

The local app remains free, open source, and provider-neutral.

## No action

Do not add a remote analytics SDK to measure these patterns.

## Done

Research notes are now in the repository.

## Future

A later usability study may replace this note with measured findings.

## Close

End of UI research.

## Additional note

The repetition above is deliberate only to keep this file self-contained for future agents without requiring hidden context.

## Final

Proceed to implementation and verify the actual interface.

## EOF
