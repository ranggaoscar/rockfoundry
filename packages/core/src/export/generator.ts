import JSZip from "jszip";
import { ProjectState, ProjectStateSchema } from "../schema";

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

  const manifest = {
    generatedAt: new Date().toISOString(),
    version: "alpha-0.1",
    projectName: state.name || "RockFoundry Project",
  };

  zip.file("PROJECT_MANIFEST.json", JSON.stringify(manifest, null, 2));
  zip.file("PROJECT_STATE.json", JSON.stringify(state, null, 2));
  zip.file("README_START_HERE.md", `# ${state.name || "RockFoundry Project"}\n\nStart here. This build package contains everything you need to build the project.`);
  zip.file("AGENTS.md", "# Agent Instructions\n\nRead the agents/ folder for specific coding agent configurations.");

  // Product
  const product = zip.folder("product");
  product?.file("PRD.md", generateMarkdown("Product Requirements Document", state));
  product?.file("PRODUCT_VISION.md", generateMarkdown("Product Vision", state));
  product?.file("PROBLEM_STATEMENT.md", generateMarkdown("Problem Statement", state));
  product?.file("TARGET_USERS.md", generateMarkdown("Target Users", state));
  product?.file("USER_JOURNEYS.md", generateMarkdown("User Journeys", state));
  product?.file("FEATURE_SCOPE.md", generateMarkdown("Feature Scope", state));
  product?.file("NON_GOALS.md", generateMarkdown("Non-Goals", state));
  product?.file("SUCCESS_METRICS.md", generateMarkdown("Success Metrics", state));

  // Design
  const design = zip.folder("design");
  design?.file("DESIGN_DIRECTION.md", generateMarkdown("Design Direction", state));
  design?.file("INFORMATION_ARCHITECTURE.md", generateMarkdown("Information Architecture", state));
  design?.file("SCREEN_INVENTORY.md", generateMarkdown("Screen Inventory", state));
  design?.file("USER_FLOWS.md", generateMarkdown("User Flows", state));
  design?.file("COMPONENT_GUIDE.md", generateMarkdown("Component Guide", state));
  design?.file("REFERENCES.md", generateMarkdown("References", state));

  // Technical
  const technical = zip.folder("technical");
  technical?.file("TECHNICAL_REQUIREMENTS.md", generateMarkdown("Technical Requirements", state));
  technical?.file("SYSTEM_ARCHITECTURE.md", generateMarkdown("System Architecture", state));
  technical?.file("DATA_MODEL.md", generateMarkdown("Data Model", state));
  technical?.file("API_CONTRACTS.md", generateMarkdown("API Contracts", state));
  technical?.file("AUTH_AND_PERMISSIONS.md", generateMarkdown("Auth and Permissions", state));
  technical?.file("SECURITY_AND_PRIVACY.md", generateMarkdown("Security and Privacy", state));
  technical?.file("INTEGRATIONS.md", generateMarkdown("Integrations", state));

  // Delivery
  const delivery = zip.folder("delivery");
  delivery?.file("IMPLEMENTATION_PLAN.md", generateMarkdown("Implementation Plan", state));
  delivery?.file("TASK_BREAKDOWN.md", generateMarkdown("Task Breakdown", state));
  delivery?.file("ACCEPTANCE_CRITERIA.md", generateMarkdown("Acceptance Criteria", state));
  delivery?.file("TESTING_PLAN.md", generateMarkdown("Testing Plan", state));
  delivery?.file("DEPLOYMENT_PLAN.md", generateMarkdown("Deployment Plan", state));
  delivery?.file("LAUNCH_CHECKLIST.md", generateMarkdown("Launch Checklist", state));

  // Decisions
  const decisions = zip.folder("decisions");
  decisions?.file("DECISION_LOG.md", generateMarkdown("Decision Log", state));
  decisions?.file("ASSUMPTIONS.md", generateMarkdown("Assumptions", state));
  decisions?.file("OPEN_QUESTIONS.md", generateMarkdown("Open Questions", state));
  decisions?.file("RISKS.md", generateMarkdown("Risks", state));

  // Agents
  const agent = zip.folder("agent");
  agent?.file("CODEX.md", generateMarkdown("Codex Instructions", state));
  agent?.file("CLAUDE.md", generateMarkdown("Claude Instructions", state));
  agent?.file("CURSOR_RULES.md", generateMarkdown("Cursor Rules", state));
  agent?.file("FIRST_BUILD_PROMPT.md", generateMarkdown("First Build Prompt", state));

  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  return {
    buffer,
    metadata: {
      sizeBytes: buffer.length,
      fileCount: Object.keys(zip.files).length,
      generatedAt: manifest.generatedAt,
    },
  };
}

function generateMarkdown(title: string, state: ProjectState): string {
  // A helper to generate safe, cross-consistent markdown based on canonical state
  const isResolved = (key: keyof ProjectState) => state[key] !== undefined && state[key] !== null;
  
  let content = `# ${title}\n\n`;
  content += `> Name: ${state.name || "*[UNRESOLVED]*"}\n\n`;

  if (title === "Target Users") {
    content += "## Users\n";
    if (state.targetUsers && state.targetUsers.length > 0) {
      state.targetUsers.forEach((u: string) => content += `- ${u}\n`);
    } else {
      content += "*[UNRESOLVED]*\n";
    }
  } else if (title === "Feature Scope") {
    content += "## Core Features\n";
    if (state.features && state.features.length > 0) {
      state.features.forEach((f: any) => content += `- ${f}\n`);
    } else {
      content += "*[UNRESOLVED]*\n";
    }
  } else if (title === "System Architecture") {
    content += "## Architecture\n";
    if ((state as any).technicalDecisions) {
      content += `- Platform: ${(state as any).technicalDecisions.platform || "*[UNRESOLVED]*"}\n`;
      content += `- Stack: ${(state as any).technicalDecisions.stack || "*[UNRESOLVED]*"}\n`;
    } else {
      content += "*[UNRESOLVED]*\n";
    }
  } else {
    content += "This document derives from canonical project state. Missing information is marked as unresolved.\n";
  }

  return content;
}
