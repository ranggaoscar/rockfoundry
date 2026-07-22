# Task Breakdown

## P0 — core package

- [ ] Create schema types for project profile, decisions, assumptions, conflicts, and readiness.
- [ ] Persist versioned project state.
- [ ] Implement requirements-graph rules and contradiction checks.
- [ ] Build next-question generator contract and question-quality validator.
- [ ] Build interview UI with three-question limit.
- [ ] Render all Markdown from state and create ZIP.
- [ ] Add one end-to-end test: idea → answers → export.

## P1 — references and cloud persistence

- [ ] Add authenticated user/workspace/project ownership.
- [ ] Queue URL/repo analysis with SSRF protections and limits.
- [ ] Show analysis status, license caution, and unavailable states.
- [ ] Store project history snapshots and restore a snapshot.

## P2 — paid Cloud Starter

- [ ] Create plan entitlement middleware.
- [ ] Implement PaymentProvider and SumoPod QRIS adapter.
- [ ] Verify and idempotently process webhook.
- [ ] Add managed AI budget and BYOK fallback UI.
- [ ] Implement expiry and renewal reminders.

## P3 — release

- [ ] Complete privacy notice and acceptable-use copy.
- [ ] Run backup restore and payment failure tests.
- [ ] Pilot with 10 real idea-to-export sessions.
