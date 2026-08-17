import JSZip from "jszip";
import { ProjectState } from "../schema";

export interface ArtifactDocuments {
  BRD: string;
  PRD: string;
  ERD: string;
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
            `- **${item.topic}**: ${item.decision} (source: ${item.source})`,
        )
        .join("\n")
    : UNRESOLVED;
}
function assumptions(state: ProjectState) {
  return state.assumptions.length
    ? state.assumptions
        .map(
          (item) =>
            `- ${item.statement} (confidence: ${item.confidence}, impact: ${item.impact})`,
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

export function renderArtifacts(state: ProjectState): ArtifactDocuments {
  const status = `${state.readiness} (${state.readinessScore}%)`;
  const brd = `# Business Requirements Document

## 1. Executive Summary

${state.normalizedSummary || state.rawIdea || UNRESOLVED}

**Discovery status:** ${status}

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

${list(state.businessRules)}

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

${list(state.risks.concat(state.contradictions.filter((item) => item.status === "OPEN").map((item) => item.explanation)))}

## 14. Assumptions

${assumptions(state)}

## 15. Dependencies

${list(state.integrations)}

## 16. Open Decisions

${decisionList(state)}

### Open Questions

${openQuestions(state)}
`;

  const prd = `# Product Requirements Document

## 1. Product Overview

${state.normalizedSummary || state.rawIdea || UNRESOLVED}

## 2. Product Goals

${list(state.objectives)}

## 3. Non-Goals

${UNRESOLVED}

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

${list(state.permissions)}

## 11. States and Statuses

${UNRESOLVED}

## 12. Search / Filters / Sorting

${UNRESOLVED}

## 13. Notifications

${UNRESOLVED}

## 14. Integrations

${list(state.integrations)}

## 15. Error Behaviour

${UNRESOLVED}

## 16. Edge Cases

${UNRESOLVED}

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
`;

  const entities = state.entities.length
    ? state.entities
    : ["UnresolvedEntity"];
  const mermaidEntities = entities
    .map((entity) => `  ${entityName(entity)} {\n    string id\n  }`)
    .join("\n");
  const erd = `# Entity Relationship Document

## 1. Data Model Overview

The data model is derived from the entities and workflows currently understood by RockFoundry. Unresolved fields remain explicit instead of being invented.

## 2. Entity Relationship Diagram

\`\`\`mermaid
erDiagram
${mermaidEntities}
\`\`\`

## 3. Entities

${entities.map((entity) => `### ${entityName(entity)}\n\n| Field | Type | Required | Description |\n| ----- | ---- | -------- | ----------- |\n| id | string | Yes | Stable identity for the record. |\n\nRelationships:\n\n${UNRESOLVED}\n\nBusiness Rules:\n\n${list(state.businessRules)}\n\nIndexes:\n\n${UNRESOLVED}\n\nLifecycle:\n\n${UNRESOLVED}`).join("\n\n")}

## 4. Relationships

${state.entities.length > 1 ? "Relationships between these entities are not confirmed yet:\n\n" + UNRESOLVED : UNRESOLVED}

## 5. Constraints

${list(state.constraints)}

## 6. Data Ownership

${list(state.permissions)}

## 7. Data Retention

${UNRESOLVED}

## 8. Open Data Decisions

${decisionList(state)}

### Open Questions

${openQuestions(state)}
`;
  return { BRD: brd, PRD: prd, ERD: erd };
}

export async function generateExport(
  state: ProjectState,
): Promise<ExportPackage> {
  const documents = renderArtifacts(state);
  const zip = new JSZip();
  zip.file("BRD.md", documents.BRD);
  zip.file("PRD.md", documents.PRD);
  zip.file("ERD.md", documents.ERD);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const generatedAt = new Date().toISOString();
  return {
    buffer,
    documents,
    metadata: { sizeBytes: buffer.length, fileCount: 3, generatedAt },
  };
}
