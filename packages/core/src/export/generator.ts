import JSZip from "jszip";
import { ProjectState } from "../schema";
import { evaluateDecisionDebt } from "../graph/decision-debt";
import { evaluateReadinessDirectly } from "../graph/evaluator";
import { buildDecisionGraph } from "../decision-graph";
import {
  derivedBusinessRuleLines,
  derivedDataOwnershipLines,
  derivedEdgeCaseLines,
  derivedNonGoals,
  derivedPermissionLines,
  derivedRelationships,
  derivedRetentionLines,
  derivedStateStatusLines,
  listOrUnresolved,
  mermaidRelationshipMarkers,
  relationshipLine,
  relationshipsForEntity,
} from "./derived";
import { buildDesignSpec } from "../design/mock-generator";
import { deriveScreenMap } from "../design/screen-map";

export interface ArtifactDocuments {
  BRD: string;
  PRD: string;
  ERD: string;
  DO_NOT_INVENT: string;
  DECISIONS: string;
  INVARIANTS: string;
  READINESS: string;
  AGENT_HANDOFF: string;
  DECISIONS_JSON: string;
}

export interface ExportPackage {
  buffer: Buffer;
  documents: ArtifactDocuments;
  metadata: { sizeBytes: number; fileCount: number; generatedAt: string };
}

const UNRESOLVED = "[UNRESOLVED]";

function list(values: string[]) {
  return values.length
    ? values.map((value) => `- ${value}`).join("\n")
    : UNRESOLVED;
}
function decisionList(state: ProjectState) {
  return state.decisions.length
    ? state.decisions
        .map(
          (item) =>
            `- **${item.topic}**: ${item.decision} (source: ${item.source}${item.affects?.length ? `; affects: ${item.affects.join(", ")}` : ""})`,
        )
        .join("\n")
    : UNRESOLVED;
}
function assumptions(state: ProjectState) {
  return state.assumptions.length
    ? state.assumptions
        .map(
          (item) =>
            `- ${item.statement} (confidence: ${item.confidence}, impact: ${item.impact}${item.resolved ? ", resolved" : ", unresolved"})`,
        )
        .join("\n")
    : UNRESOLVED;
}
function openQuestions(state: ProjectState) {
  return state.openQuestions.length
    ? list(state.openQuestions)
    : "None recorded.";
}
function entityName(value: string) {
  const cleaned = value
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
  return cleaned || "UnresolvedEntity";
}

function debtFor(state: ProjectState) {
  return state.decisionDebt?.summary
    ? state.decisionDebt
    : evaluateDecisionDebt(state);
}

function renderDoNotInvent(state: ProjectState) {
  const debt = debtFor(state);
  const warnings =
    debt.codingAgentWarnings.length > 0
      ? debt.codingAgentWarnings
      : [
          "No high-risk unresolved decisions were catalogued. Still refuse to invent ownership, permissions, or identity rules that are not explicit below.",
        ];

  const accepted = state.decisions.filter((item) =>
    ["ACCEPTED", "PROPOSED"].includes(item.status),
  );

  return `# DO NOT INVENT

> Coding agents must treat this file as a hard constraint contract.

## Invention risk

- **Decision Debt score:** ${debt.score}/100
- **Risk level:** ${debt.inventionRisk}
- **Summary:** ${debt.summary}

## Hard rules

1. Do not fill gaps with plausible product behavior.
2. Do not silently choose identity, ownership, permission, or workflow rules.
3. If a required behavior is unresolved, keep it explicit as unresolved or ask the human.
4. Prefer failing closed over inventing multi-tenant or cross-unit behavior.

## Do not invent these unresolved decisions

${warnings.map((item) => `- ${item}`).join("\n")}

## Already decided (safe to implement)

${
  accepted.length
    ? accepted
        .map(
          (item) =>
            `- **${item.topic}:** ${item.decision}${item.affects?.length ? ` _(affects: ${item.affects.join(", ")})_` : ""}`,
        )
        .join("\n")
    : "- None yet. Treat all material product rules as unresolved."
}

## Open contradictions

${
  state.contradictions.filter((item) => item.status === "OPEN").length
    ? state.contradictions
        .filter((item) => item.status === "OPEN")
        .map(
          (item) =>
            `- **${item.severity}:** ${item.explanation} → ${item.recommendedResolution}`,
        )
        .join("\n")
    : "- None open."
}

## Unresolved high-impact assumptions

${
  state.assumptions.filter((item) => !item.resolved && item.impact === "HIGH")
    .length
    ? state.assumptions
        .filter((item) => !item.resolved && item.impact === "HIGH")
        .map((item) => `- ${item.statement}`)
        .join("\n")
    : "- None recorded."
}
`;
}

