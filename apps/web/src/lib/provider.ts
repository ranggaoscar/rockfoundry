export type ProviderStatus = {
  mode: "mock" | "openai-compatible";
  label: string;
  model: string | null;
  endpoint: string | null;
  configured: boolean;
  hasApiKey: boolean;
  publicDemo: boolean;
  managed: boolean;
  missing: string[];
  source: "environment" | "app-data" | "mock";
};

export function emptyProviderStatus(): ProviderStatus {
  return {
    mode: "mock",
    label: "Offline Mock",
    model: null,
    endpoint: null,
    configured: false,
    hasApiKey: false,
    publicDemo: false,
    managed: false,
    missing: [],
    source: "mock",
  };
}
