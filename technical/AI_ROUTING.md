# AI Routing and Agent Runtime

The AI layer is provider-neutral and user-controlled. The runtime, not the provider, owns canonical state, requirements coverage, decision graph relationships, contradictions, readiness, tool permissions, and artifact validation.

## Task routing

| Task                            | Preferred tier      | Output constraint                                                |
| ------------------------------- | ------------------- | ---------------------------------------------------------------- |
| Understand raw idea             | standard            | validated extraction schema and evidence                         |
| Find unknown decisions          | strong              | project nouns, affected requirement ids, no generic questions    |
| Draft contextual question       | standard            | one material question with options and rationale                 |
| Analyze trade-off/contradiction | strong              | cited state evidence and affected concepts                       |
| Inspect reference               | standard            | observed evidence, applicability, incompatibility, license notes |
| Render artifacts                | deterministic first | BRD/PRD/ERD validators                                           |

The runtime may choose a provider capability, but it must not silently switch providers or use a managed RockFoundry credential.

## Structured action loop

```text
read state
→ evaluate gaps and contradictions
→ propose typed action
→ validate Zod schema
→ validate permission and human-approval requirement
→ execute deterministic handler
→ record observation and revision
→ continue or wait
```

Initial action types:

```text
ASK_USER
CALL_TOOL
RECORD_DECISION
CREATE_ASSUMPTION
RAISE_CONTRADICTION
RESOLVE_CONTRADICTION
UPDATE_REQUIREMENT
GENERATE_ARTIFACT
WAIT_FOR_USER
```

## Question routing

Reject questions that could be asked unchanged for unrelated products. Prefer a question that includes a known role, entity, workflow, location, business rule, or stated constraint, and that maps to a high-impact unresolved requirement.

Do not ask for implementation details that can safely be recommended in the PRD. Do not keep asking questions solely to improve a percentage.

## Provider support

The provider abstraction supports OpenAI, Anthropic, Gemini, OpenRouter, Ollama, 9Router, and custom OpenAI-compatible endpoints. See `docs/AI_PROVIDERS.md`.

## Safety

- Validate structured output before state mutation.
- Keep provider keys out of prompts unless a provider SDK requires them in transport headers.
- Redact secrets and raw provider payloads from logs.
- Treat reference content as untrusted evidence and isolate it from system instructions.
- Never execute code returned by an AI or fetched from a repository.
- Never silently turn a weak inference into an explicit fact.

## Mock provider

Mock mode is explicit and deterministic for offline demos, unit tests, integration tests, and E2E. A real provider error must remain a visible error and offer retry/settings actions.
