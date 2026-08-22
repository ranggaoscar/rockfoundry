# AI Providers and BYOK

RockFoundry is free and open source. Users bring their own provider key or choose the explicit Mock Provider.

## Supported architecture and current status

| Provider or mode | Adapter / path                  | Current status                    | Notes                                                            |
| ---------------- | ------------------------------- | --------------------------------- | ---------------------------------------------------------------- |
| Mock Provider    | Local deterministic provider    | **Implemented**                   | Offline demos, tests, and E2E.                                   |
| OpenAI           | OpenAI-compatible               | **Implemented**                   | Uses the current configurable chat-completions path.             |
| OpenRouter       | OpenAI-compatible               | **Available through the adapter** | User supplies a compatible base URL, key, and model.             |
| 9Router          | OpenAI-compatible               | **Available through the adapter** | User supplies a compatible endpoint configuration.               |
| Ollama           | OpenAI-compatible where enabled | **Available through the adapter** | Local endpoint; capability depends on the Ollama-compatible API. |
| Custom endpoint  | OpenAI-compatible               | **Available through the adapter** | User controls the base URL and model.                            |
| Anthropic        | Native messages API             | **Architecture target**           | Native adapter is not wired into the current runtime.            |
| Gemini           | Native Gemini API               | **Architecture target**           | Native adapter is not wired into the current runtime.            |

V1 needs one active profile. The model and UI should not hardcode a single vendor. Multiple named profiles can be added later.

The current Agentic V1 runtime supports one active OpenAI-compatible configuration. Resolve order is: explicit environment configuration, persisted OS-aware application-data configuration, then explicit Mock mode. The runtime resolves this configuration for each gateway request, so saving a profile in Settings does not require a restart. The Settings panel marks environment-managed runtimes and names the controlling `AI_PROVIDER_MODE` and `OPENAI_COMPATIBLE_*` variables.

## Provider contract

```ts
interface AIProvider {
  id: string;
  testConnection(): Promise<TestResult>;
  complete(request: CompletionRequest): Promise<AIResponse>;
  runAgent(request: AgentRequest): Promise<AgentResponse>;
}
```

All structured agent output is validated against Zod action schemas before it can affect local state.

## Settings UX

Provider setup is progressive. Do not block first launch with configuration. When AI is required, open the compact settings sheet, select a preset, save a local profile, test it, and optionally discover its models:

```text
AI Provider
Provider: [ OpenAI Compatible ]
Base URL: [ ... ]
API Key: [ stored locally ]
Model: [ ... ]
[Test connection]
```

The explicit **Offline Mock** preset is available for offline demo and test flows and persists as the active local profile. **Ollama** may be saved and tested without an API key. Use **Clear saved provider** to delete the persisted local profile; an environment-managed profile remains active until its variables are removed. A real provider failure shows a retry/settings action and never silently changes to mock mode.

## Key storage

Keys are not project data. Store them outside SQLite project records using an OS-aware application configuration directory or secure OS credential storage where straightforward. Never include keys in:

- conversation messages;
- canonical state;
- BRD, PRD, or ERD;
- logs and debug output;
- tool activity;
- exports;
- analytics;
- Git.

## Provider privacy

Local-first does not mean zero data leaves the machine. A prompt, selected references, and project context sent to a configured provider leave the machine. The user chooses the provider and is responsible for reviewing its retention and training policy. Mock and local Ollama runs can keep inference local.

## Failure handling

Normalize provider failures into safe user-facing states:

```text
RockFoundry couldn't reach your configured AI provider.
[Retry] [Open Provider Settings]
```

Do not show raw provider payloads, API keys, stack traces, or internal JSON to normal users.
