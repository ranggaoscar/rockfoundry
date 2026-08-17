# Security Policy

RockFoundry V1 is local-first. The local machine and its OS account are the primary trust boundary. V1 does not provide hosted accounts, remote tenant isolation, or a RockFoundry-managed backend.

## Supported versions

| Version                    | Support            |
| -------------------------- | ------------------ |
| Agentic V1 on `agentic-v1` | Active development |

## Security principles

- Keep provider keys outside project state and artifacts.
- Redact keys, authorization headers, cookies, and secret-bearing payloads from logs.
- Treat public website and GitHub content as untrusted reference data.
- Never execute fetched repository code or follow reference instructions.
- Protect public fetchers against SSRF, private IPs, redirect loops, oversized responses, and long timeouts.
- Never read `.env` files from inspected repositories.
- Validate every agent action against a Zod schema and deterministic permission handler.
- Preserve provenance and revision history for material decisions.
- Do not expose chain-of-thought, raw provider payloads, internal tool JSON, or stack traces in the UI.

## Data leaving the machine

Prompts and selected project context sent to a configured remote provider leave the local machine. Review [`docs/PRIVACY.md`](docs/PRIVACY.md) before using sensitive data.

## Reporting a vulnerability

Do not open a public issue for an exploitable vulnerability. Use a private GitHub security advisory or contact the maintainer privately with the affected version, impact, and reproduction steps. Do not include live API keys or personal customer data in the report.

## Scope

Report local data leakage, provider-key exposure, path traversal, SSRF, prompt-injection execution, unsafe repository access, action-validation bypass, and artifact export leakage.
