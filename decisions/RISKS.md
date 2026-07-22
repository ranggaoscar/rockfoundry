# Risks

| Risk | Impact | Mitigation | Trigger |
|---|---|---|---|
| Generic interview feels like a form | Core value fails | Enforce graph and question quality gate; sample-review exports | >5% generic rate |
| Model cost exceeds Rp49k economics | Margin loss | Budgets, model tiers, export quotas, BYOK fallback | Cost/export crosses target |
| Free/cheap provider changes terms | Service degradation | Approved-provider fallback and no unlimited promise | Provider health/terms change |
| Reference fetching causes SSRF or abuse | Security incident | Egress controls, URL validation, size/time limits | Private-IP or timeout event |
| Payment webhook error grants wrong access | Revenue/access issue | Signature/amount checks, idempotency, reconciliation | Duplicate/mismatched event |
| Docs drift from state | Broken agent handoff | Manifest-first render and export consistency test | Export mismatch |
| SaaS costs/support exceed solo capacity | Poor experience | Narrow MVP and pilot before broad marketing | Support backlog grows |