function renderDecisionsMarkdown(state: ProjectState) {
  const graph = state.decisionGraph?.nodes?.length
    ? state.decisionGraph
    : buildDecisionGraph(state);
  const debt = debtFor(state);

  return `# Decisions

## Decision Debt

- Score: **${debt.score}/100**
- Invention risk: **${debt.inventionRisk}**
- Decided: ${debt.decidedCount}
- Unresolved high-risk: ${debt.unresolvedHighRiskCount}

## Accepted and proposed decisions

${
  state.decisions.length
    ? state.decisions
        .map((item) => {
          const affects = item.affects?.length
            ? item.affects.map((value) => `  - ${value}`).join("\n")
            : "  - (not linked yet)";
          return `### ${item.topic}\n\n- **Decision:** ${item.decision}\n- **Status:** ${item.status}\n- **Source:** ${item.source}\n- **Confidence:** ${item.confidence}\n- **Reason:** ${item.reason || "—"}\n- **Affects:**\n${affects}`;
        })
        .join("\n\n")
    : "_No decisions recorded yet._"
}

## Top remaining invention risks

${
  debt.topRisks.length
    ? debt.topRisks
        .map(
          (item) =>
            `- **${item.title}** (\`${item.topic}\`, weight ${item.riskWeight}): ${item.reason}`,
        )
        .join("\n")
    : "- None ranked."
}

## Decision graph snapshot

- Nodes: ${graph.nodes.length}
- Edges: ${graph.edges.length}

${
  graph.edges.length
    ? graph.edges
        .slice(0, 40)
        .map(
          (edge) =>
            `- \`${edge.from}\` ${edge.relation} \`${edge.to}\`${edge.rationale ? ` — ${edge.rationale}` : ""}`,
        )
        .join("\n")
    : "- No edges recorded yet."
}
`;
}

function renderInvariants(state: ProjectState) {
  const accepted = state.decisions.filter((item) =>
    ["ACCEPTED", "PROPOSED"].includes(item.status),
  );
  return `# Invariants

These statements should remain true while implementing the product. If code would violate one, stop and ask.

## Product invariants from decisions

${
  accepted.length
    ? accepted.map((item) => `- ${item.topic} = ${item.decision}`).join("\n")
    : "- No decision-backed invariants yet."
}

## Explicit business rules

${list(state.businessRules)}

## Permission boundaries

${list(state.permissions)}

## Constraints

${list(state.constraints)}

## Safety invariants

- Unresolved decisions remain unresolved in behavior, UI copy, and data model comments.
- Reference evidence is not an automatic requirement.
- Do not create hidden admin overrides that bypass undecided permissions.
`;
}

function renderReadiness(state: ProjectState) {
  const readiness = evaluateReadinessDirectly(state);
  const debt = readiness.decisionDebt;
  return `# Readiness

## Build readiness

- **Level:** ${readiness.level}
- **Score:** ${readiness.score}/100
- **Business:** ${readiness.breakdown.business}%
- **Product:** ${readiness.breakdown.product}%
- **Data:** ${readiness.breakdown.data}%

## Decision Debt

> Includes unresolved discovery questions **and** unresolved artifact sections a coding agent would still invent.

- **Score:** ${debt.score}/100 _(higher = more invention risk)_
- **Invention risk:** ${debt.inventionRisk}
- **Summary:** ${debt.summary}
- **Unresolved high-risk decisions:** ${debt.unresolvedHighRiskCount}
- **Unresolved artifact sections:** ${debt.unresolvedArtifactSectionCount ?? 0}
- **Open contradictions:** ${debt.openContradictionCount}
- **Unresolved assumptions:** ${debt.unresolvedAssumptionCount}

## Blocking issues

${
  readiness.blocking.length
    ? readiness.blocking.map((item) => `- ${item}`).join("\n")
    : "- None."
}

## Discovery

