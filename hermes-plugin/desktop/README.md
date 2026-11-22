# Desktop half

`plugin.js` adds a **Projects** page (sidebar → Projects) to Hermes Desktop.

SDK calls used (verified against the Desktop Plugin SDK docs shipped with Hermes v0.23):

- `ctx.registerMany` with `ROUTES_AREA` (`/projects`) and `SIDEBAR_NAV_AREA` (codicon `library`)
- `ctx.rest(path, { method, body })` for `/api/plugins/rockfoundry/*` (see `../dashboard/plugin_api.py`)
- `ctx.runAction('session.new')` + `host.composer.setDraft('new', prompt)` + `host.composer.focus('new')` to open a chat with the project context typed in, never sent. If no composer answers, the prompt is copied to the clipboard.
- `host.notify` for small messages, `Button` from the UI kit, theme variables only.

The SDK cannot set a chat working folder, so prompts name the card path instead.
