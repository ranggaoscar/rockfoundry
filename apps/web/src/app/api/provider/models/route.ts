export const dynamic = "force-dynamic";

import { discoverOpenAiCompatibleModels } from "@rockfoundry/ai";
import { requiresApiKey, resolveProviderSettings } from "@/lib/provider-config";

export async function GET() {
  const settings = resolveProviderSettings();
  if (
    settings.mode !== "openai-compatible" ||
    !settings.baseUrl ||
    (requiresApiKey(settings.baseUrl) && !settings.apiKey)
  ) {
    return Response.json(
      { error: "Configure an AI provider before discovering models." },
      { status: 400 },
    );
  }
  try {
    return Response.json({
      models: await discoverOpenAiCompatibleModels(
        settings.baseUrl,
        settings.apiKey || "",
      ),
    });
  } catch {
    return Response.json(
      { error: "RockFoundry couldn't discover models from this provider." },
      { status: 502 },
    );
  }
}
