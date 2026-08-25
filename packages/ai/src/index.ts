import {
  ConversationAgentResponseSchema,
  ConversationAssumptionSchema,
  ConversationConfirmedDecisionSchema,
  ConversationCorrectionSchema,
  ConversationExplicitFactSchema,
  ConversationModeSchema,
  ConversationProposalSchema,
  ConversationQuickReplySchema,
  ConversationResolvedAssumptionSchema,
  ConversationResolvedQuestionSchema,
  ConversationRiskSchema,
  ConversationSuggestedActionSchema,
  DesignArchitectureOutputSchema,
  DesignQualityReviewSchema,
  InitialIdeaExtraction,
  InitialIdeaExtractionSchema,
  PrototypeGenerationOutputSchema,
  type ConversationAgentResponse,
} from "@rockfoundry/core";
import { z } from "zod";
export * from "./schema";
export * from "./gateway";
export * from "./failure";
export * from "./prompts";
export * from "./env";
export * from "./public-demo";
export { ConversationAgentResponseSchema };

import {
  PROMPT_VERSIONS,
  SYSTEM_PROMPTS,
  TASK_MODEL_TIER,
  TASK_TEMPERATURE,
  reasoningEffortForTask,
} from "./prompts";
import {
  classifyDesignFailure,
  formatDesignFailureDiagnostics,
} from "./failure";
import { ApiError } from "./gateway";
import {
  AiGatewayProvider,
  InferenceRequest,
  InferenceResponse,
} from "./schema";

function item(
  value: string,
  confidence: "EXPLICIT" | "STRONGLY_INFERRED" | "WEAKLY_INFERRED" | "UNKNOWN",
  extractionReason: string,
) {
  return { value, confidence, evidenceText: value, extractionReason };
}

