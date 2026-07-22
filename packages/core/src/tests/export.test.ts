import { describe, it, expect } from "vitest";
import { generateExport } from "../export/generator";
import { ProjectState } from "../schema";

describe("generateExport", () => {
  it("should create a valid zip with all required files", async () => {
    const mockState: ProjectState = {
      id: "1",
      name: "Test objective",
      rawIdea: "Idea",
      targetUsers: ["User 1"],
      objectives: [],
      constraints: [],
      entities: [],
      features: ["Feature 1"],
      apiEndpoints: [],
      unresolvedQuestions: [],
      generationMetadata: {}
    } as any;

    const pkg = await generateExport(mockState);
    
    // JSZip async loading
    const JSZip = require("jszip");
    const zip = await JSZip.loadAsync(pkg.buffer);
    
    const requiredFiles = [
      "README_START_HERE.md",
      "PROJECT_MANIFEST.json",
      "PROJECT_STATE.json",
      "AGENTS.md",
      "product/PRD.md",
      "product/PRODUCT_VISION.md",
      "product/PROBLEM_STATEMENT.md",
      "product/TARGET_USERS.md",
      "product/USER_JOURNEYS.md",
      "product/FEATURE_SCOPE.md",
      "product/NON_GOALS.md",
      "product/SUCCESS_METRICS.md",
      "design/DESIGN_DIRECTION.md",
      "design/INFORMATION_ARCHITECTURE.md",
      "design/SCREEN_INVENTORY.md",
      "design/USER_FLOWS.md",
      "design/COMPONENT_GUIDE.md",
      "design/REFERENCES.md",
      "technical/TECHNICAL_REQUIREMENTS.md",
      "technical/SYSTEM_ARCHITECTURE.md",
      "technical/DATA_MODEL.md",
      "technical/API_CONTRACTS.md",
      "technical/AUTH_AND_PERMISSIONS.md",
      "technical/SECURITY_AND_PRIVACY.md",
      "technical/INTEGRATIONS.md",
      "delivery/IMPLEMENTATION_PLAN.md",
      "delivery/TASK_BREAKDOWN.md",
      "delivery/ACCEPTANCE_CRITERIA.md",
      "delivery/TESTING_PLAN.md",
      "delivery/DEPLOYMENT_PLAN.md",
      "delivery/LAUNCH_CHECKLIST.md",
      "decisions/DECISION_LOG.md",
      "decisions/ASSUMPTIONS.md",
      "decisions/OPEN_QUESTIONS.md",
      "decisions/RISKS.md",
      "agent/CODEX.md",
      "agent/CLAUDE.md",
      "agent/CURSOR_RULES.md",
      "agent/FIRST_BUILD_PROMPT.md",
    ];

    for (const file of requiredFiles) {
      const fileObj = zip.file(file);
      expect(fileObj).toBeTruthy();
    }
  });
});
