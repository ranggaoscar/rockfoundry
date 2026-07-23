import JSZip from "jszip";
import { ProjectState } from "../schema";

export interface ExportPackage {
  buffer: Buffer;
  metadata: {
    sizeBytes: number;
    fileCount: number;
    generatedAt: string;
  };
}

export async function generateExport(state: ProjectState): Promise<ExportPackage> {
  const zip = new JSZip();

  const generatedAt = new Date().toISOString();

  const manifest = {
    generatedAt,
    version: "alpha-0.2",
    projectName: state.name || "RockFoundry Project",
    documentCount: 0,
  };

  zip.file("PROJECT_MANIFEST.json", JSON.stringify(manifest, null, 2));
  zip.file("PROJECT_STATE.json", JSON.stringify(state, null, 2));
  zip.file("README_START_HERE.md", generateReadme(state));

  // Product
  const product = zip.folder("product")!;
  product.file("PRD.md", generatePRD(state));
  product.file("PRODUCT_VISION.md", generateProductVision(state));
  product.file("TARGET_USERS.md", generateTargetUsers(state));
  product.file("USER_JOURNEYS.md", generateUserJourneys(state));
  product.file("FEATURE_SCOPE.md", generateFeatureScope(state));
  product.file("NON_GOALS.md", generateNonGoals(state));
  product.file("SUCCESS_METRICS.md", generateSuccessMetrics(state));

  // Design
  const design = zip.folder("design")!;
  design.file("DESIGN_DIRECTION.md", generateDesignDirection(state));
  design.file("INFORMATION_ARCHITECTURE.md", generateInformationArchitecture(state));
  design.file("SCREEN_INVENTORY.md", generateScreenInventory(state));
  design.file("USER_FLOWS.md", generateUserFlows(state));

  // Technical
  const technical = zip.folder("technical")!;
  technical.file("SYSTEM_ARCHITECTURE.md", generateSystemArchitecture(state));
  technical.file("DATA_MODEL.md", generateDataModel(state));
  technical.file("API_CONTRACTS.md", generateApiContracts(state));
  technical.file("AUTH_AND_PERMISSIONS.md", generateAuthAndPermissions(state));
  technical.file("SECURITY_AND_PRIVACY.md", generateSecurityAndPrivacy(state));

  // Delivery
  const delivery = zip.folder("delivery")!;
  delivery.file("IMPLEMENTATION_PLAN.md", generateImplementationPlan(state));
  delivery.file("TASK_BREAKDOWN.md", generateTaskBreakdown(state));
  delivery.file("ACCEPTANCE_CRITERIA.md", generateAcceptanceCriteria(state));
  delivery.file("TESTING_PLAN.md", generateTestingPlan(state));
  delivery.file("DEPLOYMENT_PLAN.md", generateDeploymentPlan(state));
  delivery.file("LAUNCH_CHECKLIST.md", generateLaunchChecklist(state));

  // Decisions
  const decisions = zip.folder("decisions")!;
  decisions.file("DECISION_LOG.md", generateDecisionLog(state));
  decisions.file("ASSUMPTIONS.md", generateAssumptions(state));
  decisions.file("OPEN_QUESTIONS.md", generateOpenQuestions(state));
  decisions.file("RISKS.md", generateRisks(state));

  manifest.documentCount = Object.keys(zip.files).length;
  zip.file("PROJECT_MANIFEST.json", JSON.stringify(manifest, null, 2));

  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  return {
    buffer,
    metadata: {
      sizeBytes: buffer.length,
      fileCount: manifest.documentCount,
      generatedAt,
    },
  };
}

// ── Helper ───────────────────────────────────────────────────────

const UNRESOLVED = "*[UNRESOLVED]*";

function notEmpty(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === "string") return val.trim().length > 0;
  return true;
}

function items(items: unknown[] | undefined, label: string): string {
  if (!items || items.length === 0) return UNRESOLVED + "\n";
  return items.map((i) => `- ${i}`).join("\n") + "\n";
}

