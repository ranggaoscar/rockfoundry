import { InitialIdeaExtraction } from "@rockfoundry/core";
import { AiGatewayProvider, InferenceRequest, InferenceResponse } from "./schema";

export * from "./schema";
export * from "./gateway";
export * from "./prompts";
export * from "./env";

import { PROMPT_VERSIONS, SYSTEM_PROMPTS, TASK_MODEL_TIER, TASK_TEMPERATURE } from "./prompts";

export class MockGatewayProvider implements AiGatewayProvider {
  async complete<T>(req: InferenceRequest<T>): Promise<InferenceResponse<T>> {
    // Simulate realistic latency
    await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 500));

    const taskType = req.taskType || "initial_idea_extraction";

    if (taskType === "initial_idea_extraction") {
      return this.mockExtraction(req) as any;
    }

    // Generic mock for other task types
    return {
      data: {
        mock: true,
        taskType,
        message: `Mock response for ${taskType}`,
        analysis: `This is a simulated analysis for ${taskType}. In development mode, the AI provider returns this mock result.`,
      } as unknown as T,
      usage: { promptTokens: 100, completionTokens: 150, totalTokens: 250 },
      metadata: { provider: "mock", model: "mock", latency: 500 },
    };
  }

  private mockExtraction(req: InferenceRequest<any>): InferenceResponse<any> {
    const userMsg = req.messages.find((m) => m.role === "user")?.content || "";
    const rawIdea = userMsg.split("---\n")[1]?.split("\n---")[0]?.trim() || userMsg;

    // Extract meaningful info from raw idea for realistic mock
    const words = rawIdea.toLowerCase().split(/\s+/);
    const hasMobile = words.includes("mobile") || words.includes("ios") || words.includes("android");
    const hasWeb = words.includes("web") || words.includes("website") || words.includes("saas");
    const hasPayment = words.includes("pay") || words.includes("payment") || words.includes("billing");

    const response: InitialIdeaExtraction = {
      normalizedSummary: {
        value: rawIdea.substring(0, 200),
        confidence: "EXPLICIT",
        evidenceText: rawIdea.substring(0, 100),
        extractionReason: "Direct from user input",
      },
      productType: hasMobile
        ? { value: "Mobile App", confidence: "STRONGLY_INFERRED", evidenceText: "mobile mentioned", extractionReason: "Mobile platform referenced" }
        : hasWeb
        ? { value: "Web Application", confidence: "STRONGLY_INFERRED", evidenceText: "web platform mentioned", extractionReason: "Web platform referenced" }
        : { value: "Software Product", confidence: "WEAKLY_INFERRED", evidenceText: "general software", extractionReason: "General software product" },
      primaryUsers: [
        { value: "End Users", confidence: "WEAKLY_INFERRED", evidenceText: "no specific users", extractionReason: "No specific users mentioned" },
      ],
      userProblems: [],
      objectives: [
        { value: `Build a ${hasMobile ? "mobile" : hasWeb ? "web" : "software"} product`, confidence: "EXPLICIT", evidenceText: rawIdea.substring(0, 80), extractionReason: "Primary objective" },
      ],
      proposedCapabilities: [],
      coreEntities: [
        { value: "User Account", confidence: "STRONGLY_INFERRED", evidenceText: "product described", extractionReason: "Most products need user accounts" },
      ],
      expectedWorkflows: [],
      integrationsMentioned: hasPayment
        ? [{ value: "Payment Processing", confidence: "EXPLICIT", evidenceText: "payment mentioned", extractionReason: "Payment explicitly mentioned" }]
        : [],
      platforms: hasMobile
        ? [{ value: "iOS", confidence: "WEAKLY_INFERRED", evidenceText: "mobile", extractionReason: "Mobile apps typically need iOS" }]
        : hasWeb
        ? [{ value: "Web", confidence: "EXPLICIT", evidenceText: "web platform", extractionReason: "Web platform" }]
        : [],
      businessModel: { value: "To be determined", confidence: "UNKNOWN", evidenceText: "not specified", extractionReason: "Business model not mentioned" },
      privacySignals: [],
      scaleSignals: [],
      designSignals: [],
      constraints: [],
      assumptions: [
        { value: "Users have reliable internet access", confidence: "STRONGLY_INFERRED", evidenceText: "software product", extractionReason: "Most software assumes internet" },
      ],
      ambiguities: [
        { value: "Target user demographics not specified", confidence: "UNKNOWN", evidenceText: "no user details", extractionReason: "No user demographics mentioned" },
      ],
      possibleContradictions: [],
      unsupportedClaims: [],
    };

    return {
      data: response,
      usage: { promptTokens: 200, completionTokens: 350, totalTokens: 550 },
      metadata: { provider: "mock", model: "mock", latency: 1000 },
    };
  }
}

export class AiGateway {
  constructor(private provider: AiGatewayProvider = new MockGatewayProvider()) {}

  async runInitialExtraction(rawIdea: string): Promise<{
    extraction: InitialIdeaExtraction;
    promptVersion: string;
    model: string;
    latency: number;
    tokenUsage: number;
  }> {
    const taskType = "initial_idea_extraction";
    const promptInfo = PROMPT_VERSIONS[taskType];
    const systemPrompt = SYSTEM_PROMPTS[taskType];
    const modelTier = TASK_MODEL_TIER[taskType];

    const result = await this.provider.complete({
      taskType,
      modelTier,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Extract structured information from this product idea:\n\n---\n${rawIdea}\n---` },
      ],
      temperature: TASK_TEMPERATURE[taskType],
    });

    return {
      extraction: result.data as unknown as InitialIdeaExtraction,
      promptVersion: promptInfo?.version || "unknown",
      model: result.metadata?.model || "unknown",
      latency: result.metadata?.latency || 0,
      tokenUsage: result.usage?.totalTokens || 0,
    };
  }
}
