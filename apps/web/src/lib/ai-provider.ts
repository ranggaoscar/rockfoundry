import {
  AiGateway,
  MockGatewayProvider,
  OpenAICompatibleGateway,
} from "@rockfoundry/ai";
import { requiresApiKey, resolveProviderSettings } from "./provider-config";

export function getAiGateway() {
  const settings = resolveProviderSettings();
  if (settings.mode === "openai-compatible") {
    if (
      !settings.baseUrl ||
      (requiresApiKey(settings.baseUrl) && !settings.apiKey)
    ) {
      throw new Error(
        "The configured AI provider needs a base URL and API key.",
      );
    }
    const defaultModel = settings.model || "gpt-4o-mini";
    return new AiGateway(
      new OpenAICompatibleGateway(
        settings.baseUrl,
        settings.apiKey || "",
        {
          default: process.env.OPENAI_COMPATIBLE_DEFAULT_MODEL || defaultModel,
          cheap: process.env.OPENAI_COMPATIBLE_CHEAP_MODEL || defaultModel,
          strong: process.env.OPENAI_COMPATIBLE_STRONG_MODEL || defaultModel,
        },
        settings.reasoningEffort || undefined,
      ),
    );
  }
  return new AiGateway(new MockGatewayProvider());
}
