# Open Product Questions

These questions describe V1 implementation choices, not a SaaS roadmap.

| ID     | Question                                                                    | Default                                                                   |
| ------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| OQ-100 | Which OS credential store should be the first secure provider-key backend?  | Start with OS-aware config boundary and document limitations              |
| OQ-101 | Should streaming begin with Server-Sent Events or a request/response loop?  | Stabilize structured action contract first                                |
| OQ-102 | Should project export be a folder, ZIP, or both in the first local release? | Folder plus optional ZIP convenience                                      |
| OQ-103 | Which artifact preview renderer should be used for Markdown and Mermaid?    | Use a dependency-light local preview                                      |
| OQ-104 | Which additional domain fixtures best expose generic-question failures?     | Keep marble warehouse, rental booking, sales CRM, and operations fixtures |

## Not V1 questions

Payment providers, subscription pricing, account ownership, hosted database selection, managed AI budgets, Cloud Starter limits, and SumoPod webhooks are cancelled product scope, not open questions.
