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

The current Agentic V1 runtime reads the OpenAI-compatible configuration from local environment variables. The provider settings surface is a UI direction, not yet a persisted multi-provider configuration manager.

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

Provider setup is progressive. Do not block first launch with configuration. The settings sheet below is the intended product direction; the current Agentic V1 runtime reads the implemented OpenAI-compatible configuration from local environment variables rather than persisting a multi-provider profile from this UI. When AI is required, open a compact settings sheet:

```text
AI Provider
Provider: [ OpenAI Compatible ]
Base URL: [ ... ]
API Key: [ stored locally ]
Model: [ ... ]
[Test connection]
```

The explicit Mock Provider is available for offline demo and test flows. A real provider failure shows a retry/settings action and never silently changes to mock mode.

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
