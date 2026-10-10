# RF-002 — Hermes live connection inspection

> Historical inspection blocker; superseded by operator RF-002B provisioning and `docs/RF-002C-RELEASE.md`. Do not apply this old access-state report to the newly provisioned service.

## Status: BLOCKED — no live execution submitted

Continue on `feat/rf-001-work-os` at starting HEAD `3807dce`. RF-001 working-tree changes and the user-owned `IDEA.md` are preserved. RF-002 makes no application, database, credential, Hermes, gateway, cron, SSH-authentication or firewall changes. This report is the only new repository file.

The required VPS configuration cannot currently be inspected/provisioned through the authorized SSH account. Stop the live portion rather than bypassing access or using a prompt-only tool restriction.

## Verified VPS environment

- Host: `43.129.53.241`, hostname `VM-0-77-ubuntu`.
- Authorized access: SSH user `hermes` (uid 1003) with existing `hermes_bresciahub` identity. No root/ubuntu login attempted.
- `hermes-gateway.service` is active/running as `ubuntu:ubuntu`.
- Hermes home: `/opt/hermes-agent/home` (whitelisted systemd environment metadata).
- Runtime source path observed in the gateway command: `/opt/hermes-agent/app`.
- Parent `/opt/hermes-agent` is mode `0700`, uid 1000. Config, secrets, source, profile and effective-tool metadata are permission-denied to `hermes`.
- The authorized sudo allowlist covers BresciaHub and Magrade wrappers only. It provides no Hermes diagnostics/provisioning/profile/service command.
- No `API_SERVER_ENABLED`, host/port or key override appears in the unit's whitelisted environment metadata. This does **not** prove the resolved setting is absent from private config or `.env`.

## API endpoint status

| Probe                                                                  | Result                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------ |
| VPS `127.0.0.1:8642` TCP                                               | connection refused / no listener                 |
| VPS `127.0.0.1:8643` TCP                                               | connection refused / no listener                 |
| VPS `/health` and `/v1/capabilities` at those ports                    | unavailable                                      |
| Private Tailscale `100.85.53.89:3301` `/health` and `/v1/capabilities` | HTTP 400; not verified as compatible Runs API    |
| Authenticated Runs capability discovery                                | not possible without a verified API endpoint/key |

**Unverified:** the actual API-enabled configuration flag, a custom configured API port, the deployed Runs API version/compatibility and the effective tool allowlist. No API credential values were retrieved or printed.

Do not describe the API as definitively disabled: the evidence proves default endpoints are unavailable, while resolved private configuration remains unreadable.

## Private connection method tested

Local Foundry backend → SSH local forwarding → VPS loopback Hermes API. No public bind, reverse proxy, DNS, firewall or published port was changed.

Temporary diagnostic tunnel:

```bash
ssh -N \
  -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=20 \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=15 -o ServerAliveCountMax=2 \
  -i 'C:/Users/rangg/.ssh/hermes_bresciahub' \
  -L 127.0.0.1:18642:127.0.0.1:8642 \
  hermes@43.129.53.241
```

The tunnel bound **only** to local `127.0.0.1:18642`. Connecting through it produced SSH `open failed: connect failed: Connection refused` for the remote target and curl HTTP 000. This verifies the private forwarding path was permitted, not that a Hermes API exists behind it.

The diagnostic tunnel was stopped and the local listener was verified absent. Once a separately approved restricted API port is provisioned, use that verified port instead of assuming 8642. The existing HTTP adapter can use `http://127.0.0.1:18642` as its server-side base URL; it is deliberately not configured with an unverified target or fabricated key.

## Effective access control / first-run gate

No tool restrictions could be verified on the remote Hermes runtime. A task prompt that asks for read-only behavior is not an access-control boundary, so **no task was submitted** to the unrestricted/unknown default gateway.

Before the one live smoke run, the authorized VPS operator must provision or identify an isolated Foundry Hermes profile/runtime with:

1. Separate profile state and API credential, without cloning messaging tokens, scheduled jobs, memories or unrelated plugins.
2. An API listener restricted to VPS loopback, reached through SSH forwarding.
3. Runtime-enforced exact allowlist of harmless read-only tools, or an empty toolset for the controlled input-only smoke task. Explicitly exclude shell/process, code execution, file writes/patches, email/WhatsApp/Telegram sends, skill/memory mutations, cron management, delegation and other side-effect tools. A broad `safe` bundle is not proof until its actual tool names/dispatch enforcement are verified.
4. Verification that disabled tools cannot be dispatched, and plugins/MCP/tool discovery do not reintroduce excluded operations.
5. No use of the existing Telegram/cron profile for the smoke, no restart of its service, and no new public ingress.
6. A redacted metadata/read-only diagnostic surface or narrowly scoped provisioning wrapper accessible to the authorized `hermes` account. Do not widen the account to unrestricted sudo/docker/root access.

Profile isolation is supported by official Hermes documentation, but the specific deployed version and its runtime configuration are not readable here. Provisioning commands must be derived from that installed version's CLI/source, not guessed from newer docs.

## Integration outcome and preservation checks

- Real Hermes runs submitted: **0**.
- Foundry tasks/runs/results/reviews created by RF-002: **0**.
- Server-side endpoint/key configured: **no**; live prerequisites are blocked.
- No silent Mock fallback.
- No tests from RF-001 were rerun and no code was changed without a demonstrated issue.
- No live gateway restart, tool invocation, terminal command by an agent, message, purchase, file modification or production deployment was triggered.
- Existing gateway checked before/after: same MainPID `1523251`, `NRestarts=0`, start timestamp `2026-10-08 21:27:12 WIB`, still active/running.
- Telegram operation and scheduled-job execution were not exercised or claimed healthy; their private configuration was untouched.
- Local read-only DB check: 144 projects, 847 conversation messages, 335 artifacts, 656 project revisions; Task/AgentExecution/Approval/Evidence/ActivityEvent counts remain zero. SQLite integrity `ok`; FK check has no violations. No migration or database write was performed in RF-002.

## Recovery scenarios

RF-001 already preserves execution identity, external ID and immutable input; its accepted tests covered ambiguous admission replay, terminal/missing status and credential binding. They were not repeated in this blocked iteration.

Because no live endpoint/run exists, **gateway restart, lost live connectivity, expired live status and terminal failure remain unverified against the deployed Hermes service**. Do not simulate them by restarting the owner's Telegram gateway or by submitting additional live runs.

On resumption, use one persisted task/run/request identity for the approved harmless smoke. Reconcile ambiguous outcomes with that identity; never use a new request to bypass a pending execution or expired server replay window. Poll existing external IDs rather than resubmitting after 404/failure. Owner review must remain a real explicit acceptance, not invented by the agent.

## Exact remaining blocker / next action

`AUTHORIZED_HERMES_PROFILE_API_PROVISIONING_UNAVAILABLE`:

The `hermes` account cannot read `/opt/hermes-agent` and has no permitted Hermes provisioning/service wrapper. Default loopback APIs are unavailable and no isolated restricted executor/key is supplied. An SSH tunnel cannot create the missing backend or prove tool restrictions.

**Required next action within RF-002:** authorized VPS operator provisions the isolated restricted loopback API plus redacted metadata/key handoff, or provides an existing verified private restricted endpoint. Then complete one controlled Foundry → Hermes → persisted result → owner review/acceptance smoke. No scope expansion into RF-003.

## References

- Official profiles/isolation: https://hermes-agent.nousresearch.com/docs/user-guide/profiles
- Official configuration/toolsets: https://hermes-agent.nousresearch.com/docs/user-guide/configuration
- Official API contract already used by the adapter: https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