- Evaluated: ${readiness.discovery.evaluated ? "yes" : "no"}
- Domain: ${readiness.discovery.domain || "unknown"}
- Important decisions remaining: ${
    readiness.discovery.importantDecisionsRemaining === null
      ? "n/a"
      : readiness.discovery.importantDecisionsRemaining
  }

## Interpretation

| Level | Meaning |
| --- | --- |
| NOT_READY | Too much Decision Debt for safe implementation |
| DRAFT_READY | Prototype possible if unresolved risks stay explicit |
| BUILD_READY | Major invention risks are paid down enough for MVP implementation |
`;
}

function renderAgentHandoff(state: ProjectState) {
  const debt = debtFor(state);
  const decided = state.decisions
    .filter((item) => ["ACCEPTED", "PROPOSED"].includes(item.status))
    .map((item) => `- ${item.topic}: ${item.decision}`)
    .join("\n");
  return `# Agent Handoff

Use this package as the authoritative confirmed product truth before writing code.

Confirmed product decisions are authoritative. Do not infer, overwrite, or add unresolved behavior.
Product Truth is authoritative. Screen Map and the baseline DesignSpec are the implementation reference even when no prototype exists.
The approved prototype, when included, is an optional visual and interaction reference. The target implementation stack may differ from it, so translate intent rather than copying it blindly.

## Package contents

- \`BRD.md\` — business problem, goals, scope
- \`PRD.md\` — product behavior and requirements
- \`ERD.md\` — entities and relationships
- \`DO_NOT_INVENT.md\` — hard constraints against invented product rules
- \`DECISIONS.md\` / \`decisions.json\` — explicit decisions and remaining risks
- \`INVARIANTS.md\` — must-hold rules while coding
- \`READINESS.md\` — build readiness and Decision Debt
- \`design/SCREEN_MAP.json\` — deterministic screen inventory derived from Product Truth
- \`design/DESIGN_SPEC.json\` — baseline implementation direction derived from Product Truth and Screen Map

## Read order (all tools)

1. \`DO_NOT_INVENT.md\`
2. \`DECISIONS.md\` / \`decisions.json\`
3. \`INVARIANTS.md\`
4. \`PRD.md\` + \`ERD.md\`
5. \`BRD.md\` for business context

## Prompt — Claude Code

\`\`\`text
You are implementing from a RockFoundry handoff package in this folder.

Mandatory:
1. Read DO_NOT_INVENT.md first. Obey it as hard constraints.
2. Implement only decisions in DECISIONS.md / decisions.json.
3. If identity, permissions, ownership, duplicates, or multi-brand behavior is unresolved, do NOT pick a default. Add a TODO and stop that path.
4. Cite the decision topic in code comments for multi-brand rules.
5. Prefer failing closed over SaaS-generic defaults.
\`\`\`

## Prompt — Codex

\`\`\`text
Build from this RockFoundry package.
Source of truth: DO_NOT_INVENT.md, DECISIONS.md, INVARIANTS.md, then PRD/ERD.
Do not invent customer identity, sales visibility, lead ownership, quotation branding, or duplicate handling if unresolved.
Leave explicit TODOs instead of guessing multi-tenant behavior.
\`\`\`

## Prompt — Cursor

\`\`\`text
Use this folder as the product spec.
Start with DO_NOT_INVENT.md.
When generating schema, authz, or CRM workflows, follow DECISIONS.md exactly.
Never silently invent cross-brand rules.
\`\`\`

## Generic prompt

\`\`\`text
Implement from this RockFoundry handoff package.

Rules:
1. Read DO_NOT_INVENT.md first and obey it strictly.
2. Treat DECISIONS.md and INVARIANTS.md as source of truth.
3. If a behavior is unresolved, do not invent it. Leave a clear TODO or ask.
4. Prefer the explicit decisions over any generic SaaS defaults.
5. When identity, permissions, ownership, or multi-unit behavior is involved, cite the decision you are following.
\`\`\`

## Already decided

${decided || "- None yet."}

${
  state.studio.approvedVersion
    ? `## Approved product design

Reference:
- design/DESIGN_SPEC.json
- design/SCREEN_MAP.json
- design/prototype/

