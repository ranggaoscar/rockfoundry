# AI Providers and BYOK

RockFoundry is free and open source. Use **Offline Mock** without credentials, or bring an OpenAI-compatible provider from Settings.

## Current provider behavior

| Provider or mode | Current behavior                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| Offline Mock     | Deterministic, network-free discovery and prototype behavior for demos, tests, and evaluation. |
| OpenAI           | Supported through the OpenAI-compatible path.                                                  |
| OpenRouter       | Supported when configured with a compatible base URL, key, and model.                          |
| Ollama           | Supported when its OpenAI-compatible endpoint is enabled.                                      |
| Custom endpoint  | Supported when it implements the configured OpenAI-compatible contract.                        |

RockFoundry resolves one active provider configuration for each request: explicit environment configuration first, then persisted OS-aware local configuration, then explicit Mock mode. Saving a Settings profile takes effect without restarting the app.

## What real providers do

With a real OpenAI-compatible provider configured:

- discovery uses the selected model to help structure product context;
- Design Studio generates a validated `DesignSpec` plus `index.html`, `styles.css`, and `app.js`;
- conversational design revisions can regenerate the existing prototype.

The deterministic Screen Map and confirmed product truth remain authoritative. A provider supplies presentation and prototype output inside those boundaries.

## Settings

Provider setup is progressive: first launch works in Offline Mock without configuration. To connect a provider, open **Settings**, select a compatible preset, save the base URL, model, and API key, then test the connection.

```text
AI Provider
Provider: [ OpenAI Compatible ]
Base URL: [ ... ]
API Key: [ stored locally ]
Model: [ ... ]
[Test connection]
```

**Offline Mock** is explicit and remains useful for deterministic local work. **Ollama** can be saved and tested without an API key. **Clear saved provider** removes the persisted local profile; an environment-managed profile remains active until its variables are removed.

A real provider failure shows a safe user-facing error and does **not** silently switch to Mock.

## Environment configuration

Environment configuration takes priority over Settings:

```bash
AI_PROVIDER_MODE="openai-compatible"
OPENAI_COMPATIBLE_BASE_URL="https://api.openai.com/v1"
OPENAI_COMPATIBLE_API_KEY="your-key"
OPENAI_COMPATIBLE_MODEL="gpt-4o-mini"
```

## Prototype safety

Generated prototypes are interactive references, not production application architecture. Before persistence and preview, RockFoundry validates generated HTML, CSS, and JavaScript. The preview runs sandboxed. External scripts/styles, unsafe network behavior, unsafe embeds, and invalid output are rejected.

## Key storage and privacy

Keys are not project data. They stay outside SQLite project records in OS-aware local application configuration. Never include keys in:

- conversation messages;
- canonical project state;
- BRD, PRD, ERD, DesignSpec, or prototype files;
- logs and debug output;
- exports;
- Git.

Local-first does not mean zero data leaves the machine: project context sent to a configured provider leaves the machine. You choose the provider and should review its retention and training policy. Offline Mock and local Ollama can keep inference local.

## Failure handling

Provider failures must resolve to safe user-facing states, such as:

```text
RockFoundry couldn't reach your configured AI provider.
[Retry] [Open Provider Settings]
```

Do not show raw provider payloads, API keys, stack traces, or internal JSON to normal users.
