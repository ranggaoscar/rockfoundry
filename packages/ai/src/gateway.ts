import { z } from "zod";
import { AiGatewayProvider, InferenceRequest, InferenceResponse } from "./schema";

export class NineRouterGateway implements AiGatewayProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly models: { default: string; cheap: string; strong: string }
  ) {}

  async complete<T>(req: InferenceRequest<T>): Promise<InferenceResponse<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const startTime = Date.now();
    let model = this.models.default;
    if (req.modelTier === "cheap") model = this.models.cheap;
    if (req.modelTier === "strong") model = this.models.strong;

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: req.messages,
          temperature: req.temperature ?? 0.7,
          response_format: req.responseSchema ? {
            type: "json_schema",
            json_schema: {
              name: "output",
              schema: req.responseSchema,
              strict: true
            }
          } : undefined
        }),
        signal: controller.signal
      });

      const latency = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`9Router API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error("No content returned from AI provider");
      }

      let parsed: T;
      if (req.responseSchema) {
        try {
          parsed = JSON.parse(content);
        } catch (e) {
          throw new Error("Failed to parse JSON response");
        }
      } else {
        parsed = content as unknown as T;
      }

      return {
        data: parsed,
        usage: {
          promptTokens: data.usage?.prompt_tokens,
          completionTokens: data.usage?.completion_tokens,
          totalTokens: data.usage?.total_tokens
        },
        metadata: {
          provider: "9router",
          model,
          latency
        }
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