The prototype is an approved visual and interaction reference.
Implementation may translate it into the production stack, but must preserve
approved workflows, screen hierarchy, interaction priorities, and role boundaries.
Do not invent alternative product behavior. Do not copy prototype code blindly.
`
    : ""
}

## Design reference

- Product Truth remains authoritative over visual suggestions.
- Use \`design/SCREEN_MAP.json\` and \`design/DESIGN_SPEC.json\` as the implementation reference.
- \`design/prototype/\` may be absent. If it is absent, do not invent a visual or interaction contract.

${
  state.studio.approvedVersion
    ? `The approved prototype is included under \`design/prototype/\` and may be used as an additional visual reference.`
    : state.studio.currentVersion
      ? `A draft prototype is included under \`design/prototype/\`. It is not approved product truth.`
      : "No prototype is included in this package."
}

## Current handoff quality

- Project: ${state.name || "Untitled project"}
- Readiness: ${state.readiness} (${state.readinessScore}%)
- Decision Debt: ${debt.score}/100 (${debt.inventionRisk})
- ${debt.summary}

## Suggested implementation order

1. Data model only for entities and relationships that are explicit
2. Permission checks required by accepted decisions
3. Primary workflows that are decided
4. Leave unresolved multi-unit edge cases unimplemented rather than guessed
`;
}

function renderDecisionsJson(state: ProjectState) {
  const debt = debtFor(state);
  const graph = state.decisionGraph?.nodes?.length
    ? state.decisionGraph
    : buildDecisionGraph(state);
  return JSON.stringify(
    {
      projectId: state.id,
      name: state.name,
      readiness: state.readiness,
      readinessScore: state.readinessScore,
      decisionDebt: debt,
      decisions: state.decisions,
      assumptions: state.assumptions,
      contradictions: state.contradictions,
      openQuestions: state.openQuestions,
      decisionGraph: graph,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  );
}

export function renderArtifacts(state: ProjectState): ArtifactDocuments {
  const status = `${state.readiness} (${state.readinessScore}%)`;
  const debt = debtFor(state);
  const brd = `# Business Requirements Document

## 1. Executive Summary

${state.normalizedSummary || state.rawIdea || UNRESOLVED}

**Discovery status:** ${status}  
**Decision Debt:** ${debt.score}/100 (${debt.inventionRisk})

## 2. Business Problem

${list(state.problems)}

## 3. Business Objectives

${list(state.objectives)}

## 4. Stakeholders

${list(state.roles.length ? state.roles : state.targetUsers)}

## 5. Target Users

${list(state.targetUsers)}

## 6. Current Process

${UNRESOLVED}

## 7. Desired Business Process

${list(state.workflows)}

## 8. Business Requirements

${list(state.requirements.length ? state.requirements : state.features)}

## 9. Business Rules

${listOrUnresolved(derivedBusinessRuleLines(state))}

## 10. Scope

### In Scope

${list(state.features)}

### Out of Scope

${UNRESOLVED}

## 11. Success Metrics

${UNRESOLVED}

## 12. Constraints

${list(state.constraints)}

## 13. Risks

${list(
  state.risks.concat(
    state.contradictions
      .filter((item) => item.status === "OPEN")
      .map((item) => item.explanation),
    debt.topRisks.map((item) => `${item.title}: ${item.reason}`),
  ),
)}

## 14. Assumptions

${assumptions(state)}

## 15. Dependencies

${list(state.integrations)}

## 16. Open Decisions

${decisionList(state)}

### Open Questions

${openQuestions(state)}

### Decision Debt warnings

${list(debt.codingAgentWarnings)}
`;

  const prd = `# Product Requirements Document

## 1. Product Overview

${state.normalizedSummary || state.rawIdea || UNRESOLVED}

**Decision Debt:** ${debt.score}/100 (${debt.inventionRisk})

## 2. Product Goals

${list(state.objectives)}

## 3. Non-Goals

${listOrUnresolved(derivedNonGoals(state))}

## 4. User Roles

${list(state.roles.length ? state.roles : state.targetUsers)}

## 5. User Journeys

${list(state.workflows)}

## 6. Functional Requirements

${list(state.requirements.length ? state.requirements : state.features)}

## 7. Feature Specifications

${state.features.length ? state.features.map((feature, index) => `### FR-${String(index + 1).padStart(3, "0")} ${feature}\n\nBehavior and acceptance detail: ${UNRESOLVED}`).join("\n\n") : UNRESOLVED}

## 8. Navigation / Information Architecture

