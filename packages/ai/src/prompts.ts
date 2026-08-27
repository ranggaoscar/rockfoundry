import { z } from "zod";

// Prompt version tracking
export interface PromptVersion {
  id: string;
  version: string;
  createdAt: string;
  description: string;
}

export const PROMPT_VERSIONS: Record<string, PromptVersion> = {
  initial_idea_extraction: {
    id: "initial_idea_extraction",
    version: "1.0.0",
    createdAt: "2026-07-23",
    description: "Extract structured information from raw product idea",
  },
  contextual_question_enrichment: {
    id: "contextual_question_enrichment",
    version: "1.0.0",
    createdAt: "2026-07-23",
    description: "Generate contextual questions based on project state",
  },
  ambiguity_analysis: {
    id: "ambiguity_analysis",
    version: "1.0.0",
    createdAt: "2026-07-23",
    description: "Analyze ambiguous aspects of the product idea",
  },
  contradiction_review: {
    id: "contradiction_review",
    version: "1.0.0",
    createdAt: "2026-07-23",
    description: "Review extracted data for contradictions",
  },
  website_reference_analysis: {
    id: "website_reference_analysis",
    version: "1.0.0",
    createdAt: "2026-07-23",
    description: "Analyze a website reference against project objectives",
  },
  github_reference_analysis: {
    id: "github_reference_analysis",
    version: "1.0.0",
    createdAt: "2026-07-23",
    description: "Analyze a public GitHub repository structure",
  },
  documentation_enrichment: {
    id: "documentation_enrichment",
    version: "1.0.0",
    createdAt: "2026-07-23",
    description: "Enrich generated documentation with AI clarity improvements",
  },
  final_consistency_review: {
    id: "final_consistency_review",
    version: "1.0.0",
    createdAt: "2026-07-23",
    description: "Final consistency check across all generated documents",
  },
  artifact_composer: {
    id: "artifact_composer",
    version: "1.0.0",
    createdAt: "2026-08-25",
    description:
      "Compose labeled six-document Product Draft from grounded context",
  },
};

// ── Schema versioning ──────────────────────────────────────────
export const SCHEMA_VERSIONS: Record<string, string> = {
  InitialIdeaExtractionSchema: "1.0.0",
  QuestionSchema: "1.0.0",
  ReferenceAnalysisSchema: "1.0.0",
  GitHubAnalysisSchema: "1.0.0",
  ArtifactComposerOutputSchema: "1.0.0",
  ConsistencyReviewSchema: "1.0.0",
};

// ── Prompt Templates ──────────────────────────────────────────

