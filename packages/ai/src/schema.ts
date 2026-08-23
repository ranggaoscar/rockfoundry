import { z } from "zod";

export interface InferenceRequest<T> {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  modelTier?: "cheap" | "default" | "strong";
  temperature?: number;
  /** Transport intent. JSON responses are requested with json_object mode and parsed before domain validation. */
  responseFormat?: "text" | "json";
  responseSchema?: Record<string, any>;
  taskType?: string;
  maxRetries?: number;
}

export interface InferenceResponse<T> {
  data: T;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  metadata?: {
    provider: string;
    model: string;
    latency: number;
  };
}

export interface AiGatewayProvider {
  complete<T>(req: InferenceRequest<T>): Promise<InferenceResponse<T>>;
}
