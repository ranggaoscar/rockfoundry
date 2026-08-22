import {
  InitialIdeaExtraction,
  InitialIdeaExtractionSchema,
} from "@rockfoundry/core";
import {
  AiGatewayProvider,
  InferenceRequest,
  InferenceResponse,
} from "./schema";

export * from "./schema";
export * from "./gateway";
export * from "./prompts";
export * from "./env";
export * from "./public-demo";

import {
  PROMPT_VERSIONS,
  SYSTEM_PROMPTS,
  TASK_MODEL_TIER,
  TASK_TEMPERATURE,
} from "./prompts";

function item(
  value: string,
  confidence: "EXPLICIT" | "STRONGLY_INFERRED" | "WEAKLY_INFERRED" | "UNKNOWN",
  extractionReason: string,
) {
  return { value, confidence, evidenceText: value, extractionReason };
}

export class MockGatewayProvider implements AiGatewayProvider {
  async complete<T>(req: InferenceRequest<T>): Promise<InferenceResponse<T>> {
    await new Promise((resolve) => setTimeout(resolve, 80));
    const taskType = req.taskType || "initial_idea_extraction";
    if (taskType === "initial_idea_extraction")
      return this.mockExtraction(req) as InferenceResponse<T>;
    return {
      data: {
        mock: true,
        taskType,
        message: `Mock response for ${taskType}`,
      } as T,
      usage: { promptTokens: 100, completionTokens: 150, totalTokens: 250 },
      metadata: { provider: "mock", model: "mock", latency: 80 },
    };
  }

