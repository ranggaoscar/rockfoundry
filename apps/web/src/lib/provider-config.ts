import "server-only";

import fs from "node:fs";
import path from "node:path";
import { providerConfigDir } from "@rockfoundry/db";
import { isPublicDemo } from "@rockfoundry/ai";

export type ProviderMode = "mock" | "openai-compatible";
export type ProviderSource = "environment" | "app-data" | "mock";

export type ProviderSettings = {
  mode: ProviderMode;
  baseUrl: string | null;
  apiKey: string | null;
  model: string | null;
  reasoningEffort?: string | null;
  source: ProviderSource;
};

type PersistedProviderSettings = Omit<ProviderSettings, "source"> & {
  version: 1;
};

const CONFIG_FILE = "provider.json";

function configPath() {
  return path.join(providerConfigDir(), CONFIG_FILE);
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function isOllamaEndpoint(baseUrl: string | null) {
  if (!baseUrl) return false;
  try {
    const { host, hostname } = new URL(baseUrl);
    return host.includes("11434") || /ollama/i.test(hostname);
  } catch {
    return false;
  }
}

export function requiresApiKey(baseUrl: string | null) {
  return !isOllamaEndpoint(baseUrl);
}

function readPersistedSettings(): PersistedProviderSettings | null {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), "utf8")) as Record<
      string,
      unknown
    >;
    if (raw.version !== 1) return null;
    if (raw.mode === "mock") {
      return {
        version: 1,
        mode: "mock",
        baseUrl: null,
        apiKey: null,
        model: null,
      };
    }
    if (raw.mode !== "openai-compatible") return null;
    const baseUrl = optionalText(raw.baseUrl);
    const apiKey = optionalText(raw.apiKey);
    if (!baseUrl || (requiresApiKey(baseUrl) && !apiKey)) return null;
    return {
      version: 1,
      mode: "openai-compatible",
      baseUrl,
      apiKey,
      model: optionalText(raw.model),
    };
  } catch {
    return null;
  }
}

function environmentSettings(
  env: NodeJS.ProcessEnv = process.env,
): ProviderSettings | null {
  if (env.AI_PROVIDER_MODE === "mock") {
    return {
      mode: "mock",
      baseUrl: null,
      apiKey: null,
      model: null,
      source: "environment",
    };
  }
  if (env.AI_PROVIDER_MODE !== "openai-compatible") return null;
  return {
    mode: "openai-compatible",
    baseUrl: optionalText(env.OPENAI_COMPATIBLE_BASE_URL),
    apiKey: optionalText(env.OPENAI_COMPATIBLE_API_KEY),
    model: optionalText(env.OPENAI_COMPATIBLE_MODEL),
    reasoningEffort: optionalText(env.OPENAI_COMPATIBLE_REASONING_EFFORT),
    source: "environment",
  };
}

export function resolveProviderSettings(
  env: NodeJS.ProcessEnv = process.env,
): ProviderSettings {
  const environment = environmentSettings(env);
  if (isPublicDemo(env)) {
    const environmentIsUsable =
      environment?.mode === "mock" ||
      Boolean(
        environment?.baseUrl &&
        (!requiresApiKey(environment.baseUrl) || environment.apiKey),
      );
    if (environment && environmentIsUsable) return environment;
    return {
      mode: "mock",
      baseUrl: null,
      apiKey: null,
      model: null,
      source: "mock",
    };
  }
  const persisted = readPersistedSettings();
  if (env.PLAYWRIGHT_PLANNER_FAILURE === "true" && persisted?.mode === "mock") {
    return { ...persisted, source: "app-data" };
  }
  if (environment) return environment;
  if (persisted) return { ...persisted, source: "app-data" };
  return {
    mode: "mock",
    baseUrl: null,
    apiKey: null,
    model: null,
    source: "mock",
  };
}

export function saveProviderSettings(input: {
  mode: ProviderMode;
  baseUrl?: string | null;
  apiKey?: string | null;
  model?: string | null;
}) {
  const baseUrl = optionalText(input.baseUrl);
  const apiKey = optionalText(input.apiKey);
  if (input.mode === "mock") {
    writeProviderSettings({
      version: 1,
      mode: "mock",
      baseUrl: null,
      apiKey: null,
      model: null,
    });
    return;
  }
  const settings: PersistedProviderSettings = {
    version: 1,
    mode: "openai-compatible",
    baseUrl,
    apiKey,
    model: optionalText(input.model),
  };
  if (
    !settings.baseUrl ||
    (requiresApiKey(settings.baseUrl) && !settings.apiKey)
  ) {
    throw new Error(
      "A base URL and API key are required unless the endpoint is Ollama.",
    );
  }
  writeProviderSettings(settings);
}

function writeProviderSettings(settings: PersistedProviderSettings) {
  fs.mkdirSync(providerConfigDir(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(configPath(), JSON.stringify(settings), {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    fs.chmodSync(configPath(), 0o600);
  } catch {
    // Windows manages file ACLs; no secret content is ever returned from this module.
  }
}

export function clearProviderSettings() {
  try {
    fs.rmSync(configPath(), { force: true });
  } catch {
    // A missing or inaccessible optional local profile must not prevent mock mode.
  }
}

export function publicProviderStatus(settings = resolveProviderSettings()) {
  const publicDemo = isPublicDemo();
  const configured =
    settings.mode === "openai-compatible" &&
    Boolean(
      settings.baseUrl &&
      (!requiresApiKey(settings.baseUrl) || settings.apiKey),
    );
  return {
    mode: settings.mode,
    label:
      settings.mode === "mock"
        ? "Offline Mock"
        : providerLabel(settings.baseUrl),
    model: configured ? settings.model || "gpt-4o-mini" : null,
    endpoint: configured && !publicDemo ? hostnameOf(settings.baseUrl) : null,
    configured,
    hasApiKey: Boolean(settings.apiKey),
    publicDemo,
    managed: publicDemo,
    missing:
      settings.mode === "openai-compatible"
        ? [
            !settings.baseUrl ? "base URL" : null,
            requiresApiKey(settings.baseUrl) && !settings.apiKey
              ? "API key"
              : null,
          ].filter((item): item is string => item !== null)
        : [],
    source: settings.source,
  };
}

function hostnameOf(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function providerLabel(baseUrl: string | null) {
  const host = hostnameOf(baseUrl);
  if (!host) return "OpenAI-compatible";
  if (/11434|ollama/i.test(host)) return "Ollama";
  if (/9router/i.test(host)) return "9Router";
  if (/openrouter/i.test(host)) return "OpenRouter";
  if (/openai\.com/i.test(host)) return "OpenAI";
  return "OpenAI-compatible";
}

export const PROVIDER_PRESETS = [
  { id: "mock", label: "Offline Mock", mode: "mock", baseUrl: "", model: "" },
  {
    id: "openai",
    label: "OpenAI",
    mode: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    mode: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
  },
  {
    id: "ollama",
    label: "Ollama",
    mode: "openai-compatible",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.2",
  },
  {
    id: "custom",
    label: "Custom compatible endpoint",
    mode: "openai-compatible",
    baseUrl: "",
    model: "",
  },
] as const;