function mockConversationAgent(
  request: InferenceRequest<unknown>,
): ConversationAgentResponse {
  const payloadText = request.messages.at(-1)?.content || "";
  let payload: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(payloadText);
    if (parsed && typeof parsed === "object") payload = parsed as Record<string, unknown>;
  } catch {
    payload = { latestUserMessage: payloadText };
  }
  const latest = String(payload.latestUserMessage || "").trim();
  const projectContext = payload.projectContext;
  const context =
    typeof projectContext === "string"
      ? projectContext.toLowerCase()
      : projectContext && typeof projectContext === "object"
        ? JSON.stringify(projectContext).toLowerCase()
        : String(payload.summary || "").toLowerCase();
  const text = `${context} ${latest}`.toLowerCase();
  const base = {
    quickReplies: [],
    stateDelta: { explicitFacts: [], confirmedDecisions: [], corrections: [], resolvedQuestions: [], resolvedAssumptions: [] },
    proposals: [],
    assumptions: [],
    unresolvedRisks: [],
  } satisfies Pick<ConversationAgentResponse, "quickReplies" | "stateDelta" | "proposals" | "assumptions" | "unresolvedRisks">;
  const latestLower = latest.toLowerCase();
  if (/becak/.test(text)) {
    const cityQuestion =
      "Untuk awal, layanan ini dibatasi di satu kota atau langsung lintas kota?";
    const driverQuestion =
      "Driver-nya berasal dari pangkalan becak terdaftar atau pendaftaran terbuka?";
    if (/driver\s+nya|pangkalan becak/.test(latestLower)) {
      return {
        ...base,
        message:
          "Sip, mulai dari driver pangkalan becak yang sudah terdaftar membuat operasi dan kepercayaan lebih mudah dijaga. Setelah ini Draft Spec sudah cukup untuk ditinjau.",
        mode: "CLARIFICATION",
        stateDelta: {
          explicitFacts: [
            { path: "roles", value: "driver becak", evidence: "driver nya" },
            { path: "entities", value: "pangkalan becak", evidence: "pangkalan becak" },
          ],
          confirmedDecisions: [],
          corrections: [],
          resolvedQuestions: [
            {
              question: driverQuestion,
              evidence: "pangkalan becak yang sudah terdaftar",
            },
          ],
          resolvedAssumptions: [],
        },
        suggestedNextAction: { type: "CREATE_SPEC" },
      };
    }
    if (/mirip gojek|satu kota/.test(latestLower)) {
      return {
        ...base,
        message:
          "Mulai dari pola booking seperti Gojek, tetapi batasi layanan ke satu kota dulu supaya supply, tarif, dan operasionalnya bisa diuji dengan jelas.",
        mode: "CLARIFICATION",
        stateDelta: {
          explicitFacts: [
            { path: "features", value: "booking becak online", evidence: "mirip gojek" },
            { path: "objectives", value: "booking perjalanan", evidence: "mirip gojek" },
            { path: "constraints", value: "satu kota dulu", evidence: "satu kota dulu" },
          ],
          confirmedDecisions: [
            {
              topic: "service_area",
              decision: "satu kota dulu",
              evidence: "satu kota dulu",
              affects: ["workflows", "constraints"],
            },
          ],
          corrections: [],
          resolvedQuestions: [
            { question: cityQuestion, evidence: "satu kota dulu" },
          ],
          resolvedAssumptions: [],
        },
        suggestedNextAction: {
          type: "ASK_CONTEXTUAL_QUESTION",
          question: driverQuestion,
          quickReplies: [],
        },
      };
    }
    return {
      ...base,
      message:
        "Becak online bisa dimulai sebagai layanan booking yang menghubungkan penumpang dengan pengemudi lokal. Batas wilayah akan menentukan operasi MVP.",
      mode: "BRAINSTORM",
      suggestedNextAction: {
        type: "ASK_CONTEXTUAL_QUESTION",
        question: cityQuestion,
        quickReplies: [],
      },
    };
  }

  if (/owner|warung|usaha kecil/.test(text) && /uang|cash|keuangan|finance/.test(text)) {
    return {
      ...base,
      message: "Sip, berarti MVP ini cukup owner-only. Mulai dari transaksi masuk dan keluar, kategori, saldo kas, dan histori. Belum perlu role atau approval.",
      mode: "CLARIFICATION",
      stateDelta: {
        explicitFacts: [{ path: "roles", value: "owner", evidence: latest }],
        confirmedDecisions: [],
        corrections: [],
        resolvedQuestions: [],
        resolvedAssumptions: [],
      },
      suggestedNextAction: { type: "CREATE_SPEC" },
    };
  }
  if (/uang|cash|keuangan|finance|catat/.test(text)) {
    return {
      ...base,
      message: "Kalau tujuannya sederhana, gua mulai dari transaksi masuk dan keluar, kategori, saldo kas, dan histori. Untuk menjaga MVP tetap kecil, belum perlu role atau approval.",
      mode: "BRAINSTORM",
      suggestedNextAction: {
        type: "ASK_CONTEXTUAL_QUESTION",
        question: "Ini buat keuangan pribadi atau usaha kecil?",
        quickReplies: [
          { label: "Keuangan pribadi", value: "personal" },
          { label: "Usaha kecil", value: "small_business" },
        ],
      },
    };
  }
  if (/groom|anjing|pet|dog/.test(text)) {
    if (/beberapa layanan|satu booking|keduanya|gabung/.test(latest.toLowerCase())) {
      return {
        ...base,
        message: "Oke, satu booking bisa memuat beberapa layanan. Simpan layanan sebagai daftar di booking, lalu jadwal dan status penitipan tetap terlihat sebagai satu kunjungan.",
        mode: "CLARIFICATION",
        stateDelta: {
          explicitFacts: [
            { path: "features", value: "booking multi-layanan", evidence: latest },
          ],
          confirmedDecisions: [],
          corrections: [],
        resolvedQuestions: [],
        resolvedAssumptions: [],
        },
        suggestedNextAction: { type: "CREATE_SPEC" },
      };
    }
    if (/jadwal|staf|pemilik hewan|booking/.test(latest.toLowerCase())) {
      return {
        ...base,
        message: "Berarti jadwal adalah pusat operasionalnya: staf perlu melihat slot, layanan, dan status setiap anjing. Untuk MVP, satu booking bisa menyimpan layanan yang dipilih tanpa approval berlapis.",
        mode: "CLARIFICATION",
        stateDelta: {
          explicitFacts: [
            { path: "roles", value: "staf", evidence: latest },
            { path: "workflows", value: "booking layanan", evidence: latest },
          ],
          confirmedDecisions: [],
          corrections: [],
        resolvedQuestions: [],
        resolvedAssumptions: [],
        },
        suggestedNextAction: {
          type: "ASK_CONTEXTUAL_QUESTION",
          question: "Apakah satu booking boleh berisi grooming dan penitipan sekaligus?",
          quickReplies: [],
        },
      };
    }
    return {
      ...base,
      message: "Untuk grooming dan penitipan anjing, inti produknya kemungkinan jadwal layanan, profil hewan, dan status penitipan.",
      mode: "BRAINSTORM",
      suggestedNextAction: {
        type: "ASK_CONTEXTUAL_QUESTION",
        question: "Pemilik hewan biasanya booking grooming, penitipan, atau keduanya sekaligus?",
        quickReplies: [
          { label: "Grooming", value: "grooming" },
          { label: "Penitipan", value: "boarding" },
          { label: "Bisa keduanya", value: "combined" },
        ],
      },
    };
  }
  if (/festival|vendor|event|acara/.test(text)) {
    if (/mengubah status|panitia yang|administrasi/.test(latest.toLowerCase())) {
      return {
        ...base,
        message: "Berarti panitia menjadi pemilik status kelengkapan vendor. Perubahan status perlu tercatat, sedangkan vendor cukup melihat apa yang masih kurang dari berkas mereka.",
        mode: "CLARIFICATION",
        stateDelta: {
          explicitFacts: [
            { path: "roles", value: "panitia", evidence: latest },
            { path: "workflows", value: "review kelengkapan vendor", evidence: latest },
          ],
          confirmedDecisions: [],
          corrections: [],
        resolvedQuestions: [],
        resolvedAssumptions: [],
        },
        suggestedNextAction: { type: "CREATE_SPEC" },
      };
    }
    if (/lengkap|booth|panitia|vendor/.test(latest.toLowerCase())) {
      return {
        ...base,
        message: "Berarti MVP perlu daftar kelengkapan vendor dan penempatan booth yang bisa dilihat panitia. Pisahkan status administrasi dari lokasi supaya perubahan booth tidak menghapus bukti kelengkapan.",
        mode: "CLARIFICATION",
        stateDelta: {
          explicitFacts: [
            { path: "workflows", value: "review kelengkapan vendor", evidence: latest },
            { path: "workflows", value: "atur penempatan booth", evidence: latest },
          ],
          confirmedDecisions: [],
          corrections: [],
        resolvedQuestions: [],
        resolvedAssumptions: [],
        },
        suggestedNextAction: {
          type: "ASK_CONTEXTUAL_QUESTION",
          question: "Siapa yang boleh mengubah status kelengkapan vendor?",
          quickReplies: [],
        },
      };
    }
    return {
      ...base,
      message: "Untuk festival, produk ini sebaiknya mulai dari daftar vendor, status kelengkapan mereka, dan peta kebutuhan panitia. Jangan langsung jadi project-management suite.",
      mode: "BRAINSTORM",
      suggestedNextAction: {
        type: "ASK_CONTEXTUAL_QUESTION",
        question: "Panitia paling perlu mengontrol kelengkapan vendor atau penempatan booth?",
        quickReplies: [
          { label: "Kelengkapan vendor", value: "compliance" },
          { label: "Penempatan booth", value: "booth" },
        ],
      },
    };
  }
  if (/crm|marmer|marble|brand|sales/.test(text)) {
    if (/sales hanya|owner semua|brand sendiri|scoped/.test(latest.toLowerCase())) {
      return {
        ...base,
        message: "Oke, batas aksesnya jelas: sales hanya melihat brand sendiri, owner melihat seluruh brand. Itu cukup sebagai aturan MVP tanpa menambah approval atau assignment kompleks.",
        mode: "CLARIFICATION",
        stateDelta: {
          explicitFacts: [
            { path: "permissions", value: "sales brand-scoped, owner global", evidence: latest },
          ],
          confirmedDecisions: [],
          corrections: [],
        resolvedQuestions: [],
        resolvedAssumptions: [],
        },
        suggestedNextAction: { type: "CREATE_SPEC" },
      };
    }
    if (/histori|riwayat|customer lintas|owner|sales/.test(latest.toLowerCase())) {
      return {
        ...base,
        message: "Kalau histori customer harus tetap jelas lintas brand, simpan satu profil customer lalu hubungkan lead dan quotation ke brand masing-masing. Owner bisa melihat lintas brand, sementara sales tetap scoped.",
        mode: "CLARIFICATION",
        stateDelta: {
          explicitFacts: [
            { path: "workflows", value: "histori customer lintas brand", evidence: latest },
          ],
          confirmedDecisions: [],
          corrections: [],
        resolvedQuestions: [],
        resolvedAssumptions: [],
        },
        suggestedNextAction: { type: "CREATE_SPEC" },
      };
    }
    return {
      ...base,
      message: "Untuk CRM lima brand, inti MVP-nya adalah lead, follow-up, quotation, dan batas akses sales versus owner. Customer lintas brand perlu diputuskan karena itu akan memengaruhi histori dan pencarian.",
      mode: "BRAINSTORM",
      suggestedNextAction: {
        type: "ASK_CONTEXTUAL_QUESTION",
        question: "Kalau customer yang sama datang ke dua brand, histori sebaiknya tetap satu atau terpisah?",
        quickReplies: [
          { label: "Satu histori", value: "shared_identity" },
          { label: "Terpisah per brand", value: "separate_records" },
        ],
      },
    };
  }
  return {
    ...base,
    message: `Gua tangkap idenya: ${latest || "produk ini"}. Kita mulai dari hasil utama yang ingin dicapai pengguna, lalu sisihkan kompleksitas yang belum perlu untuk MVP.`,
    mode: "BRAINSTORM",
    suggestedNextAction: {
      type: "ASK_CONTEXTUAL_QUESTION",
      question: "Siapa yang paling sering memakai produk ini?",
      quickReplies: [],
    },
  };
}
export class MockGatewayProvider implements AiGatewayProvider {
  async complete<T>(req: InferenceRequest<T>): Promise<InferenceResponse<T>> {
    await new Promise((resolve) => setTimeout(resolve, 80));
    const taskType = req.taskType || "initial_idea_extraction";
    if (taskType === "initial_idea_extraction")
      return this.mockExtraction(req) as InferenceResponse<T>;
    if (taskType === "conversation_agent")
      return {
        data: mockConversationAgent(req) as T,
        usage: { promptTokens: 180, completionTokens: 180, totalTokens: 360 },
        metadata: { provider: "mock", model: "mock", latency: 80 },
      };
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

export const ConversationAgentResponseJsonSchema = z.toJSONSchema(
  ConversationAgentResponseSchema,
);

function portableConversationSchema(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const schema = { ...source };
  delete schema.$schema;
  delete schema.default;
  for (const keyword of [
    "minLength",
    "maxLength",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "pattern",
    "format",
  ]) {
    delete schema[keyword];
  }
  if (schema.oneOf && Array.isArray(schema.oneOf)) {
    schema.anyOf = schema.oneOf;
    delete schema.oneOf;
  }
  if (schema.const !== undefined) {
    schema.enum = [schema.const];
    delete schema.const;
  }
  if (schema.properties && typeof schema.properties === "object") {
    const originalRequired = new Set(
      Array.isArray(source.required)
        ? source.required.filter((key): key is string => typeof key === "string")
        : [],
    );
    const properties = Object.fromEntries(
      Object.entries(schema.properties as Record<string, unknown>).map(
        ([key, child]) => {
          const portable = portableConversationSchema(child);
          return [
            key,
            originalRequired.has(key)
              ? portable
              : { anyOf: [portable, { type: "null" }] },
          ];
        },
      ),
    );
    schema.properties = properties;
    schema.required = Object.keys(properties);
    schema.additionalProperties = false;
  }
  for (const key of ["items", "anyOf", "allOf"]) {
    const child = schema[key];
    if (Array.isArray(child)) schema[key] = child.map(portableConversationSchema);
    else if (child && typeof child === "object")
      schema[key] = portableConversationSchema(child);
  }
  return schema;
}

function normalizeConversationData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeConversationData);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== null)
      .map(([key, child]) => [key, normalizeConversationData(child)]),
  );
}

