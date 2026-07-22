# API Contracts

All endpoints require an authenticated session unless marked otherwise. Respond with JSON. Use opaque UUIDs.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/projects` | Create project from name, idea, target readiness |
| GET | `/api/projects/:id` | Read project and latest state |
| POST | `/api/projects/:id/interview/next` | Create next bounded round |
| POST | `/api/questions/:id/answer` | Validate and apply one answer |
| POST | `/api/projects/:id/references` | Queue URL/public repo analysis |
| GET | `/api/projects/:id/readiness` | Return scores, blockers, and evidence |
| POST | `/api/projects/:id/exports` | Queue deterministic package render |
| GET | `/api/exports/:id/download` | Signed temporary download URL |
| POST | `/api/billing/invoices` | Create Cloud Starter QRIS invoice |
| POST | `/api/webhooks/sumopod` | Public verified provider callback |

### `POST /api/questions/:id/answer`

Request: `{ "choiceId": "shared_customer", "note": "Sales leads can overlap" }`.

Response: `{ "stateVersion": 8, "decisions": ["customer_identity"], "newContradictions": [] }`.

Reject answers from a question outside the caller's workspace or no longer matching the current state version.
