# Acceptance Criteria

## Adaptive interview

- Given a project idea containing named actors/entities, when a round is generated, then every question contains a project-specific noun or explicit constraint.
- Given a question that has no material impact, when validation runs, then it is rejected before display.
- Given three unanswered questions in a round, when generation is requested, then no fourth question is returned.

## Consistency and export

- Given conflicting accepted decisions, when readiness is calculated, then the conflict names both decisions and blocks the relevant level.
- Given a project state version, when an export is rendered, then manifest and Markdown carry the same accepted decisions.
- Given unresolved production blockers, when export runs, then export succeeds but labels the package below Production Ready.

## Billing

- Given a valid duplicate successful webhook, when it is processed twice, then access extends once.
- Given a browser success redirect without webhook confirmation, then no entitlement is activated.
- Given a successful verified Rp49,000 invoice, then the workspace gets exactly 30 days of Cloud Starter access.
