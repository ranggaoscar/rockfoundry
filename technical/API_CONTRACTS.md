# API Contracts

The local web app exposes JSON route handlers. No endpoint requires a RockFoundry account in V1. The local machine is the access boundary.

## Project and conversation

| Method   | Path                         | Purpose                                           |
| -------- | ---------------------------- | ------------------------------------------------- |
| `GET`    | `/api/projects`              | List local projects                               |
| `POST`   | `/api/projects`              | Create a local project from name and rough idea   |
| `GET`    | `/api/projects/:id`          | Read project and canonical state                  |
| `PATCH`  | `/api/projects/:id`          | Rename or apply a validated state patch           |
| `DELETE` | `/api/projects/:id`          | Delete a local project                            |
| `GET`    | `/api/projects/:id/messages` | Read conversation messages                        |
| `POST`   | `/api/projects/:id/messages` | Append a user message and run the next agent step |

## Discovery

| Method | Path                           | Purpose                                         |
| ------ | ------------------------------ | ----------------------------------------------- |
| `GET`  | `/api/projects/:id/questions`  | Return the next contextual question             |
| `POST` | `/api/projects/:id/questions`  | Apply a user answer as a decision or assumption |
| `GET`  | `/api/projects/:id/readiness`  | Return compact readiness and blockers           |
| `GET`  | `/api/projects/:id/decisions`  | Read decision history and affected concepts     |
| `GET`  | `/api/projects/:id/references` | List references and safe analysis summaries     |
| `POST` | `/api/projects/:id/references` | Inspect a public URL or GitHub repository       |
| `GET`  | `/api/projects/:id/tools`      | Read safe tool activity summaries               |

## Providers

| Method | Path                          | Purpose                                                         |
| ------ | ----------------------------- | --------------------------------------------------------------- |
| `GET`  | `/api/settings/provider`      | Read active provider metadata without secrets                   |
| `PUT`  | `/api/settings/provider`      | Save local provider metadata/secret through the config boundary |
| `POST` | `/api/settings/provider/test` | Test the configured provider                                    |

## Artifacts

| Method | Path                                | Purpose                                    |
| ------ | ----------------------------------- | ------------------------------------------ |
| `POST` | `/api/projects/:id/artifacts`       | Generate BRD, PRD, ERD, or all             |
| `GET`  | `/api/projects/:id/artifacts`       | List artifact statuses                     |
| `GET`  | `/api/projects/:id/artifacts/:type` | Preview Markdown                           |
| `GET`  | `/api/projects/:id/export`          | Download the three-document project export |

## Agent action envelope

```json
{
  "type": "ASK_USER",
  "reason": "customer ownership changes permissions and the ERD",
  "payload": {},
  "requiresApproval": true,
  "source": "AGENT_INFERENCE"
}
```

The server validates the action type and payload, checks state version and permissions, then invokes the deterministic handler. The browser never posts an arbitrary database mutation.

## Error contract

Normal users receive safe, actionable messages:

```json
{
  "error": {
    "code": "PROVIDER_UNAVAILABLE",
    "message": "RockFoundry couldn't reach your configured AI provider.",
    "retryable": true
  }
}
```

Do not return stack traces, raw provider JSON, Prisma errors, or secrets to the browser.

## Removed contracts

There are no V1 billing, payment, webhook, subscription, entitlement, login, signup, account, or hosted-download contracts.
