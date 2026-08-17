# Agentic V1 Success Metrics

Measure after a local pilot, not before. Do not send private project content to telemetry by default.

| Metric                      | Direction             | Definition                                                                  |
| --------------------------- | --------------------- | --------------------------------------------------------------------------- |
| First-turn completion       | Increase              | New user submits an idea and receives the first contextual question         |
| Contextual question quality | 100% pass target      | Reviewed questions contain project-specific context and a material decision |
| Decision capture            | Increase              | User answers become provenance-backed decisions or explicit assumptions     |
| Draft artifact completion   | Increase              | Projects generate all three primary Markdown artifacts                      |
| Reopen reliability          | 100% target           | Closed projects reopen with conversation and state intact                   |
| Cross-document consistency  | 0 blocking mismatches | BRD, PRD, and ERD pass deterministic validation                             |
| Provider transparency       | 100% target           | Mock mode is explicit and provider failures never silently downgrade        |
| Local data safety           | 0 credential leaks    | API keys never appear in state, artifacts, logs, exports, or Git            |

Avoid billing, conversion, subscription, or hosted usage metrics in V1.
