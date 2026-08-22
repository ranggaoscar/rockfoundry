export const dynamic = "force-dynamic";

import { z } from "zod";
import {
  clearProviderSettings,
  publicProviderStatus,
  requiresApiKey,
  resolveProviderSettings,
  saveProviderSettings,
} from "@/lib/provider-config";
import { isPublicDemo } from "@rockfoundry/ai";

const ProviderSettingsSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("mock") }),
  z.object({
    mode: z.literal("openai-compatible"),
    baseUrl: z.string().trim().url(),
    apiKey: z.string().trim().max(2000).optional(),
    model: z.string().trim().max(300).optional(),
  }),
]);

export async function GET() {
  return Response.json(publicProviderStatus());
}

function demoProviderLocked() {
  return Response.json(
    { error: "Provider settings are managed by this public demo." },
    { status: 403 },
  );
}

export async function PUT(request: Request) {
  if (isPublicDemo()) return demoProviderLocked();
  const parsed = ProviderSettingsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: "Enter a valid OpenAI-compatible base URL." },
      { status: 400 },
    );
  }
  const current = resolveProviderSettings();
  if (parsed.data.mode === "mock") {
    saveProviderSettings(parsed.data);
    return Response.json(publicProviderStatus());
  }
  const apiKey =
    parsed.data.apiKey === undefined
      ? current.source === "app-data"
        ? current.apiKey
        : null
      : parsed.data.apiKey || null;
  if (
    parsed.data.mode === "openai-compatible" &&
    requiresApiKey(parsed.data.baseUrl) &&
    !apiKey
  ) {
    return Response.json(
      { error: "An API key is required to save this provider." },
      { status: 400 },
    );
  }
  saveProviderSettings({ ...parsed.data, apiKey });
  return Response.json(publicProviderStatus());
}

export async function DELETE() {
  if (isPublicDemo()) return demoProviderLocked();
  clearProviderSettings();
  return Response.json(publicProviderStatus());
}
