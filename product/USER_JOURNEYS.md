# User Journeys

## Journey 1: rental booking idea

A builder writes: `I want to build a rental car booking system for several branches.` RockFoundry keeps the idea in the conversation, identifies branches and vehicles, and asks whether customer history should remain connected across branches. The builder answers naturally or chooses an option. The decision is recorded with user provenance and drives the next question.

## Journey 2: marble warehouse inventory

A builder writes: `I need inventory for three marble warehouses.` RockFoundry asks whether a slab transfer should preserve full movement history or only the current location. It records the answer, checks for contradictions with stock ownership, and continues until the warehouse workflow and data relationships are sufficiently defined.

## Journey 3: reference-led planning

A builder pastes a public URL or GitHub repository into the chat. RockFoundry inspects it selectively, reports relevant and irrelevant patterns, records license and source evidence, and asks how the pattern should apply to the builder's product. It does not copy branding, proprietary copy, imagery, or source code.

## Journey 4: artifact handoff

When the project reaches draft-ready or build-ready status, the builder asks for the documents. RockFoundry generates `BRD.md`, `PRD.md`, and `ERD.md`, shows their statuses in a lightweight Documents view, and lets the builder preview, copy, download, or export them for a coding agent.
