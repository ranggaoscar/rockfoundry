# Requirements Graph

The graph is a small, explicit ruleset—not an LLM memory. Nodes hold facts; edges express dependencies and conflicts.

## Node types

| Node       | Example                         |
| ---------- | ------------------------------- |
| Actor      | sales admin                     |
| Entity     | customer, quotation, brand      |
| Capability | reply to WhatsApp chat          |
| Constraint | five brands share one workspace |
| Decision   | customer profile is cross-brand |
| Assumption | no public registration          |
| Risk       | WhatsApp session disconnects    |

## Required checks

- A capability that creates or changes data needs an actor and permission.
- An external integration needs a failure state and data boundary.
- A multi-tenant or multi-brand statement needs data ownership and visibility rules.
- A paid public service needs entitlement, payment verification, and support paths.
- Production readiness requires backup, access control, privacy, and deployment decisions.

## Contradiction examples

`public signup = false` conflicts with `any shop can create an account`.
`customer visibility = per brand` conflicts with `single customer record visible across brands` unless access rules qualify it.
