import { describe, expect, it, vi } from "vitest";
import {
  AiGateway,
  ConversationAgentResponseJsonSchema,
  ConversationAgentResponseSchema,
  MockGatewayProvider,
  PortableConversationAgentResponseJsonSchema,
  normalizeConversationAgentResponse,
} from "../index";
import { ApiError, OpenAICompatibleGateway } from "../gateway";

function providerResponse(content: string) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 12, total_tokens: 22 },
    }),
  };
}

function validConversation(message = "Model-authored response") {
  return {
    message,
    mode: "BRAINSTORM",
    quickReplies: [],
    stateDelta: {
      explicitFacts: [],
      confirmedDecisions: [],
      corrections: [],
      resolvedQuestions: [],
      resolvedAssumptions: [],
    },
    proposals: [],
    assumptions: [],
    unresolvedRisks: [],
    suggestedNextAction: { type: "NONE" },
  };
}

const lunaMalformedOptionalResponse = {
  message: "Becak online bisa dimulai dari booking sederhana di satu kota.",
  mode: "DISCOVERY",
  quickReplies: ["Satu kota dulu", "Lintas kota"],
  stateDelta: {
    explicitFacts: [],
    confirmedDecisions: [],
    corrections: [],
    resolvedQuestions: [],
    resolvedAssumptions: [],
  },
  proposals: ["Mulai dari aplikasi penumpang dan driver"],
  assumptions: [
    {
      statement: "Driver memiliki telepon pintar",
      confidence: "MEDIUM",
      impact: "CRITICAL",
    },
  ],
  unresolvedRisks: [],
  suggestedNextAction: {
    type: "ASK_CONTEXTUAL_QUESTION",
    question: "Untuk awal, layanan ini dibatasi di satu kota atau lintas kota?",
    quickReplies: [],
  },
};


function walkSchema(value: unknown, visit: (node: Record<string, unknown>) => void) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const node = value as Record<string, unknown>;
  visit(node);
  for (const child of Object.values((node.properties || {}) as Record<string, unknown>))
    walkSchema(child, visit);
  walkSchema(node.items, visit);
  for (const key of ["anyOf", "allOf", "oneOf"]) {
    const children = node[key];
    if (Array.isArray(children)) children.forEach((child) => walkSchema(child, visit));
  }
}

