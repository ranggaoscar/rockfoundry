# AI Providers and BYOK

RockFoundry is free and open source. Users bring their own provider key or choose the explicit Mock Provider.

## Supported architecture

| Provider        | Adapter                         | Notes                                                |
| --------------- | ------------------------------- | ---------------------------------------------------- |
| OpenAI          | OpenAI-compatible               | Native OpenAI base URL and chat/completions contract |
| OpenRouter      | OpenAI-compatible               | User supplies base URL, key, and model               |
| 9Router         | OpenAI-compatible               | User supplies local/provider endpoint configuration  |
| Ollama          | OpenAI-compatible where enabled | Local endpoint, usually no remote key                |
| Custom endpoint | OpenAI-compatible               | User controls base URL and model                     |
| Anthropic       | Anthropic adapter               | Native messages API                                  |
| Gemini          | Gemini adapter                  | Native Gemini API                                    |

V1 needs one active profile. The model and UI should not hardcode a single vendor. Multiple named profiles can be added later.

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

Provider setup is progressive. Do not block first launch with configuration. When AI is required, open a compact settings sheet:

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
