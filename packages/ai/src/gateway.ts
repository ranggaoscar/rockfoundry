import { z } from "zod";
import {
  AiGatewayProvider,
  InferenceRequest,
  InferenceResponse,
} from "./schema";
import { TASK_TIMEOUT, TASK_MAX_RETRIES } from "./prompts";
import {
  classifyDesignFailure,
  formatDesignFailureDiagnostics,
} from "./failure";

/** Keep OpenAI-compatible roots canonical so callers can safely supply either
 * `https://host` or `https://host/v1` without producing `/v1/v1/...`. */
export function normalizeOpenAiCompatibleBaseUrl(baseUrl: string) {
  const parsed = new URL(baseUrl.trim());
  parsed.pathname = `${parsed.pathname.replace(/\/+$/, "").replace(/(?:\/v1)+$/, "")}/v1`;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

export function openAiCompatibleUrl(baseUrl: string, path: string) {
  return `${normalizeOpenAiCompatibleBaseUrl(baseUrl)}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function discoverOpenAiCompatibleModels(
  baseUrl: string,
  apiKey: string,
) {
  const response = await fetch(openAiCompatibleUrl(baseUrl, "/models"), {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
  });
  if (!response.ok) {
    throw new ApiError(
      `Provider model discovery failed: ${response.status} ${response.statusText}`,
      response.status,
    );
  }
  const data = (await response.json()) as { data?: Array<{ id?: unknown }> };
  return (data.data || [])
    .map((model) => (typeof model.id === "string" ? model.id : null))
    .filter((model): model is string => Boolean(model))
    .sort((left, right) => left.localeCompare(right));
}

export async function testOpenAiCompatibleConnection(
  baseUrl: string,
  apiKey: string,
) {
  const models = await discoverOpenAiCompatibleModels(baseUrl, apiKey);
  return { models };
}

export class NineRouterGateway implements AiGatewayProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly models: { default: string; cheap: string; strong: string },
    private readonly reasoningEffort?: string,
    private readonly providerName = "9router",
  ) {}

  get diagnostics() {
    return { provider: this.providerName, model: this.models.default } as const;
  }

  async complete<T>(req: InferenceRequest<T>): Promise<InferenceResponse<T>> {
    const taskType = req.taskType || "initial_idea_extraction";
    const timeout = TASK_TIMEOUT[taskType] || 60000;
    const maxRetries = req.maxRetries ?? TASK_MAX_RETRIES[taskType] ?? 2;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.attemptRequest(req, timeout);
      } catch (error) {
        lastError = error as Error;
        const diagnostic = this.safeDiagnostic(req, "provider_request");

        // Don't retry if it's a schema validation error (bad request from us)
        if (error instanceof z.ZodError) {
          throw error;
        }

        // Don't retry if it's a 4xx error (client error)
        if (
          error instanceof ApiError &&
          error.statusCode >= 400 &&
          error.statusCode < 500
        ) {
          console.warn(
            `${diagnostic} status=${error.statusCode} error=provider_request_rejected`,
          );
          throw error;
        }

        if (attempt < maxRetries) {
          const backoff = Math.min(1000 * Math.pow(2, attempt), 10000);
          const diagnostics = classifyDesignFailure(error, {
            task: taskType,
            attempt: attempt + 1,
            maxAttempts: maxRetries + 1,
            retryInMs: backoff,
          });
          console.warn(
            `${diagnostic} ${formatDesignFailureDiagnostics(diagnostics)}`,
          );
          await new Promise((resolve) => setTimeout(resolve, backoff));
        }
      }
    }

    throw lastError || new Error("AI request failed after all retries");
  }

  private safeDiagnostic(req: InferenceRequest<unknown>, stage: string) {
    const defaults = this.diagnostics;
    const provider = req.providerDiagnostics?.provider || defaults.provider;
    const model = req.providerDiagnostics?.model || defaults.model;
    return `task=${req.taskType || "unknown"} provider=${provider}${model ? ` model=${model}` : ""} stage=${stage}`;
  }

  private async attemptRequest<T>(
    req: InferenceRequest<T>,
    timeout: number,
  ): Promise<InferenceResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const startTime = Date.now();
    let model = this.models.default;
    if (req.modelTier === "cheap") model = this.models.cheap;
    if (req.modelTier === "strong") model = this.models.strong;

    try {
      const response = await fetch(
        openAiCompatibleUrl(this.baseUrl, "/chat/completions"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            messages: req.messages,
            temperature: req.temperature ?? 0.7,
            ...(req.reasoningEffort || this.reasoningEffort
              ? {
                  reasoning_effort: req.reasoningEffort || this.reasoningEffort,
                }
              : {}),
            response_format: req.responseSchema
              ? {
                  type: "json_schema",
                  json_schema: {
                    name: "output",
                    schema: req.responseSchema,
                    strict: true,
                  },
                }
              : req.responseFormat === "json"
                ? { type: "json_object" }
                : undefined,
          }),
          signal: controller.signal,
        },
      );

      const latency = Date.now() - startTime;

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new ApiError(
          `9Router API error: ${response.status} ${response.statusText}`,
          response.status,
          errorBody,
        );
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("No content returned from AI provider");
      }

      let parsed: T;
      if (req.responseFormat === "json" || req.responseSchema) {
        try {
          parsed = JSON.parse(content) as T;
        } catch {
          throw new Error("Failed to parse JSON response from AI provider");
        }
      } else {
        parsed = content as unknown as T;
      }

      return {
        data: parsed,
        usage: {
          promptTokens: data.usage?.prompt_tokens,
          completionTokens: data.usage?.completion_tokens,
          totalTokens: data.usage?.total_tokens,
        },
        metadata: {
          provider: this.providerName,
          model,
          latency,
        },
      };
    } catch (error: unknown) {
      if (error instanceof ApiError) throw error;
      if (error instanceof z.ZodError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        const timeoutError = new Error(`AI request timed out after ${timeout}ms`);
        timeoutError.name = "TimeoutError";
        Object.assign(timeoutError, { timeoutMs: timeout });
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export class OpenAICompatibleGateway extends NineRouterGateway {
  constructor(
    baseUrl: string,
    apiKey: string,
    model: string,
    reasoningEffort?: string,
  ) {
    super(
      baseUrl,
      apiKey,
      { default: model, cheap: model, strong: model },
      reasoningEffort,
      "openai-compatible",
    );
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
