export type ProviderStatus = {
  mode: "mock" | "openai-compatible";
  label: string;
  model: string | null;
  endpoint: string | null;
  configured: boolean;
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
    missing: [],
    source: "mock",
  };
}