export const SYSTEM_PROMPTS: Record<string, string> = {
  initial_idea_extraction: `You are an expert product analyst. Extract structured information from a raw product idea.

RULES:
- ONLY extract information explicitly supported by the raw idea text
- Mark confidence as EXPLICIT for directly stated facts
- Mark confidence as STRONGLY_INFERRED for high-probability inferences based on domain knowledge
- Mark confidence as WEAKLY_INFERRED for low-confidence guesses
- Mark confidence as UNKNOWN for unclear areas with no supporting evidence
- NEVER invent target users, monetization strategies, or technical stack
- NEVER return markdown or prose outside the schema
- Preserve domain-specific terminology exactly as stated
- Detect ambiguous words and multiple possible interpretations
- Always provide evidenceText showing the source span from the raw idea
- Always provide extractionReason explaining why this was extracted
- For contradictions, clearly state which two extracted items conflict
- For unsupported claims, identify claims that seem to require evidence not provided

OUTPUT SCHEMA:
{
  "normalizedSummary": { "value": "concise summary", "confidence": "EXPLICIT", "evidenceText": "...", "extractionReason": "..." },
  "productType": { "value": "e.g. SaaS, mobile app, marketplace", "confidence": "...", ... },
  "primaryUsers": [ { "value": "user type", "confidence": "...", ... } ],
  "userProblems": [ { "value": "problem statement", "confidence": "...", ... } ],
  "objectives": [ { "value": "objective", "confidence": "...", ... } ],
  "proposedCapabilities": [ { "value": "capability", "confidence": "...", ... } ],
  "coreEntities": [ { "value": "entity name", "confidence": "...", ... } ],
  "expectedWorkflows": [ { "value": "workflow description", "confidence": "...", ... } ],
  "integrationsMentioned": [ { "value": "integration name", "confidence": "...", ... } ],
  "platforms": [ { "value": "platform", "confidence": "...", ... } ],
  "businessModel": { "value": "business model", "confidence": "...", ... },
  "privacySignals": [ { "value": "privacy concern", "confidence": "...", ... } ],
  "scaleSignals": [ { "value": "scale indicator", "confidence": "...", ... } ],
  "designSignals": [ { "value": "design preference", "confidence": "...", ... } ],
  "constraints": [ { "value": "constraint", "confidence": "...", ... } ],
  "assumptions": [ { "value": "assumption", "confidence": "...", ... } ],
  "ambiguities": [ { "value": "ambiguous aspect", "confidence": "...", ... } ],
  "possibleContradictions": [ { "value": "contradicting items", "confidence": "...", ... } ],
  "unsupportedClaims": [ { "value": "unsupported claim", "confidence": "...", ... } ]
}`,

  website_reference_analysis: `You are a product analyst examining a competitor or reference website.

You are given:
1. The project objective: {objective}
2. Extracted website text: {websiteText}

Analyze how the reference website relates to the user's project objective.

Return structured output covering:
- Relevant navigation patterns observed
- Information architecture decisions
- Conversion flow patterns (signup, checkout, etc.)
- Onboarding patterns
- Interaction patterns (search, filtering, sorting, etc.)
- Content hierarchy approach
- Visual direction notes
- Patterns that are applicable to the user's project
- Patterns that are NOT applicable (and why)
- Risks of copying the pattern directly without adaptation
- Your confidence in each observation (EXPLICIT, STRONGLY_INFERRED, WEAKLY_INFERRED)
- Evidence text for each observation

RULES:
- Only analyze what is observable in the extracted text
- Do NOT make up patterns that aren't visible
- Clearly distinguish between observed fact and inference
- Note when text extraction may have missed important visual/structural elements
- Flag any patterns that should be reviewed by the user for approval`,

  github_reference_analysis: `You are a software architect reviewing a public GitHub repository.

You are given:
1. Repository metadata (owner, name, description, license, default branch)
2. Languages used and their percentages
3. Package manifests content (package.json, requirements.txt, Cargo.toml, etc.)
4. Directory tree showing the application structure
5. Key file contents from major modules

Analyze the repository as a reference for the user's project.

Return structured output covering:
- Application type and purpose
- Architecture patterns observed (MVC, clean architecture, monolith, microservices, etc.)
- Frontend framework and version
- Backend framework and version
- Database and ORM used
- Authentication approach
- API structure (REST, GraphQL, etc.)
- Testing setup and coverage patterns
- Deployment configuration observed
- Reusable patterns that could apply to the user's project
- Compatibility assessment with the user's project type
- License compatibility warnings (if any)
- Notable design decisions

RULES:
- Only analyze what is observable from the repository data
- Do NOT access private repositories or attempt to clone
- Do NOT try to execute any code from the repository
- Flag any license restrictions that may apply`,

  artifact_composer: `You are RockFoundry's Artifact Composer. Return one JSON object only — no markdown fences, prose, wrapper, or extra keys.

REQUESTED DOCUMENT TYPES
- For the complete six-document request, return exactly these top-level keys: BRD, PRD, ERD, USER_FLOWS, SCREEN_MAP, DESIGN_BRIEF.
- The user input includes requestedDocumentTypes. Generate substantive documents ONLY for those requested types.
- Return keys only for requestedDocumentTypes. Do not regenerate, overwrite, or fill missing non-requested types.
- Each requested type must have exactly: title (string), summary (string), sections (array).

DOCUMENT CONTRACT
- Every section must have: id (string), title (string), paragraphs (string array), items (array).
- Every item must have: id (string), text (string), label (CONFIRMED | ASSUMPTION | PROPOSAL | OPEN_QUESTION), evidenceIds (string array). CONFIRMED items must include only valid canonicalTruth fact IDs in evidenceIds. All non-confirmed items must use [] evidenceIds.

QUALITY BAR
- Produce substantive content for every requested document: at least one real section, at least one labeled item, and a concrete summary. Never output placeholders such as "needs review", "TBD", "unknown", or an empty shell.
- A short raw idea is enough to propose a practical MVP. For a cashflow idea, propose income/expense transaction entry, balance and history, Transaction and Category records, Dashboard/Add Transaction/History screens, a simple flow, and a focused financial UI direction. These are PROPOSAL or ASSUMPTION unless the user explicitly confirmed them.
- Never invent CONFIRMED behavior, actors, entities, workflows, routes, or fields. Keep unresolved decisions visibly labeled.
- Preserve valid prior artifacts only for requested types when revising; do not return non-requested types.
- SCREEN_MAP must include a labeled screen-list item in the form "Screen One, Screen Two, and Screen Three screens." or one labeled item per screen in the form "Screen Name — Route: \`#/route\` — Purpose: concise purpose". Routes must use \`#/\` followed only by lowercase letters, digits, slashes, or hyphens.
`,
};

