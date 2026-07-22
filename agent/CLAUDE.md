# Claude Code Handoff

RockFoundry’s core is a requirements graph plus canonical project state, not a generic chat flow. Use `PROJECT_MANIFEST.json` as the source of truth and generate Markdown from it.

Prioritize the P0 vertical slice in `delivery/TASK_BREAKDOWN.md`. Ask for a product decision only when it cannot be resolved from `decisions/OPEN_QUESTIONS.md`; otherwise make the smallest MVP-safe implementation choice.

Never send user-controlled URLs to unrestricted network fetchers, expose managed AI keys, or activate paid access from a browser redirect.
