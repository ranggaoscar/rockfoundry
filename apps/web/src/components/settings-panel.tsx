"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import {
  emptyProviderStatus,
  PROVIDER_ENV_EXAMPLE,
  type ProviderStatus,
} from "@/lib/provider";

export function useProviderStatus() {
  const [status, setStatus] = useState<ProviderStatus>(emptyProviderStatus());

  useEffect(() => {
    let active = true;
    fetch("/api/provider")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && data) setStatus(data as ProviderStatus);
      })
      .catch(() => {
        /* status is best-effort */
      });
    return () => {
      active = false;
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
  const [copied, setCopied] = useState(false);
  const status = useProviderStatus();

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function copyExample() {
    try {
      await navigator.clipboard.writeText(PROVIDER_ENV_EXAMPLE);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
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
                Configure an AI provider to enable model-assisted capabilities
                where supported.
              </p>
            )}
            {status.missing.length > 0 && (
              <p className="mt-2 text-[13px] text-destructive" role="alert">
                Missing {status.missing.join(", ")}.
              </p>
            )}
          </div>
          <p className="text-[13px] leading-6 text-muted-foreground">
            Provider keys stay on this machine. They are not stored in project
            state and are not included in exports. When a remote provider is
            used, prompts leave the machine.
          </p>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="font-mono text-[12px] text-muted-foreground">
                .env.local
              </div>
              <button
                type="button"
                className="rf-revise-button"
                onClick={() => void copyExample()}
              >
                {copied ? (
                  <>
                    <Check className="size-3" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-3" /> Copy
                  </>
                )}
              </button>
            </div>
            <pre className="rf-code-block">
              <code>{PROVIDER_ENV_EXAMPLE}</code>
            </pre>
          </div>
          <p className="text-[13px] leading-6 text-muted-foreground">
            Restart RockFoundry after changing{" "}
            <span className="font-mono text-foreground">.env.local</span>.
          </p>
        </div>
      </aside>
    </div>
  );
}
