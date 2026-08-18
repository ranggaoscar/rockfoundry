export const dynamic = "force-dynamic";

import { shouldUseMockAi } from "@rockfoundry/ai";

function hostnameOf(value?: string) {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function providerLabel(
  mode: "mock" | "openai-compatible",
  host: string | null,
) {
  if (mode === "mock") return "Mock";
  if (!host) return "OpenAI-compatible";
  if (/11434|ollama/i.test(host)) return "Ollama";
  if (/9router/i.test(host)) return "9Router";
  if (/openrouter/i.test(host)) return "OpenRouter";
  if (/openai\.com/i.test(host)) return "OpenAI";
  return "OpenAI-compatible";
}

export async function GET() {
  const mock = shouldUseMockAi();
  const mode = mock ? "mock" : "openai-compatible";
  const host = hostnameOf(process.env.OPENAI_COMPATIBLE_BASE_URL);
  const missing: string[] = [];
  if (process.env.AI_PROVIDER_MODE === "openai-compatible") {
    if (!process.env.OPENAI_COMPATIBLE_API_KEY)
      missing.push("OPENAI_COMPATIBLE_API_KEY");
    if (!process.env.OPENAI_COMPATIBLE_BASE_URL)
      missing.push("OPENAI_COMPATIBLE_BASE_URL");
  }
  return Response.json({
    mode,
    label: providerLabel(mode, host),
    model: mock ? null : process.env.OPENAI_COMPATIBLE_MODEL || "gpt-4o-mini",
    endpoint: mock ? null : host,
    configured: !mock,
    missing,
    source: "environment",
  });
}
