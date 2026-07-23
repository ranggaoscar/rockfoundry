# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| alpha   | ✅                 |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it privately:

1. **Do not** open a public GitHub issue.
2. Email the maintainers or open a private security advisory on GitHub.
3. Include the affected version, a description, and reproduction steps.

We will respond within 48 hours and work on a fix.

## Scope

- Authentication bypass
- Data leakage
- Remote code execution
- Path traversal
- SSRF (Server-Side Request Forgery)

The following are out of scope:

- Missing rate limiting (noted but not critical)
- Missing security headers in alpha
- Self-XSS