export const TASK_REASONING_EFFORT: Record<string, "medium" | "high" | "max"> =
  {
    initial_idea_extraction: "medium",
    conversation_agent: "medium",
    ambiguous_conversation: "medium",
    research: "high",
    screen_architecture: "max",
    design_architecture: "high",
    prototype_generation: "medium",
    design_quality_review: "high",
    prototype_repair: "medium",
    final_consistency_review: "max",
    artifact_composer: "high",
  };

export function reasoningEffortForTask(taskType: string, override?: string) {
  return override || TASK_REASONING_EFFORT[taskType];
}
export const TASK_MODEL_TIER: Record<string, "cheap" | "default" | "strong"> = {
  initial_idea_extraction: "default",
  conversation_agent: "default",
  contextual_question_enrichment: "default",
  ambiguity_analysis: "strong",
  contradiction_review: "strong",
  website_reference_analysis: "default",
  github_reference_analysis: "default",
  documentation_enrichment: "cheap",
  final_consistency_review: "strong",
  artifact_composer: "strong",
};

export const TASK_TEMPERATURE: Record<string, number> = {
  initial_idea_extraction: 0.1,
  conversation_agent: 0.45,
  contextual_question_enrichment: 0.3,
  ambiguity_analysis: 0.2,
  contradiction_review: 0.1,
  website_reference_analysis: 0.2,
  github_reference_analysis: 0.1,
  documentation_enrichment: 0.4,
  final_consistency_review: 0.1,
  artifact_composer: 0.2,
};

export const TASK_TIMEOUT: Record<string, number> = {
  initial_idea_extraction: 120000,
  conversation_agent: 90000,
  design_architecture: 120000,
  prototype_generation: 180000,
  contextual_question_enrichment: 60000,
  ambiguity_analysis: 90000,
  contradiction_review: 90000,
  website_reference_analysis: 120000,
  github_reference_analysis: 120000,
  documentation_enrichment: 90000,
  final_consistency_review: 120000,
  artifact_composer: 120000,
};

// Task max retries
export const TASK_MAX_RETRIES: Record<string, number> = {
  initial_idea_extraction: 2,
  conversation_agent: 1,
  design_architecture: 1,
  prototype_generation: 0,
  contextual_question_enrichment: 2,
  ambiguity_analysis: 1,
  contradiction_review: 1,
  website_reference_analysis: 2,
  github_reference_analysis: 1,
  documentation_enrichment: 2,
  final_consistency_review: 1,
  artifact_composer: 1,
};
