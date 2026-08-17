# Risks

| Risk                                                       | Impact | Mitigation                                                                                   |
| ---------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| A model proposes a generic question                        | High   | Require project nouns, requirement mapping, material impact, and quality rejection tests     |
| A strong inference is mistaken for a user decision         | High   | Preserve confidence and provenance; require confirmation for material decisions              |
| Decision changes leave stale artifacts                     | High   | Keep typed affected-concept edges and deterministic consistency validation                   |
| Reference content contains prompt injection                | High   | Treat all external content as untrusted evidence and isolate it from system instructions     |
| Remote provider retains sensitive project context          | High   | Explain provider-bound processing, support local Mock/Ollama, avoid default telemetry        |
| Local secrets are exposed by logs or exports               | High   | Separate provider config from project state and redact at boundaries                         |
| SQLite local file is copied or accessed by another OS user | Medium | Document local-machine trust boundary and use restrictive file permissions where supported   |
| Legacy Alpha code keeps pulling SaaS assumptions into V1   | High   | Maintain reset documents, search stale references, and remove obsolete runtime dependencies  |
| UI becomes a dashboard despite chat-first direction        | Medium | Keep context in drawers/sheets and test first launch in a real browser                       |
| Agent asks too many questions                              | Medium | Use stop conditions, risk-weighted gaps, and allow safe implementation defaults in artifacts |

## Explicitly accepted V1 limitations

No hosted collaboration, remote account boundary, managed AI, payment system, or automatic Alpha PostgreSQL migration is provided.
