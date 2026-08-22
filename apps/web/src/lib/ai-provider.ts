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
    return new AiGateway(
      new OpenAICompatibleGateway(
        settings.baseUrl,
        settings.apiKey || "",
        settings.model || "gpt-4o-mini",
      ),
    );
  }
  return new AiGateway(new MockGatewayProvider());
}
