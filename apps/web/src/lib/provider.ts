export type ProviderStatus = {
  mode: "mock" | "openai-compatible";
  label: string;
  model: string | null;
  endpoint: string | null;
  configured: boolean;
  missing: string[];
  source: "environment";
};

export const PROVIDER_ENV_EXAMPLE = `AI_PROVIDER_MODE=openai-compatible
OPENAI_COMPATIBLE_BASE_URL=https://api.openai.com/v1
OPENAI_COMPATIBLE_API_KEY=your-key
OPENAI_COMPATIBLE_MODEL=gpt-4o-mini`;

export function emptyProviderStatus(): ProviderStatus {
  return {
    mode: "mock",
    label: "Mock",
    model: null,
    endpoint: null,
    configured: false,
    missing: [],
    source: "environment",
  };
}