  private mockExtraction(
    req: InferenceRequest<unknown>,
  ): InferenceResponse<InitialIdeaExtraction> {
    const userMessage =
      req.messages.find((message) => message.role === "user")?.content || "";
    const rawIdea =
      userMessage.match(/---\s*([\s\S]*?)\s*---/)?.[1]?.trim() ||
      userMessage.trim();
    const lower = rawIdea.toLowerCase();
    const extraction: InitialIdeaExtraction = {
      normalizedSummary: item(
        rawIdea.slice(0, 240),
        "EXPLICIT",
        "Copied from the user idea",
      ),
      productType: item(
        lower.includes("mobile") ? "Mobile application" : "Web application",
        "STRONGLY_INFERRED",
        "Platform wording in the idea or default web-first interpretation",
      ),
      primaryUsers: [],
      userProblems: [],
      objectives: [
        item(
          `Build ${lower.includes("crm") ? "a sales workspace" : lower.includes("inventory") || lower.includes("warehouse") ? "an inventory workflow" : lower.includes("rental") || lower.includes("booking") ? "a booking workflow" : "the described product"}`,
          "EXPLICIT",
          "The user asked to build this product",
        ),
      ],
      proposedCapabilities: [],
      coreEntities: [],
      expectedWorkflows: [],
      integrationsMentioned: [],
      platforms:
        lower.includes("mobile") ||
        lower.includes("ios") ||
        lower.includes("android")
          ? [item("Mobile", "EXPLICIT", "Mobile platform mentioned")]
          : [
              item(
                "Web",
                "STRONGLY_INFERRED",
                "Browser delivery is the safest first assumption",
              ),
            ],
      businessModel: undefined,
      privacySignals: [],
      scaleSignals: [],
      designSignals: [],
      constraints: [],
      assumptions: [],
      ambiguities: [],
      possibleContradictions: [],
      unsupportedClaims: [],
    };

    if (
      /marble|marmer|stone|slab|granite/.test(lower) &&
      !/warehouse|inventory|stock|transfer history|movement/.test(lower)
    ) {
      extraction.primaryUsers.push(
        item(
          "Sales team",
          "EXPLICIT",
          "Sales role is implied by marble sales wording",
        ),
      );
      extraction.primaryUsers.push(
        item(
          "Brand owner",
          "STRONGLY_INFERRED",
          "Multi-brand sales systems usually need an owner view",
        ),
      );
      extraction.coreEntities.push(
        item("Customer", "EXPLICIT", "Sales CRM needs customer history"),
      );
      extraction.coreEntities.push(
        item(
          "Quotation",
          "EXPLICIT",
          "Quotation is a central stone-sales workflow",
        ),
      );
      extraction.coreEntities.push(
        item("Brand", "EXPLICIT", "Several marble brands are part of the idea"),
      );
      extraction.proposedCapabilities.push(
        item(
          "Track leads and follow-ups",
          "EXPLICIT",
          "Sales follow-up is part of the stated use case",
        ),
      );
      extraction.proposedCapabilities.push(
        item(
          "Manage quotations",
          "EXPLICIT",
          "Quotation is part of the stated use case",
        ),
      );
      extraction.expectedWorkflows.push(
        item(
          "A sales person records a customer conversation and follows up",
          "STRONGLY_INFERRED",
          "CRM workflow implied by sales wording",
        ),
      );
    } else if (
      /warehouse|inventory|stock|slab movement|transfer history/.test(lower)
    ) {
      extraction.primaryUsers.push(
        item(
          "Warehouse staff",
          "EXPLICIT",
          "Warehouse staff are named or directly implied",
        ),
      );
      extraction.primaryUsers.push(
        item(
          "Owner",
          "STRONGLY_INFERRED",
          "The owner usually needs cross-warehouse visibility",
        ),
      );
      extraction.coreEntities.push(
        item("Warehouse", "EXPLICIT", "Warehouse is named in the idea"),
      );
      extraction.coreEntities.push(
        item("Inventory item", "EXPLICIT", "Inventory is named in the idea"),
      );
      extraction.coreEntities.push(
        item(
          "Inventory movement",
          "EXPLICIT",
          "Transfer or movement history is named in the idea",
        ),
      );
      extraction.proposedCapabilities.push(
        item(
          "Track current inventory location",
          "EXPLICIT",
          "Current location is central to inventory",
        ),
      );
      if (/transfer|movement|history|move/.test(lower))
        extraction.proposedCapabilities.push(
          item(
            "Preserve transfer history",
            "EXPLICIT",
            "Movement history is named in the idea",
          ),
        );
      extraction.expectedWorkflows.push(
        item(
          "Staff records an inventory transfer between warehouses",
          "EXPLICIT",
          "Transfer workflow is named in the idea",
        ),
      );
      if (/marble|marmer|stone|slab|granite/.test(lower))
        extraction.coreEntities.push(
          item(
            "Brand",
            "EXPLICIT",
            "Several stone brands are part of the idea",
          ),
        );
    } else if (/rental|car|vehicle|booking/.test(lower)) {
      extraction.primaryUsers.push(
        item(
          "Customer",
          "EXPLICIT",
          "Customer booking is implied by rental wording",
        ),
      );
      extraction.primaryUsers.push(
        item(
          "Rental staff",
          "EXPLICIT",
          "Rental operations require staff managing availability",
        ),
      );
      extraction.coreEntities.push(
        item("Vehicle", "EXPLICIT", "Vehicle is named or directly implied"),
      );
      extraction.coreEntities.push(
        item("Booking", "EXPLICIT", "Booking is named in the idea"),
      );
      extraction.coreEntities.push(
        item(
          "Customer",
          "EXPLICIT",
          "Customer history is named or directly implied",
        ),
      );
      extraction.proposedCapabilities.push(
        item(
          "Check vehicle availability",
          "EXPLICIT",
          "Availability is central to rental booking",
        ),
      );
      extraction.proposedCapabilities.push(
        item(
          "Create and manage bookings",
          "EXPLICIT",
          "Booking is named in the idea",
        ),
      );
      extraction.expectedWorkflows.push(
        item(
          "Customer requests a vehicle and staff confirms availability",
          "EXPLICIT",
          "Booking workflow is named in the idea",
        ),
      );
    } else if (/crm|sales|lead|follow.?up/.test(lower)) {
      extraction.primaryUsers.push(
        item("Sales team", "EXPLICIT", "Sales wording is present in the idea"),
      );
      extraction.coreEntities.push(
        item("Lead", "EXPLICIT", "Lead is named or directly implied"),
      );
      extraction.coreEntities.push(
        item(
          "Customer",
          "STRONGLY_INFERRED",
          "A lead workflow normally becomes customer history",
        ),
      );
      extraction.proposedCapabilities.push(
        item("Record follow-ups", "EXPLICIT", "Follow-up is named in the idea"),
      );
      extraction.expectedWorkflows.push(
        item(
          "Sales staff captures a lead and schedules a follow-up",
          "EXPLICIT",
          "CRM workflow is named in the idea",
        ),
      );
    } else {
      const stop =
        /^(?:i|want|to|a|an|the|for|with|and|or|of|my|our|build|create|make|web|website|app|application|system|platform|gua|gue|saya|aku|mau|ingin|bikin|buat|bangun|jualan|jual|beli|untuk|dari|yang|dan|ini|itu|aplikasi|produk)$/i;
      const nouns = rawIdea
        .split(/\s+/)
        .map((value) => value.replace(/[^\p{L}\p{N}-]+/gu, ""))
        .filter((value) => value.length >= 4 && !stop.test(value))
        .slice(0, 4);
      for (const noun of nouns) {
        extraction.coreEntities.push(
          item(noun, "STRONGLY_INFERRED", "Named in the starting idea"),
        );
      }
      extraction.ambiguities.push(
        item(
          "The main user role is not explicit",
          "UNKNOWN",
          "No domain-specific user role was found",
        ),
      );
    }

    if (/whatsapp/.test(lower))
      extraction.integrationsMentioned.push(
        item("WhatsApp", "EXPLICIT", "WhatsApp is named in the idea"),
      );
    if (/instagram/.test(lower))
      extraction.integrationsMentioned.push(
        item("Instagram", "EXPLICIT", "Instagram is named in the idea"),
      );
    if (/website|web site|web/.test(lower))
      extraction.integrationsMentioned.push(
        item("Website", "EXPLICIT", "Website is named in the idea"),
      );
    if (/payment|pay|invoice|checkout/.test(lower))
      extraction.integrationsMentioned.push(
        item(
          "Payment processing",
          "EXPLICIT",
          "Payment wording is present in the idea",
        ),
      );
    return {
      data: InitialIdeaExtractionSchema.parse(extraction),
      usage: { promptTokens: 220, completionTokens: 360, totalTokens: 580 },
      metadata: { provider: "mock", model: "mock", latency: 80 },
    };
  }
}

export class AiGateway {
  constructor(
    private provider: AiGatewayProvider = new MockGatewayProvider(),
  ) {}

  async runInitialExtraction(rawIdea: string) {
    const taskType = "initial_idea_extraction" as const;
    const promptInfo = PROMPT_VERSIONS[taskType];
    const result = await this.provider.complete<InitialIdeaExtraction>({
      taskType,
      modelTier: TASK_MODEL_TIER[taskType],
      messages: [
        { role: "system", content: SYSTEM_PROMPTS[taskType] },
        {
          role: "user",
          content: `Extract structured information from this product idea:\n\n---\n${rawIdea}\n---`,
        },
      ],
      temperature: TASK_TEMPERATURE[taskType],
      responseFormat: "json",
    });
    const extraction = InitialIdeaExtractionSchema.parse(result.data);
    return {
      extraction,
      promptVersion: promptInfo?.version || "unknown",
      model: result.metadata?.model || "unknown",
      latency: result.metadata?.latency || 0,
      tokenUsage: result.usage?.totalTokens || 0,
    };
  }
}