function unresolvedDecisions(state: ProjectState): string {
  const unanswered = state.decisions.filter((d) => d.status === "PROPOSED");
  if (unanswered.length === 0) return "";
  return (
    "\n## Unresolved Decisions\n\n" +
    unanswered
      .map((d) => `- ${d.title}: ${d.description} — Status: ${d.status}`)
      .join("\n") +
    "\n"
  );
}

function assumptionsSection(state: ProjectState): string {
  if (state.assumptions.length === 0) return UNRESOLVED + "\n";
  return state.assumptions
    .map((a) => `- ${a.statement} (Confidence: ${a.confidence}, Impact: ${a.impact})`)
    .join("\n") + "\n";
}

// ── Document Renderers ──────────────────────────────────────────

function generateReadme(state: ProjectState): string {
  return `# ${state.name || "RockFoundry Project"}

> Generated on ${new Date().toISOString()}

Start here. This build package contains everything you need to build **${state.name || "your project"}**.

## Quick Start

1. Read \`product/PRD.md\` for the product requirements.
2. Review \`technical/SYSTEM_ARCHITECTURE.md\` for technical decisions.
3. Follow \`delivery/IMPLEMENTATION_PLAN.md\` for the build order.
4. Use \`agent/CODEX.md\` to set up your coding agent.

## Package Structure

- \`product/\` — Product requirements, vision, users, features
- \`design/\` — Design direction, flows, screens
- \`technical/\` — Architecture, data model, API contracts
- \`delivery/\` — Implementation plan, tasks, testing
- \`decisions/\` — Decision log, assumptions, risks
- \`agent/\` — AI agent configuration files

## Status

${state.readiness === "IDEA_READY" ? "⚠ Early idea stage — expect many unresolved decisions." : state.readiness === "PROTOTYPE_READY" ? "🔄 Prototype-ready — core decisions made." : state.readiness === "MVP_READY" ? "✅ MVP-ready — most decisions resolved." : "🚀 Production-ready — comprehensive spec complete."}
`;
}

function generatePRD(state: ProjectState): string {
  return `# Product Requirements Document

> ${state.name || "Untitled Project"}

## Objective

${state.normalizedSummary || UNRESOLVED}

## Product Type

${state.productType || UNRESOLVED}

## Target Users

${items(state.targetUsers, "Target Users")}

## User Problems

${items(state.objectives, "Objectives")}

## Constraints

${items(state.constraints, "Constraints")}

${unresolvedDecisions(state)}
`;
}

function generateProductVision(state: ProjectState): string {
  return `# Product Vision

## Vision Statement

${state.normalizedSummary ? `**${state.name || "Our product"}** aims to ${state.normalizedSummary.toLowerCase()}` : UNRESOLVED}

## Target Audience

${items(state.targetUsers, "Target Users")}

## Key Differentiators

${items(state.features, "Features")}

${unresolvedDecisions(state)}
`;
}

function generateTargetUsers(state: ProjectState): string {
  return `# Target Users

## Primary Users

${items(state.targetUsers, "Target Users")}

## User Demographics

${UNRESOLVED}

## User Goals

${state.objectives.length > 0 ? state.objectives.map((o) => `- ${o}`).join("\n") : UNRESOLVED}

${unresolvedDecisions(state)}
`;
}

function generateUserJourneys(state: ProjectState): string {
  return `# User Journeys

## Core Journey

${state.targetUsers.length > 0 ? `As a **${state.targetUsers[0]}**, I want to use ${state.name || "this product"} to achieve my goals.` : UNRESOLVED}

## Journey Steps

1. **Discovery** — How users find the product. ${UNRESOLVED}
2. **Onboarding** — First-time user experience. ${UNRESOLVED}
3. **Core Usage** — Primary workflows. ${items(state.features, "Features")}
4. **Retention** — What brings users back. ${UNRESOLVED}

${unresolvedDecisions(state)}
`;
}

