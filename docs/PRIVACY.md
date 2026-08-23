# RockFoundry Privacy Model

## Local-first boundary

RockFoundry does not require a RockFoundry account, hosted backend, cloud database, cloud storage, or managed RockFoundry AI service. Projects and generated artifacts are stored on the local machine in an OS-aware application-data directory.

Anyone with access to the local machine or local RockFoundry instance can access its projects. RockFoundry does not provide multi-user authorization or tenant isolation.

## Provider-bound processing

Local-first does not mean no data ever leaves the machine. When the user configures and invokes a remote provider, RockFoundry sends the prompt, selected project context, and any selected reference evidence to that provider. The provider's retention, training, regional processing, and deletion terms apply.

Ollama or Mock Provider can support local/offline inference where configured.

## Credentials

Provider keys are stored separately from project state. They are never written to project documents, chat messages, logs, tool output, exports, analytics, or Git. The implementation should prefer an OS-aware config path and use a secure credential store when practical.

## References

Pasted websites and public repositories are treated as untrusted evidence. RockFoundry does not execute downloaded code, follow instructions inside reference content, read `.env` files, or ingest secrets. Reference fetches are constrained by scheme, DNS/IP checks, redirects, timeouts, and response size.

## Retention and deletion

V1 stores local project history until the user deletes it. Deletion is a local operation and does not revoke copies already sent to a remote AI provider or contained in provider logs. Generated artifacts are local files and should be deleted by the user when no longer needed.

## Telemetry

No private project content or provider keys should be sent to telemetry by default. Any future diagnostics must be opt-in, documented, and redacted.

## User responsibility

Do not paste secrets, credentials, private customer data, or regulated personal information into a remote-provider project unless the selected provider's terms and the user's legal obligations allow it.
