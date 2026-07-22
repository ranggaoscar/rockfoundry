# Adaptive Interview Engine

The engine converts each project state into the next highest-value question. It asks at most three questions per round and never presents a global questionnaire.

## Flow

1. Extract project type, actors, objects, channels, constraints, and stated goals.
2. Create candidate decisions from the requirements graph.
3. Discard decisions already answered or safely inferred.
4. Rank remaining decisions by cost of being wrong, dependency count, and readiness gap.
5. Draft questions with project nouns, a recommendation, and consequence of each option.
6. Validate question quality; regenerate failures.
7. Apply answer as a decision, assumption, or open question and recheck conflicts.

## Hard rules

- Include at least one specific noun from the project profile.
- Ask one decision per question.
- Explain impact in non-technical language.
- Prefer a recommended default plus 2–3 choices over a blank prompt.
- Do not ask inferred facts as open questions; request confirmation instead.

## Quality gate

Reject a question if it would make equal sense for a restaurant, marketplace, and hospital without changing any words. Reject questions that do not change product behavior, design, architecture, cost, risk, or launch.

## Example

For the marble dashboard: “When the same phone number contacts two marble brands, should sales staff see one shared customer profile or separate records per brand?”
