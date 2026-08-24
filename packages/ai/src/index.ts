import {
  DesignArchitectureOutputSchema,
  DesignQualityReviewSchema,
  InitialIdeaExtraction,
  InitialIdeaExtractionSchema,
  PrototypeGenerationOutputSchema,
} from "@rockfoundry/core";
import { z } from "zod";
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
  reasoningEffortForTask,
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
    if (taskType === "design_quality_review")
      return {
        data: { verdict: "PASS", score: 86, assessments: [{ area: "grounding", assessment: "Prototype follows the supplied screen map." }], blockingProblems: [], improvements: [] } as T,
        usage: { promptTokens: 100, completionTokens: 80, totalTokens: 180 },
        metadata: { provider: "mock", model: "mock", latency: 80 },
      };
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

const DesignArchitectureResponseSchema = z.toJSONSchema(
  DesignArchitectureOutputSchema,
);
const PrototypeGenerationResponseSchema = z.toJSONSchema(
  PrototypeGenerationOutputSchema,
);

type SafeZodError = z.ZodError & { topLevelKeys?: string[] };

function annotateZodError(error: z.ZodError, data: unknown): SafeZodError {
  const topLevelKeys =
    data && typeof data === "object" && !Array.isArray(data)
      ? Object.keys(data as Record<string, unknown>).sort()
      : [];
  return Object.assign(error, { topLevelKeys });
}

function normalizeMissingDesignSummary(
  data: unknown,
  requiredKey: "designSpec" | "files",
  summary: string,
) {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    !(requiredKey in data) ||
    "summary" in data
  )
    return data;
  return { ...data, summary };
}

export class AiGateway {
  constructor(
    private provider: AiGatewayProvider = new MockGatewayProvider(),
  ) {}

  private async completeWithSchemaRepair<T>(
    request: InferenceRequest<unknown>,
    schema: z.ZodType<T>,
    normalize: (data: unknown) => unknown = (data) => data,
  ): Promise<InferenceResponse<unknown>> {
    const taskType = request.taskType || "initial_idea_extraction";
    const effectiveRequest = {
      ...request,
      reasoningEffort: reasoningEffortForTask(taskType, request.reasoningEffort),
    };
    const initial = await this.provider.complete<unknown>(effectiveRequest);
    const normalizedInitial = { ...initial, data: normalize(initial.data) };
    const initialValidation = schema.safeParse(normalizedInitial.data);
    if (initialValidation.success) return normalizedInitial;

    const issues = initialValidation.error.issues.map((issue) => ({
      path: issue.path.join("."),
      code: issue.code,
      expected:
        "expected" in issue && typeof issue.expected === "string"
          ? issue.expected
          : undefined,
      message: issue.message,
    }));
    const repaired = await this.provider.complete<unknown>({
      ...effectiveRequest,
      messages: [
        ...request.messages,
        {
          role: "user",
          content: JSON.stringify({
            instruction:
              "Correct the previous JSON so it conforms exactly to the supplied structured-output schema. Preserve valid content. Do not add product behavior, actors, workflows, or routes.",
            previousJson: initial.data,
            zodIssues: issues,
          }),
        },
      ],
    });
    const normalizedRepaired = { ...repaired, data: normalize(repaired.data) };
    const repairedValidation = schema.safeParse(normalizedRepaired.data);
    if (!repairedValidation.success)
      throw annotateZodError(repairedValidation.error, normalizedRepaired.data);
    return normalizedRepaired;
  }

  async runPlannerAction<T>(input: {
    system: string;
    user: string;
    taskType?: string;
  }) {
    const result = await this.provider.complete<T>({
      taskType: input.taskType || "contextual_question_enrichment",
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      temperature: 0.1,
      responseFormat: "json",
    });
    return result;
  }

