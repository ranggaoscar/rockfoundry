export const dynamic = "force-dynamic";

import { z } from "zod";
import { isPublicDemo, testOpenAiCompatibleConnection } from "@rockfoundry/ai";
import { requiresApiKey, resolveProviderSettings } from "@/lib/provider-config";

const TestProviderSchema = z.object({
  baseUrl: z.string().trim().url().optional(),
  apiKey: z.string().trim().min(1).max(2000).optional(),
});

export async function POST(request: Request) {
  if (isPublicDemo()) {
    return Response.json(
      { error: "Provider settings are managed by this public demo." },
      { status: 403 },
    );
  }
  const parsed = TestProviderSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success)
    return Response.json(
      { error: "Provider details are invalid." },
      { status: 400 },
    );
  const current = resolveProviderSettings();
  const baseUrl = parsed.data.baseUrl || current.baseUrl;
  const apiKey = parsed.data.apiKey || current.apiKey;
  if (!baseUrl || (requiresApiKey(baseUrl) && !apiKey))
    return Response.json(
      { error: "A base URL and API key are required." },
      { status: 400 },
    );
  try {
    const { models } = await testOpenAiCompatibleConnection(
      baseUrl,
      apiKey || "",
    );
    return Response.json({ ok: true, modelCount: models.length });
  } catch {
    return Response.json(
      { ok: false, error: "RockFoundry couldn't reach this provider." },
      { status: 502 },
    );
  }
}
