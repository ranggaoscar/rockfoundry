# Security and Privacy

## Baseline controls

- Enforce HTTPS, secure HTTP-only sessions, CSRF protection where applicable, and server-side authorization.
- Encrypt provider keys at rest and redact keys, cookies, authorization headers, and repository tokens from logs.
- Limit reference fetching to public `http`/`https` with DNS/IP protections against private networks, redirect limits, response-size caps, and timeouts.
- Parse public repositories through a provider API or sandboxed fetch; never execute fetched code.
- Rate-limit auth, interview generation, reference analysis, export, invoice, and webhook endpoints.
- Record security-relevant audit metadata without raw sensitive prompt content.

## Data policy requirement before launch

Publish retention, deletion, provider-sharing, managed-AI privacy, export expiry, and incident-contact policies. Clearly distinguish managed AI from BYOK. Do not send private project content to a provider whose data terms do not meet the selected privacy mode.
