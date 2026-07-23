import { z } from "zod";

export interface InferenceRequest<T> {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  modelTier?: "cheap" | "default" | "strong";
  temperature?: number;
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
