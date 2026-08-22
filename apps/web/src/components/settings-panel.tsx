"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Check, RefreshCw, Trash2, X } from "lucide-react";
import { emptyProviderStatus, type ProviderStatus } from "@/lib/provider";

type ProviderPreset = {
  id: string;
  label: string;
  mode: "mock" | "openai-compatible";
  baseUrl: string;
  model: string;
};

export function useProviderStatus() {
  const [status, setStatus] = useState<ProviderStatus>(emptyProviderStatus());

  useEffect(() => {
    let active = true;
    const refresh = () => {
      fetch("/api/provider")
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (active && data) setStatus(data as ProviderStatus);
        })
        .catch(() => undefined);
    };
    refresh();
    window.addEventListener("rockfoundry-provider-change", refresh);
    return () => {
      active = false;
      window.removeEventListener("rockfoundry-provider-change", refresh);
    };
  }, []);

  return status;
}

export function SettingsPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [preset, setPreset] = useState("openai");
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<"save" | "test" | "models" | null>(null);
  const [message, setMessage] = useState("");
  const status = useProviderStatus();
  const offlineMock = preset === "mock";
  const ollama = /(^|[/:.])ollama|11434/i.test(baseUrl);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    fetch("/api/provider/presets")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && data?.presets)
          setPresets(data.presets as ProviderPreset[]);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [open]);

  function applyPreset(id: string) {
    const selected = presets.find((item) => item.id === id);
    setPreset(id);
    if (selected) {
      setBaseUrl(selected.baseUrl);
      setModel(selected.model);
      setApiKey("");
    }
  }

  async function saveProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("save");
    setMessage("");
    try {
      const response = await fetch("/api/provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          offlineMock
            ? { mode: "mock" }
            : { mode: "openai-compatible", baseUrl, apiKey, model },
        ),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error);
      setApiKey("");
      setMessage(
        offlineMock
          ? "Offline Mock is now the saved provider."
          : "Saved locally. New requests use this provider immediately.",
      );
      window.dispatchEvent(new Event("rockfoundry-provider-change"));
    } catch {
      setMessage(
        "RockFoundry couldn't save this provider. Check the required fields.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function testProvider() {
    if (offlineMock) {
      setMessage("Offline Mock does not need a connection test.");
      return;
    }
    setBusy("test");
    setMessage("");
    try {
      const response = await fetch("/api/provider/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey: apiKey || undefined }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error();
      setMessage(
        `Connection verified${data.modelCount ? ` · ${data.modelCount} models available` : ""}.`,
      );
    } catch {
      setMessage(
        "RockFoundry couldn't reach this provider. Check the URL and API key.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function discoverModels() {
    if (offlineMock) {
      setMessage("Offline Mock has no remote models to discover.");
      return;
    }
    setBusy("models");
    setMessage("");
    try {
      if (apiKey) {
        setMessage("Save the key locally before discovering models.");
        return;
      }
      const response = await fetch("/api/provider/models");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error();
      setModels(data.models || []);
      setMessage(
        data.models?.length
          ? "Available models loaded."
          : "The provider returned no selectable models.",
      );
    } catch {
      setMessage("RockFoundry couldn't discover models from this provider.");
    } finally {
      setBusy(null);
    }
  }

  async function clearProvider() {
    setBusy("save");
    setMessage("");
    try {
      const response = await fetch("/api/provider", { method: "DELETE" });
      if (!response.ok) throw new Error();
      setPreset("mock");
      setBaseUrl("");
      setApiKey("");
      setModel("");
      setMessage(
        "Saved local provider settings cleared. Environment variables, if set, still manage the active provider.",
      );
      window.dispatchEvent(new Event("rockfoundry-provider-change"));
    } catch {
      setMessage("RockFoundry couldn't clear the saved provider settings.");
    } finally {
      setBusy(null);
    }
  }

  if (!open) return null;

  if (status.publicDemo) {
    return (
      <div className="rf-drawer-backdrop" role="presentation" onClick={onClose}>
        <aside
          className="rf-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between border-b border-border px-5 py-4">
            <div>
              <h2 id="settings-title" className="text-[15px] font-semibold">
                AI provider
              </h2>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Managed by demo host
              </p>
            </div>
            <button
              ref={closeRef}
              className="rf-icon-button"
              type="button"
              aria-label="Close settings"
              onClick={onClose}
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="space-y-5 overflow-y-auto px-5 py-5 text-[14px] leading-6">
            <div className="rounded-[10px] border border-border bg-surface px-3 py-3">
              <div className="text-[11px] font-medium tracking-[0.04em] text-muted-foreground">
                Status
              </div>
              <div className="mt-1 text-[15px] font-medium">
                {status.configured ? "Managed provider" : "Offline fallback"}
              </div>
              <dl className="mt-3 space-y-2 text-[13px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Provider</dt>
                  <dd>{status.label}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Model</dt>
                  <dd className="font-mono text-right">
                    {status.model || "Offline Mock"}
                  </dd>
                </div>
              </dl>
            </div>
            <p className="text-[13px] leading-6 text-muted-foreground">
              This shared demo uses a provider configured by the demo host. Run
              RockFoundry locally to connect your own OpenAI, OpenRouter,
              Ollama, or other compatible provider.
            </p>
          </div>
        </aside>
      </div>
    );
  }

  return (
    <div className="rf-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="rf-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 id="settings-title" className="text-[15px] font-semibold">
              AI provider
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Current mode: {status.label}
            </p>
          </div>
          <button
            ref={closeRef}
            className="rf-icon-button"
            type="button"
            aria-label="Close settings"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-5 overflow-y-auto px-5 py-5 text-[14px] leading-6">
          <div className="rounded-[10px] border border-border bg-surface px-3 py-3">
            <div className="text-[11px] font-medium tracking-[0.04em] text-muted-foreground">
              Runtime
            </div>
            <div className="mt-1 text-[15px] font-medium">{status.label}</div>
            {status.model ? (
              <div className="mt-1 font-mono text-[12px] text-muted-foreground">
                {status.model}
                {status.endpoint ? ` · ${status.endpoint}` : ""}
              </div>
            ) : (
              <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
                RockFoundry currently uses deterministic offline discovery.
              </p>
            )}
            <p className="mt-1 text-[12px] text-muted-foreground">
              {status.source === "environment"
                ? "Managed by environment variables"
                : status.source === "app-data"
                  ? "Managed by local app data"
                  : "No provider configuration saved"}
            </p>
            {status.missing.length > 0 ? (
              <p className="mt-2 text-[13px] text-destructive" role="alert">
                Missing {status.missing.join(", ")}.
              </p>
            ) : null}
          </div>
          <p className="text-[13px] leading-6 text-muted-foreground">
            {status.source === "environment"
              ? "This runtime is managed by AI_PROVIDER_MODE and OPENAI_COMPATIBLE_* environment variables. Saved local settings stay inactive until those variables are removed."
              : "Keys are saved only in this machine's application data. They never enter project state, exports, or this status response. Environment variables take precedence over these settings."}
          </p>
          <form
            className="space-y-4"
            onSubmit={(event) => void saveProvider(event)}
          >
            <label className="rf-field">
              Preset
              <select
                name="providerPreset"
                value={preset}
                onChange={(event) => applyPreset(event.target.value)}
              >
                {presets.length ? (
                  presets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))
                ) : (
                  <option value="openai">OpenAI</option>
                )}
              </select>
            </label>
            {!offlineMock ? (
              <>
                <label className="rf-field">
                  Base URL
                  <input
                    name="baseUrl"
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    inputMode="url"
                    required
                  />
                </label>
                <label className="rf-field">
                  API key {ollama ? "(optional for Ollama)" : ""}
                  <input
                    name="apiKey"
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    autoComplete="off"
                    placeholder={
                      ollama
                        ? "Optional"
                        : status.configured
                          ? "Saved locally — enter a replacement to update"
                          : "Required"
                    }
                    required={!ollama && !status.configured}
                  />
                </label>
                <label className="rf-field">
                  Model
                  <input
                    name="model"
                    list="provider-models"
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    placeholder="gpt-4o-mini"
                  />
                  <datalist id="provider-models">
                    {models.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                </label>
              </>
            ) : (
              <p className="text-[13px] leading-6 text-muted-foreground">
                Offline Mock uses deterministic local discovery and needs no key
                or network connection.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                className="rf-primary-button"
                type="submit"
                disabled={busy !== null}
              >
                {busy === "save" ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}{" "}
                {offlineMock ? "Use Offline Mock" : "Save provider"}
              </button>
              {!offlineMock ? (
                <>
                  <button
                    className="rf-secondary-button"
                    type="button"
                    onClick={() => void testProvider()}
                    disabled={busy !== null}
                  >
                    {busy === "test" ? "Testing…" : "Test connection"}
                  </button>
                  <button
                    className="rf-secondary-button"
                    type="button"
                    onClick={() => void discoverModels()}
                    disabled={busy !== null}
                  >
                    {busy === "models" ? "Loading…" : "Discover models"}
                  </button>
                </>
              ) : null}
              <button
                className="rf-secondary-button"
                type="button"
                onClick={() => void clearProvider()}
                disabled={busy !== null || status.source !== "app-data"}
              >
                <Trash2 className="size-4" /> Clear saved provider
              </button>
            </div>
          </form>
          {message ? (
            <p
              className="text-[13px] leading-5 text-muted-foreground"
              role="status"
            >
              {message}
            </p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
