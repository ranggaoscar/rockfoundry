# Agentic V1 Success Metrics

Measure after a local pilot, not before. Do not send private project content to telemetry by default.

| Metric                      | Direction             | Definition                                                                  |
| --------------------------- | --------------------- | --------------------------------------------------------------------------- |
| First-turn completion       | Increase              | New user submits an idea and receives the first contextual question         |
| Contextual question quality | 100% pass target      | Reviewed questions contain project-specific context and a material decision |
| Magic-moment rate           | ≥ 70% pilot sessions  | At least one non-obvious high-risk decision appears in the first 3 questions |
| Decision capture            | Increase              | User answers become provenance-backed decisions or explicit assumptions     |
| Decision Debt visibility    | 100% target           | Active projects expose Decision Debt score and top invention risks          |
| Decision Debt paydown       | Increase              | Debt score drops after high-risk CRM decisions are accepted                 |
| Handoff completeness        | 100% exports          | Zip includes BRD/PRD/ERD + DO_NOT_INVENT + decisions + invariants + readiness + agent handoff |
| Draft artifact completion   | Increase              | Projects generate the full handoff package                                  |
| Coding-agent invention drop | Win in side-by-side   | Same idea with handoff invents fewer ownership/permission/identity rules    |
| Reopen reliability          | 100% target           | Closed projects reopen with conversation and state intact                   |
| Cross-document consistency  | 0 blocking mismatches | BRD, PRD, and ERD pass deterministic validation                             |
| Provider transparency       | 100% target           | Mock mode is explicit and provider failures never silently downgrade        |
| Local data safety           | 0 credential leaks    | API keys never appear in state, artifacts, logs, exports, or Git            |

Avoid billing, conversion, subscription, or hosted usage metrics in V1.

Wedge detail and kill criteria live in `product/WIN_WEDGE.md`.