export const PortableConversationAgentResponseJsonSchema =
  portableConversationSchema(ConversationAgentResponseJsonSchema);

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

export type ConversationAgentOutputIssue = {
  path: Array<string | number>;
  code?: string;
  message: string;
};

export class ConversationAgentOutputError extends Error {
  readonly code = "AI_CONVERSATION_OUTPUT_INVALID" as const;

  constructor(
    message: string,
    public readonly issues: ConversationAgentOutputIssue[] = [],
  ) {
    super(message);
    this.name = "ConversationAgentOutputError";
  }
}

function conversationOutputIssues(error: z.ZodError): ConversationAgentOutputIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.filter(
      (part): part is string | number => typeof part === "string" || typeof part === "number",
    ),
    code: issue.code,
    message: issue.message,
  }));
}

function conversationObject(value: unknown): Record<string, unknown> {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw new ConversationAgentOutputError("Conversation Agent output was not valid JSON.");
    }
  }
  const normalized = normalizeConversationData(parsed);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    throw new ConversationAgentOutputError("Conversation Agent output must be a JSON object.");
  }
  return normalized as Record<string, unknown>;
}

function curateConversationItems<T>(value: unknown, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const result = schema.safeParse(normalizeConversationData(entry));
    return result.success ? [result.data] : [];
  });
}