describe("Conversation Agent gateway", () => {
  it("emits a portable strict schema without fragile defaults or unions", () => {
    expect(ConversationAgentResponseJsonSchema).toMatchObject({ type: "object" });
    expect(PortableConversationAgentResponseJsonSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
    walkSchema(PortableConversationAgentResponseJsonSchema, (node) => {
      expect(node).not.toHaveProperty("default");
      expect(node).not.toHaveProperty("oneOf");
      expect(node).not.toHaveProperty("const");
      expect(node).not.toHaveProperty("minLength");
      expect(node).not.toHaveProperty("minimum");
      expect(node).not.toHaveProperty("pattern");
      if (node.properties && typeof node.properties === "object") {
        expect(node.additionalProperties).toBe(false);
        expect(node.required).toEqual(
          expect.arrayContaining(Object.keys(node.properties as Record<string, unknown>)),
        );
      }
    });
  });
  it("curates Luna malformed optionals while preserving the exact message", () => {
    const response = normalizeConversationAgentResponse(
      lunaMalformedOptionalResponse,
      "BRAINSTORM",
    );

    expect(response.message).toBe(lunaMalformedOptionalResponse.message);
    expect(response.mode).toBe("BRAINSTORM");
    expect(response.quickReplies).toEqual([]);
    expect(response.proposals).toEqual([]);
    expect(response.assumptions).toEqual([]);
    expect(response.unresolvedRisks).toEqual([]);
    expect(response.suggestedNextAction).toEqual(
      lunaMalformedOptionalResponse.suggestedNextAction,
    );
    expect(response).toEqual(ConversationAgentResponseSchema.parse(response));
  });

  it("keeps valid optional and canonical neighbors while dropping malformed entries", () => {
    const valid = {
      ...validConversation("Keep the natural message"),
      quickReplies: [{ label: "One city", value: "one_city" }, "bad"],
      proposals: [
        {
          topic: "service_area",
          statement: "Start in one city",
          reason: "Keeps operations small",
          affects: [],
        },
        "bad",
      ],
      assumptions: [
        {
          statement: "Drivers have smartphones",
          confidence: "STRONGLY_INFERRED",
          impact: "MEDIUM",
        },
        { statement: "bad", confidence: "INVALID", impact: "HIGH" },
      ],
      unresolvedRisks: [
        {
          topic: "supply",
          title: "Driver supply",
          reason: "Enough drivers may be needed",
          priority: 7,
        },
        { topic: "bad" },
      ],
      stateDelta: {
        explicitFacts: [
          { path: "roles", value: "driver", evidence: "driver" },
          { path: "roles", value: "", evidence: "missing value" },
        ],
        confirmedDecisions: [
          {
            topic: "service_area",
            decision: "one city",
            affects: [],
            evidence: "one city",
          },
          { topic: "service_area", decision: "" },
        ],
        corrections: [
          { path: "roles", value: "driver", evidence: "driver" },
          { path: "roles", value: 2, evidence: "bad" },
        ],
        resolvedQuestions: [
          { question: "Which city?", evidence: "one city" },
          { question: "", evidence: "bad" },
        ],
        resolvedAssumptions: [
          {
            statement: "Drivers have smartphones",
            resolution: "Validate during onboarding",
            evidence: "driver",
          },
          { statement: "bad", resolution: 2, evidence: "bad" },
        ],
      },
    };

    const response = normalizeConversationAgentResponse(valid, "BRAINSTORM");

    expect(response.quickReplies).toEqual([{ label: "One city", value: "one_city" }]);
    expect(response.proposals).toEqual([valid.proposals[0]]);
    expect(response.assumptions).toEqual([valid.assumptions[0]]);
    expect(response.unresolvedRisks).toEqual([valid.unresolvedRisks[0]]);
    expect(response.stateDelta.explicitFacts).toEqual([valid.stateDelta.explicitFacts[0]]);
    expect(response.stateDelta.confirmedDecisions).toEqual([
      valid.stateDelta.confirmedDecisions[0],
    ]);
    expect(response.stateDelta.corrections).toEqual([valid.stateDelta.corrections[0]]);
    expect(response.stateDelta.resolvedQuestions).toEqual([
      valid.stateDelta.resolvedQuestions[0],
    ]);
    expect(response.stateDelta.resolvedAssumptions).toEqual([
      valid.stateDelta.resolvedAssumptions[0],
    ]);
    expect(response).toEqual(ConversationAgentResponseSchema.parse(response));
  });

  it("returns a natural becak first turn from a real provider without Mock fallback", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(providerResponse(JSON.stringify(lunaMalformedOptionalResponse)));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new AiGateway(
      new OpenAICompatibleGateway("https://provider.example/v1", "test-key", "test-model"),
    );

    const response = await gateway.runConversationAgent({
      project: { rawIdea: "saya mau buat aplikasi becak online" },
      latestUserMessage: "saya mau buat aplikasi becak online",
      mode: "BRAINSTORM",
      riskContext: [],
    });

    expect(response.message).toBe(lunaMalformedOptionalResponse.message);
    expect(response.mode).toBe("BRAINSTORM");
    expect(response.stateDelta.confirmedDecisions).toEqual([]);
    expect(response.suggestedNextAction).toEqual(
      lunaMalformedOptionalResponse.suggestedNextAction,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("returns a natural finance response without a canned question contract", async () => {
    const response = await new AiGateway(new MockGatewayProvider()).runConversationAgent({
      project: {
        rawIdea: "Gua mau bikin aplikasi sederhana buat catat uang masuk keluar.",
        normalizedSummary: "Aplikasi pencatatan uang masuk keluar.",
        targetUsers: [],
        roles: [],
        entities: ["transaksi"],
        workflows: [],
        decisions: [],
        assumptions: [],
        openQuestions: [],
      },
      latestUserMessage: "Gua mau bikin aplikasi sederhana buat catat uang masuk keluar.",
      mode: "BRAINSTORM",
      riskContext: [],
    });

    expect(response.message).toMatch(/transaksi|kas|uang/i);
    expect(response.mode).toBe("BRAINSTORM");
    expect(response.quickReplies.length).toBeLessThanOrEqual(3);
  });

  it("falls back from rejected strict schema to json_object on the same provider", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () => "schema unsupported",
      })
      .mockResolvedValueOnce(providerResponse(JSON.stringify(validConversation("Luna response"))));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new AiGateway(
      new OpenAICompatibleGateway("https://provider.example/v1", "test-key", "test-model"),
    );

    await expect(
      gateway.runConversationAgent({
        project: { rawIdea: "Build a cash tracker" },
        latestUserMessage: "Build a cash tracker",
        mode: "BRAINSTORM",
        riskContext: [],
      }),
    ).resolves.toMatchObject({ message: "Luna response" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).response_format.type).toBe("json_schema");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).response_format).toEqual({ type: "json_object" });
    vi.unstubAllGlobals();
  });

  it("repairs invalid json_object output at most once without Mock fallback", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: "Unprocessable Entity",
        text: async () => "unsupported schema",
      })
      .mockResolvedValueOnce(providerResponse(JSON.stringify({ message: "keep this message" })))
      .mockResolvedValueOnce(providerResponse(JSON.stringify(validConversation("keep this message"))));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new AiGateway(
      new OpenAICompatibleGateway("https://provider.example/v1", "test-key", "test-model"),
    );

    await expect(
      gateway.runConversationAgent({
        project: { rawIdea: "Build a cash tracker" },
        latestUserMessage: "Build a cash tracker",
        mode: "BRAINSTORM",
        riskContext: [],
      }),
    ).resolves.toMatchObject({ message: "keep this message" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).response_format).toEqual({ type: "json_object" });
    vi.unstubAllGlobals();
  });

  it("does not fallback to Mock when the real provider is unrecoverable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("provider offline"));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new AiGateway(
      new OpenAICompatibleGateway("https://provider.example/v1", "test-key", "test-model"),
    );
    await expect(
      gateway.runConversationAgent({
        project: { rawIdea: "Build a cash tracker" },
        latestUserMessage: "Build a cash tracker",
        mode: "BRAINSTORM",
        riskContext: [],
      }),
    ).rejects.toThrow("provider offline");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("makes one foreground provider call for a structured normal turn", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                message: "Kita mulai dari alur inti dulu.",
                mode: "BRAINSTORM",
                quickReplies: [],
                stateDelta: {
                  explicitFacts: [],
                  confirmedDecisions: [],
                  corrections: [],
                  resolvedQuestions: [],
                  resolvedAssumptions: [],
                  },
                proposals: [],
                assumptions: [],
                unresolvedRisks: [],
                suggestedNextAction: { type: "NONE" },
              }),
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = new AiGateway(
      new OpenAICompatibleGateway(
        "https://provider.example/v1",
        "test-key",
        "test-model",
      ),
    );
    await gateway.runConversationAgent({
      project: { rawIdea: "Build a small cash tracker" },
      latestUserMessage: "Build a small cash tracker",
      mode: "BRAINSTORM",
      riskContext: [],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      response_format: { type: "json_schema" },
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("test-model");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).response_format.json_schema.schema).toEqual(
      PortableConversationAgentResponseJsonSchema,
    );
    vi.unstubAllGlobals();
  });
  it("sends the bounded recent conversation transcript in the provider payload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(providerResponse(JSON.stringify(validConversation())));
    vi.stubGlobal("fetch", fetchMock);
    const recentConversation = [
      { role: "user" as const, text: "Saya ingin mulai dari satu kota." },
      { role: "assistant" as const, text: "Baik, kita fokus pada satu kota dulu." },
      { role: "user" as const, text: "Ya, satu kota untuk MVP." },
    ];
    const gateway = new AiGateway(
      new OpenAICompatibleGateway("https://provider.example/v1", "test-key", "test-model"),
    );

    await gateway.runConversationAgent({
      project: { rawIdea: "Build a city-first delivery app" },
      latestUserMessage: "Ya, satu kota untuk MVP.",
      mode: "CLARIFICATION",
      riskContext: [],
      recentConversation,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const userPayload = JSON.parse(body.messages.find((message: { role: string }) => message.role === "user").content);
    expect(userPayload.recentConversation).toEqual(recentConversation);
    vi.unstubAllGlobals();
  });

  it("responds to domain-specific follow-up context instead of repeating the first template", async () => {
    const response = await new AiGateway(new MockGatewayProvider()).runConversationAgent({
      project: {
        rawIdea: "Gua mau bikin aplikasi buat tempat grooming dan penitipan anjing.",
        normalizedSummary: "Grooming dan penitipan anjing.",
        targetUsers: ["pemilik hewan"],
        roles: ["staf"],
        entities: ["booking", "anjing"],
        workflows: ["booking layanan"],
        decisions: [],
        assumptions: [],
        openQuestions: [],
      },
      latestUserMessage: "Pemilik hewan booking grooming atau penitipan, staf perlu lihat jadwal.",
      mode: "CLARIFICATION",
      riskContext: [],
    });

    expect(response.message).toMatch(/jadwal|staf|booking/i);
    expect(response.message).not.toContain("apakah satu booking bisa mencakup beberapa layanan");
  });

  it("progresses a becak fixture across city, driver, and draft-spec decisions", async () => {
    const gateway = new AiGateway(new MockGatewayProvider());
    const first = await gateway.runConversationAgent({
      project: { rawIdea: "saya mau buat aplikasi becak online", openQuestions: [] },
      latestUserMessage: "saya mau buat aplikasi becak online",
      mode: "BRAINSTORM",
      riskContext: [],
      draftSpecReady: false,
      importantUnresolvedCount: 1,
    });
    expect(first.message).toMatch(/becak|booking/i);
    expect(first.suggestedNextAction.type).toBe("ASK_CONTEXTUAL_QUESTION");

    const second = await gateway.runConversationAgent({
      project: {
        rawIdea: "saya mau buat aplikasi becak online",
        openQuestions: [
          "Untuk awal, layanan ini dibatasi di satu kota atau langsung lintas kota?",
        ],
      },
      latestUserMessage: "mirip gojek, tapi cuma becak di satu kota dulu",
      mode: "CLARIFICATION",
      riskContext: [],
      draftSpecReady: false,
      importantUnresolvedCount: 1,
    });
    expect(second.message).toMatch(/Gojek|satu kota/i);
    expect(second.stateDelta.confirmedDecisions[0]?.evidence).toBe("satu kota dulu");
    expect(second.suggestedNextAction.type).toBe("ASK_CONTEXTUAL_QUESTION");

    const third = await gateway.runConversationAgent({
      project: {
        rawIdea: "saya mau buat aplikasi becak online",
        openQuestions: [
          "Driver-nya berasal dari pangkalan becak terdaftar atau pendaftaran terbuka?",
        ],
      },
      latestUserMessage: "driver nya dari pangkalan becak yang sudah terdaftar",
      mode: "CLARIFICATION",
      riskContext: [],
      draftSpecReady: false,
      importantUnresolvedCount: 1,
    });
    expect(third.stateDelta.explicitFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ evidence: "driver nya" }),
        expect.objectContaining({ evidence: "pangkalan becak" }),
      ]),
    );
    expect(third.suggestedNextAction).toEqual({ type: "CREATE_SPEC" });
  });
});