function generateFeatureScope(state: ProjectState): string {
  return `# Feature Scope

## Core Features

${items(state.features, "Features")}

## Feature Details

${state.features.map((f) => `### ${f}\n\nDescription: ${UNRESOLVED}\n\nPriority: ${UNRESOLVED}\n`).join("\n") || UNRESOLVED}

${unresolvedDecisions(state)}
`;
}

function generateNonGoals(state: ProjectState): string {
  return `# Non-Goals

## Explicitly Out of Scope

${UNRESOLVED}

## Future Considerations

${UNRESOLVED}

${unresolvedDecisions(state)}
`;
}

function generateSuccessMetrics(state: ProjectState): string {
  return `# Success Metrics

## Key Performance Indicators

${UNRESOLVED}

## Success Criteria

${UNRESOLVED}

${unresolvedDecisions(state)}
`;
}

function generateDesignDirection(state: ProjectState): string {
  return `# Design Direction

## Visual Style

${UNRESOLVED}

## Platform

${items(state.constraints, "Platform Constraints")}

## Design Principles

${UNRESOLVED}

${unresolvedDecisions(state)}
`;
}

function generateInformationArchitecture(state: ProjectState): string {
  return `# Information Architecture

## Core Entities

${items(state.entities, "Entities")}

## Navigation Structure

${UNRESOLVED}

## Content Hierarchy

${UNRESOLVED}

${unresolvedDecisions(state)}
`;
}

function generateScreenInventory(state: ProjectState): string {
  return `# Screen Inventory

## Required Screens

${state.features.length > 0 ? state.features.map((f) => `- **${f} screen** — ${UNRESOLVED}`).join("\n") : UNRESOLVED}

## User Flows Mapped

${UNRESOLVED}

${unresolvedDecisions(state)}
`;
}

function generateUserFlows(state: ProjectState): string {
  return `# User Flows

## Primary Flow

${state.targetUsers.length > 0 ? `**Actor:** ${state.targetUsers[0]}` : UNRESOLVED}

1. ${UNRESOLVED}
2. ${UNRESOLVED}
3. ${UNRESOLVED}

## Secondary Flows

${UNRESOLVED}

${unresolvedDecisions(state)}
`;
}

function generateSystemArchitecture(state: ProjectState): string {
  return `# System Architecture

## Architecture Overview

${UNRESOLVED}

## Key Components

${items(state.entities, "Domain Entities")}
${items(state.integrations, "Integrations")}

## Technology Stack

${UNRESOLVED}

## Infrastructure

${UNRESOLVED}

## Data Flow

${UNRESOLVED}

${unresolvedDecisions(state)}
`;
}

function generateDataModel(state: ProjectState): string {
  return `# Data Model

## Core Entities

${state.entities.length > 0 ? state.entities.map((e) => `### ${e}\n\n- Attributes: ${UNRESOLVED}\n- Relationships: ${UNRESOLVED}\n`).join("\n") : UNRESOLVED}

## Relationships

${UNRESOLVED}

${unresolvedDecisions(state)}
`;
}

function generateApiContracts(state: ProjectState): string {
  return `# API Contracts

## API Style

${UNRESOLVED}

## Endpoints

${state.entities.length > 0 ? state.entities.map((e) => `### ${e} API\n\n- \`GET /${e.toLowerCase()}s\` — List ${e.toLowerCase()}s\n- \`POST /${e.toLowerCase()}s\` — Create ${e.toLowerCase()}\n- \`GET /${e.toLowerCase()}s/:id\` — Get ${e.toLowerCase()}\n- \`PUT /${e.toLowerCase()}s/:id\` — Update ${e.toLowerCase()}\n- \`DELETE /${e.toLowerCase()}s/:id\` — Delete ${e.toLowerCase()}\n`).join("\n") : UNRESOLVED}

## Authentication

${UNRESOLVED}

${unresolvedDecisions(state)}
`;
}

function generateAuthAndPermissions(state: ProjectState): string {
  return `# Auth and Permissions

## Authentication Method

${UNRESOLVED}

## User Roles

${items(state.targetUsers, "User Roles")}

## Permissions Model

${UNRESOLVED}

${unresolvedDecisions(state)}
`;
}

function generateSecurityAndPrivacy(state: ProjectState): string {
  return `# Security and Privacy

## Security Requirements

${UNRESOLVED}

## Privacy Considerations

${UNRESOLVED}

## Data Handling

${UNRESOLVED}

${unresolvedDecisions(state)}
`;
}

function generateImplementationPlan(state: ProjectState): string {
  return `# Implementation Plan

## Phase 1: Foundation

- ${UNRESOLVED}

## Phase 2: Core Features

- ${state.features.map((f) => `Implement ${f}`).join("\n- ")}

## Phase 3: Polish

- ${UNRESOLVED}

${unresolvedDecisions(state)}
`;
}

function generateTaskBreakdown(state: ProjectState): string {
  return `# Task Breakdown

## Setup

${UNRESOLVED}

## Development Tasks

${state.features.length > 0 ? state.features.map((f) => `- [ ] Implement ${f} ${UNRESOLVED}`).join("\n") : UNRESOLVED}

## Testing

${UNRESOLVED}

${unresolvedDecisions(state)}
`;
}

function generateAcceptanceCriteria(state: ProjectState): string {
  return `# Acceptance Criteria

## General

${UNRESOLVED}

## Feature-Specific

${state.features.length > 0 ? state.features.map((f) => `### ${f}\n\n- [ ] ${UNRESOLVED}\n`).join("\n") : UNRESOLVED}

${unresolvedDecisions(state)}
`;
}

function generateTestingPlan(state: ProjectState): string {
  return `# Testing Plan

## Testing Strategy

${UNRESOLVED}

## Test Categories

- Unit tests: ${UNRESOLVED}
- Integration tests: ${UNRESOLVED}
- E2E tests: ${UNRESOLVED}

${unresolvedDecisions(state)}
`;
}

function generateDeploymentPlan(state: ProjectState): string {
  return `# Deployment Plan

## Hosting

${UNRESOLVED}

## CI/CD

${UNRESOLVED}

## Environment Strategy

${UNRESOLVED}

${unresolvedDecisions(state)}
`;
}

function generateLaunchChecklist(state: ProjectState): string {
  return `# Launch Checklist

## Pre-Launch

- [ ] ${UNRESOLVED}
- [ ] ${UNRESOLVED}
- [ ] ${UNRESOLVED}

## Launch

- [ ] ${UNRESOLVED}

## Post-Launch

- [ ] ${UNRESOLVED}

${unresolvedDecisions(state)}
`;
}

function generateDecisionLog(state: ProjectState): string {
  return `# Decision Log

## Made Decisions

${state.decisions.filter((d) => d.status === "ACCEPTED").length > 0 ? state.decisions.filter((d) => d.status === "ACCEPTED").map((d) => `### ${d.title}\n\n- Decision: **Accepted**\n- Rationale: ${d.rationale}\n- Description: ${d.description}\n`).join("\n") : UNRESOLVED}

## Proposed Decisions

${state.decisions.filter((d) => d.status === "PROPOSED").length > 0 ? state.decisions.filter((d) => d.status === "PROPOSED").map((d) => `### ${d.title}\n\n- Status: **Proposed**\n- Description: ${d.description}\n`).join("\n") : "None"}

## Rejected Decisions

${state.decisions.filter((d) => d.status === "REJECTED").length > 0 ? state.decisions.filter((d) => d.status === "REJECTED").map((d) => `### ${d.title}\n\n- Reason: ${d.description}\n`).join("\n") : "None"}
`;
}

function generateAssumptions(state: ProjectState): string {
  return `# Assumptions

${assumptionsSection(state)}

Each assumption should be validated before making irreversible technical decisions.
`;
}

function generateOpenQuestions(state: ProjectState): string {
  return `# Open Questions

## Questions

${state.openQuestions.length > 0 ? state.openQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n") : UNRESOLVED}

## Ambiguities

${UNRESOLVED}
`;
}

function generateRisks(state: ProjectState): string {
  return `# Risks

## Technical Risks

${UNRESOLVED}

## Business Risks

${UNRESOLVED}

## Contradictions Detected

${state.contradictions.length > 0 ? state.contradictions.map((c) => `- **${c.severity}**: ${c.explanation}\n  - Resolution: ${c.recommendedResolution}`).join("\n\n") : "None detected"}
`;
}