  async runDesignArchitecture(input: {
    product: Record<string, unknown>;
    screenMap: unknown[];
  }) {
    const result = await this.completeWithSchemaRepair(
      {
        taskType: "design_architecture",
        modelTier: "strong",
        messages: [
          {
            role: "system",
            content:
              "Return JSON only. You are a product design architect. Product truth and Screen Map are authoritative. Do not add product behavior, actors, routes, or workflows. Produce a designSpec with visual direction, hierarchy, responsive behavior, interaction notes, and explicit assumptions.",
          },
          {
            role: "user",
            content: JSON.stringify({
              product: input.product,
              screenMap: input.screenMap,
            }),
          },
        ],
        temperature: 0.25,
        responseFormat: "json",
        responseSchema: DesignArchitectureResponseSchema,
      },
      DesignArchitectureOutputSchema,
      (data) =>
        normalizeMissingDesignSummary(
          data,
          "designSpec",
          "Generated design architecture from confirmed product decisions.",
        ),
    );
    const architecture = DesignArchitectureOutputSchema.parse(result.data);
    return {
      architecture,
      model: result.metadata?.model || "unknown",
      latency: result.metadata?.latency || 0,
      tokenUsage: result.usage?.totalTokens || 0,
    };
  }

  async runDesignQualityReview(input: {
    productSummary: string;
    screenMap: unknown[];
    designSpec: unknown;
    prototype: { html: string; css: string; js: string };
    quality: unknown;
  }) {
    const result = await this.completeWithSchemaRepair(
      {
        taskType: "design_quality_review",
        messages: [
          { role: "system", content: "Evaluate only fidelity, screen coverage, hierarchy, interactions, and design contract adherence. Do not invent product behavior. Return JSON only." },
          { role: "user", content: JSON.stringify(input) },
        ],
        responseFormat: "json",
        responseSchema: DesignQualityReviewSchema.toJSONSchema(),
      },
      DesignQualityReviewSchema,
    );
    return DesignQualityReviewSchema.parse(result.data);
  }

  async runPrototypeRepair(input: {
    product: Record<string, unknown>;
    screenMap: unknown[];
    designSpec: unknown;
    existingFiles: Array<{ path: string; content: string }>;
    blockingProblems: string[];
  }) {
    const result = await this.runPrototypeGeneration({
      product: input.product,
      architecture: input.designSpec,
      screenMap: input.screenMap,
      existingFiles: input.existingFiles,
      taskType: "prototype_repair",
      revisionRequest: `Repair only these quality problems: ${input.blockingProblems.join("; ")}. Preserve routes, behavior, and Product Truth.`,
    });
    return result;
  }

  async runPrototypeGeneration(input: {
    product: Record<string, unknown>;
    architecture: unknown;
    screenMap: unknown[];
    revisionRequest?: string;
    existingFiles?: Array<{ path: string; content: string }>;
    taskType?: string;
  }) {
    const result = await this.completeWithSchemaRepair(
      {
        taskType: input.taskType || "prototype_generation",
          modelTier: "strong",
        messages: [
          {
            role: "system",
            content:
              "Return JSON only. Produce exactly index.html, styles.css, and app.js. Use only local files: no CDN, no external scripts/styles, no fetch/XHR/WebSocket/iframe/object/embed, no top/parent navigation. The Screen Map is authoritative: preserve every route exactly and do not add routes. HTML must include main and nav. CSS must include an @media responsive rule. JavaScript may only handle local hash routing and parent postMessage component selection. If revising, modify the existing prototype visibly while retaining all declared routes.",
          },
          {
            role: "user",
            content: JSON.stringify({
              product: input.product,
              architecture: input.architecture,
              screenMap: input.screenMap,
              revisionRequest: input.revisionRequest || null,
              existingFiles: input.existingFiles || null,
            }),
          },
        ],
        temperature: 0.35,
        responseFormat: "json",
        responseSchema: PrototypeGenerationResponseSchema,
      },
      PrototypeGenerationOutputSchema,
      (data) =>
        normalizeMissingDesignSummary(
          data,
          "files",
          "Generated interactive prototype from the approved design architecture.",
        ),
    );
    const prototype = PrototypeGenerationOutputSchema.parse(result.data);
    return {
      prototype,
      model: result.metadata?.model || "unknown",
      latency: result.metadata?.latency || 0,
      tokenUsage: result.usage?.totalTokens || 0,
    };
  }

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
      reasoningEffort: "medium",
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