${UNRESOLVED}

## 9. Screen Inventory

${UNRESOLVED}

## 10. Permissions

${listOrUnresolved(derivedPermissionLines(state))}

## 11. States and Statuses

${listOrUnresolved(derivedStateStatusLines(state))}

## 12. Search / Filters / Sorting

${UNRESOLVED}

## 13. Notifications

${UNRESOLVED}

## 14. Integrations

${list(state.integrations)}

## 15. Error Behaviour

${UNRESOLVED}

## 16. Edge Cases

${listOrUnresolved([
  ...derivedEdgeCaseLines(state),
  ...debt.topRisks.map(
    (item) => `${item.title} remains unresolved: ${item.reason}`,
  ),
])}

## 17. Security & Privacy Requirements

${list(state.constraints.filter((item) => /privacy|security|personal|permission|sensitive/i.test(item)))}

## 18. Performance Expectations

${UNRESOLVED}

## 19. Acceptance Criteria

${state.features.length ? state.features.map((feature) => `- [ ] ${feature} has an observable success and failure state.`).join("\n") : UNRESOLVED}

## 20. MVP Scope

${list(state.features)}

## 21. Future Scope

${UNRESOLVED}

## 22. Open Decisions

${decisionList(state)}

### Open Questions

${openQuestions(state)}

### Do not invent

See \`DO_NOT_INVENT.md\`.
`;

  const entities = [...new Set(state.entities.filter(Boolean))];
  const relationships = derivedRelationships(state);
  const mermaidEntities = entities.length
    ? `  %% Canonical entities without a known relationship are documented below; no fields are invented.\n  %% ${entities.map(entityName).join(", ")}`
    : "  %% No canonical entities are known yet.";
  const mermaidRelationships = relationships.length
    ? relationships
        .map((relationship) => {
          const [fromMarker, toMarker] = mermaidRelationshipMarkers(
            relationship.cardinality,
          );
          const label = (relationship.label || "relationship").replace(
            /\"/g,
            '\\\"',
          );
          return `  ${entityName(relationship.fromEntity)} ${fromMarker}--${toMarker} ${entityName(relationship.toEntity)} : "${label}"`;
        })
        .join("\n")
    : "  %% No canonical relationships are known yet.";
  const entitySections = entities.length
    ? entities
        .map(
          (entity) => `### ${entityName(entity)}

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| ${UNRESOLVED} | ${UNRESOLVED} | ${UNRESOLVED} | No canonical field is explicit yet. |

Relationships:

${listOrUnresolved(relationshipsForEntity(state, entity))}

Business Rules:

${listOrUnresolved(derivedBusinessRuleLines(state))}

Indexes:

${UNRESOLVED}

Lifecycle:

${listOrUnresolved(derivedStateStatusLines(state))}`,
        )
        .join("\n\n")
    : UNRESOLVED;
  const erd = `# Entity Relationship Document

## 1. Data Model Overview

The data model is derived from canonical entities, explicit canonical relationships, and accepted decisions whose endpoints are already known entities. Unresolved fields remain explicit instead of being invented.

**Decision Debt:** ${debt.score}/100 (${debt.inventionRisk})

## 2. Entity Relationship Diagram

Mermaid edges below are emitted only for known relationships. Cardinality shows the known one/many shape; requiredness, optionality, fields, indexes, and constraints remain unresolved unless they exist in canonical state.

\`\`\`mermaid
erDiagram
${mermaidEntities}
${mermaidRelationships}
\`\`\`

## 3. Entities

${entitySections}

## 4. Relationships

${listOrUnresolved(relationships.map(relationshipLine))}

## 5. Constraints

${list(state.constraints)}

## 6. Data Ownership

${listOrUnresolved(derivedDataOwnershipLines(state))}

## 7. Data Retention

${listOrUnresolved(derivedRetentionLines(state))}

## 8. Open Data Decisions

${decisionList(state)}

### Open Questions

${openQuestions(state)}

### Identity and ownership risks

${list(debt.topRisks.map((item) => `${item.title}: ${item.reason}`))}
`;

  return {
    BRD: brd,
    PRD: prd,
    ERD: erd,
    DO_NOT_INVENT: renderDoNotInvent(state),
    DECISIONS: renderDecisionsMarkdown(state),
    INVARIANTS: renderInvariants(state),
    READINESS: renderReadiness(state),
    AGENT_HANDOFF: renderAgentHandoff(state),
    DECISIONS_JSON: renderDecisionsJson(state),
  };
}

