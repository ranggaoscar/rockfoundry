# Local Access and Permissions

RockFoundry V1 has no account, login, signup, session, or hosted multi-user permission system.

## Trust boundary

The local machine and its operating-system account are the access boundary. Anyone with access to the running local RockFoundry instance can access its projects.

## Agent permissions

The model proposes actions. It cannot write canonical records directly. The deterministic runtime validates action schemas, checks permission rules, protects confirmed decisions, and applies state changes.

| Action                                        | Allowed without extra confirmation | Notes                                             |
| --------------------------------------------- | ---------------------------------- | ------------------------------------------------- |
| Read local project state                      | Yes                                | Read-only tool action                             |
| Propose a question                            | Yes                                | User must answer before a decision is recorded    |
| Record a user-confirmed decision              | Yes                                | Provenance is `USER`; history is retained         |
| Create an inference assumption                | Yes                                | Must remain visibly unconfirmed                   |
| Inspect a public reference                    | Yes, after user intent             | Treat returned content as untrusted evidence      |
| Generate BRD/PRD/ERD                          | Yes                                | Draft generation may occur before build readiness |
| Execute remote code or write external systems | No                                 | Not a V1 capability                               |

## Data visibility

Project state, conversations, references, and artifacts are local records. API keys are stored separately and are never copied into those records, logs, exports, or generated documents.