export function normalizeConversationAgentResponse(
  raw: unknown,
  requestedMode: string,
): ConversationAgentResponse {
  const source = conversationObject(raw);
  if (typeof source.message !== "string" || !source.message.trim()) {
    const issue = {
      path: ["message"],
      code: "invalid_type",
      message: "Conversation Agent output requires a non-empty message.",
    } satisfies ConversationAgentOutputIssue;
    throw new ConversationAgentOutputError(issue.message, [issue]);
  }
  const requested = ConversationModeSchema.safeParse(requestedMode);
  if (!requested.success) {
    throw new ConversationAgentOutputError(
      "Conversation Agent requested mode is not supported.",
      conversationOutputIssues(requested.error),
    );
  }
  const state =
    source.stateDelta && typeof source.stateDelta === "object" && !Array.isArray(source.stateDelta)
      ? (source.stateDelta as Record<string, unknown>)
      : {};
  const action = ConversationSuggestedActionSchema.safeParse(source.suggestedNextAction);
  const mode = ConversationModeSchema.safeParse(source.mode);
  const curated = {
    message: source.message,
    mode: mode.success ? mode.data : requested.data,
    quickReplies: curateConversationItems(source.quickReplies, ConversationQuickReplySchema),
    stateDelta: {
      explicitFacts: curateConversationItems(state.explicitFacts, ConversationExplicitFactSchema),
      confirmedDecisions: curateConversationItems(state.confirmedDecisions, ConversationConfirmedDecisionSchema),
      corrections: curateConversationItems(state.corrections, ConversationCorrectionSchema),
      resolvedQuestions: curateConversationItems(state.resolvedQuestions, ConversationResolvedQuestionSchema),
      resolvedAssumptions: curateConversationItems(state.resolvedAssumptions, ConversationResolvedAssumptionSchema),
    },
    proposals: curateConversationItems(source.proposals, ConversationProposalSchema),
    assumptions: curateConversationItems(source.assumptions, ConversationAssumptionSchema),
    unresolvedRisks: curateConversationItems(source.unresolvedRisks, ConversationRiskSchema),
    suggestedNextAction: action.success ? action.data : { type: "NONE" as const },
  };
  const result = ConversationAgentResponseSchema.safeParse(curated);
  if (!result.success) {
    throw new ConversationAgentOutputError(
      "Curated Conversation Agent output did not satisfy the response contract.",
      conversationOutputIssues(result.error),
    );
  }
  return result.data;
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

  async runConversationAgent(input: {
    project: Record<string, unknown>;
    latestUserMessage: string;
    mode: string;
    riskContext: unknown[];
    draftSpecReady?: boolean;
    importantUnresolvedCount?: number;
    highestImpactRisk?: unknown;
  }): Promise<ConversationAgentResponse> {
    const maturityContext = {
      draftSpecReady: input.draftSpecReady ?? false,
      importantUnresolvedCount: input.importantUnresolvedCount ?? null,
      highestImpactRisk: input.highestImpactRisk ?? null,
    };
    const baseRequest: InferenceRequest<unknown> = {
      taskType: "conversation_agent",
      modelTier: "default",
      messages: [
        {
          role: "system",
          content:
            "You are RockFoundry's Conversation Agent. Reply in the user's language, usually natural Indonesian when they write Indonesian. Address the idea first, provide useful product thinking, simplify MVP scope, and ask a contextual question only when it materially helps. When draftSpecReady is false, prioritize one important product-shape uncertainty from the supplied context instead of interrogating for completeness. When draftSpecReady is true, stop completeness interrogation, summarize the current product truth, and offer the Draft Spec action when appropriate. Never expose internal archetype names, decision debt jargon, planner terminology, or canned questionnaire language. The visible message must be authored naturally by you. Return JSON only. State delta rules: explicitFacts and confirmedDecisions require direct user evidence; AI proposals belong in proposals and must never become accepted decisions; inferences belong in assumptions. quickReplies are optional shortcuts, never required. Allowed mode values: BRAINSTORM, CLARIFICATION, CORRECTION, SPEC_REQUEST, DESIGN_REQUEST, RESEARCH_REQUEST, REFERENCE, HANDOFF_REQUEST. Assumption confidence values: STRONGLY_INFERRED, WEAKLY_INFERRED, UNKNOWN. Assumption impact values: LOW, MEDIUM, HIGH. Keep the response concise but useful.",
        },
        {
          role: "user",
          content: JSON.stringify({
            projectContext: input.project,
            latestUserMessage: input.latestUserMessage,
            mode: input.mode,
            relevantRisks: input.riskContext,
            maturityContext,
          }),
        },
      ],
      temperature: 0.45,
      responseFormat: "json",
      responseSchema: PortableConversationAgentResponseJsonSchema,
      maxRetries: 0,
      providerDiagnostics: this.provider.diagnostics,
    };

    const repair = async (data: unknown, validation: unknown) => {
      const issues =
        validation instanceof ConversationAgentOutputError
          ? validation.issues
          : validation instanceof z.ZodError
            ? conversationOutputIssues(validation)
            : [{ path: [], message: "Invalid Conversation Agent output." }];
      console.warn(
        `${this.providerDiagnostic("repair")} schemaIssues=${issues.map((issue) => `${issue.path.join(".") || "<root>"}:${issue.code || "invalid"}`).join("|")}`,
      );
      const repaired = await this.provider.complete({
        ...baseRequest,
        responseSchema: undefined,
        messages: [
          ...baseRequest.messages,
          {
            role: "user",
            content: JSON.stringify({
              instruction:
                "Repair the previous JSON object to match the Conversation Agent contract. Preserve the natural visible message exactly when present. Do not invent product facts or accepted decisions. Return a JSON object only.",
              validationIssues: issues,
              previousJson: data,
            }),
          },
        ],
      });
      const curated = normalizeConversationAgentResponse(repaired.data, input.mode);
      console.warn(`${this.providerDiagnostic("repair")} result=curated`);
      return curated;
    };

    let strictResult: InferenceResponse<unknown> | undefined;
    try {
      strictResult = await this.provider.complete(baseRequest);
    } catch (strictError) {
      const strictDiagnostic = classifyDesignFailure(strictError, {
        task: "conversation_agent",
      });
      console.warn(
        `${this.providerDiagnostic("strict_schema")} ${formatDesignFailureDiagnostics(strictDiagnostic)}`,
      );
      if (
        !(strictError instanceof ApiError) ||
        strictError.statusCode < 400 ||
        strictError.statusCode >= 500
      ) {
        throw strictError;
      }
    }

    if (strictResult) {
      try {
        return normalizeConversationAgentResponse(strictResult.data, input.mode);
      } catch (outputError) {
        if (!(outputError instanceof ConversationAgentOutputError)) throw outputError;
        return repair(strictResult.data, outputError);
      }
    }

    let jsonObjectResult: InferenceResponse<unknown>;
    try {
      jsonObjectResult = await this.provider.complete({
        ...baseRequest,
        responseSchema: undefined,
      });
    } catch (fallbackError) {
      const diagnostic = classifyDesignFailure(fallbackError, {
        task: "conversation_agent",
      });
      console.warn(
        `${this.providerDiagnostic("json_object_fallback")} ${formatDesignFailureDiagnostics(diagnostic)}`,
      );
      throw fallbackError;
    }

    try {
      return normalizeConversationAgentResponse(jsonObjectResult.data, input.mode);
    } catch (outputError) {
      if (!(outputError instanceof ConversationAgentOutputError)) throw outputError;
      return repair(jsonObjectResult.data, outputError);
    }
  }

  private providerDiagnostic(stage: string) {
    const diagnostics = this.provider.diagnostics;
    return `task=conversation_agent provider=${diagnostics?.provider || "unknown"}${diagnostics?.model ? ` model=${diagnostics.model}` : ""} stage=${stage}`;
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
