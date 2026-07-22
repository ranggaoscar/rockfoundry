# Authentication and Permissions

Use an email-based sign-in provider with verified sessions. In MVP, each workspace has one owner and no member roles.

| Resource | Owner | Anonymous | Payment provider |
|---|---|---|---|
| Project/state/interview/reference | Read/write | Deny | Deny |
| Export | Create/download | Deny | Deny |
| Subscription/invoice | Read/create | Deny | Writes only through verified webhook |
| Webhook endpoint | Deny | Provider signature only | Create event/entitlement |

Check workspace ownership server-side using the authenticated user ID. Do not trust a project ID supplied by the browser.
