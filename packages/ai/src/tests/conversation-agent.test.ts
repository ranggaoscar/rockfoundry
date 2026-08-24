import { describe, expect, it, vi } from "vitest";
import { AiGateway, MockGatewayProvider } from "../index";
import { OpenAICompatibleGateway } from "../gateway";

describe("Conversation Agent gateway", () => {
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
});