function renderHandoffReadme(state: ProjectState) {
  const design = state.studio.approvedVersion
    ? "The approved prototype under design/prototype/ is the visual and interaction reference."
    : state.studio.currentVersion
      ? "A draft prototype is included under design/prototype/. Review and approve it before treating it as visual reference."
      : "No prototype is included. Screen Map and baseline DesignSpec remain the implementation reference.";
  const implementationGuidance = state.studio.currentVersion
    ? "The target implementation stack may differ from this prototype. Translate the approved visual and interaction intent into the target stack; do not copy prototype code blindly and do not invent unresolved product behavior."
    : "No prototype is included. Do not invent visual or interaction requirements beyond design/SCREEN_MAP.json and design/DESIGN_SPEC.json.";
  return `# ${state.name} — Coding Agent Start Here

Start with AGENT_HANDOFF.md. It defines Product Truth, the do-not-invent boundary, and the required read order.

## Read in this order

1. AGENT_HANDOFF.md
2. decisions/DO_NOT_INVENT.md
3. decisions/DECISIONS.md and decisions/decisions.json
4. decisions/INVARIANTS.md
5. product/PRD.md and product/ERD.md
6. product/BRD.md

${design}

Product Truth is authoritative. Use design/SCREEN_MAP.json and design/DESIGN_SPEC.json as the implementation reference. Prototype is optional and may be absent; coding agents must not invent unresolved behavior or visual requirements.

${implementationGuidance}
`;
}

export async function generateExport(
  state: ProjectState,
): Promise<ExportPackage> {
  const documents = renderArtifacts(state);
  const screenMap = state.studio.screenMap.length
    ? state.studio.screenMap
    : deriveScreenMap(state);
  const baselineDesignSpec = buildDesignSpec(state, screenMap);
  const zip = new JSZip();
  zip.file("README.md", renderHandoffReadme(state));
  zip.file("product/BRD.md", documents.BRD);
  zip.file("product/PRD.md", documents.PRD);
  zip.file("product/ERD.md", documents.ERD);
  zip.file("decisions/DO_NOT_INVENT.md", documents.DO_NOT_INVENT);
  zip.file("decisions/DECISIONS.md", documents.DECISIONS);
  zip.file("decisions/INVARIANTS.md", documents.INVARIANTS);
  zip.file("decisions/READINESS.md", documents.READINESS);
  zip.file("decisions/decisions.json", documents.DECISIONS_JSON);
  zip.file("AGENT_HANDOFF.md", documents.AGENT_HANDOFF);
  zip.file(
    "design/DESIGN_SPEC.json",
    JSON.stringify(baselineDesignSpec, null, 2),
  );
  zip.file("design/SCREEN_MAP.json", JSON.stringify(screenMap, null, 2));
  zip.file(
    "design/DESIGN_DECISIONS.md",
    "# Baseline design decisions\n\nThis deterministic baseline is derived from Product Truth and the Screen Map. A prototype is optional and is not required for coding-agent handoff.\n",
  );
  let fileCount = 13;
  const pack = state.generationMetadata.designPackage as
    | {
        spec?: unknown;
        files?: Array<{ path: string; content: string }>;
        summary?: string;
      }
    | undefined;
  if (state.studio.currentVersion > 0 && pack?.files?.length) {
    const label = state.studio.status === "APPROVED" ? "APPROVED" : "DRAFT";
    zip.file("design/DESIGN_SPEC.json", JSON.stringify(pack.spec || baselineDesignSpec, null, 2));
    zip.file(
      "design/SCREEN_MAP.json",
      JSON.stringify(screenMap, null, 2),
    );
    zip.file(
      "design/DESIGN_DECISIONS.md",
      `# Design decisions (${label} v${state.studio.currentVersion})\n\n${pack.summary || ""}\n`,
    );
    for (const file of pack.files) {
      zip.file(`design/prototype/${file.path}`, file.content);
    }
    fileCount += pack.files.length;
  }
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const generatedAt = new Date().toISOString();
  return {
    buffer,
    documents,
    metadata: {
      sizeBytes: buffer.length,
      fileCount,
      generatedAt,
    },
  };
}
