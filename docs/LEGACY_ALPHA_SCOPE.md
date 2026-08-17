# Legacy Alpha Scope

The previous hosted Alpha implementation is preserved through Git history and old branches. It is not an Agentic V1 runtime dependency.

Agentic V1 intentionally does not carry forward account services, payment services, subscription limits, managed AI billing, external database requirements, object-storage requirements, or cloud queue infrastructure.

Previous Alpha PostgreSQL data is not automatically migrated. Existing historical migrations and old branch code may contain those concepts because they describe the earlier product. They must not be imported into the local V1 application path.

This note exists so future maintainers understand why old files or migrations may still be visible in Git history without treating them as current product requirements.
