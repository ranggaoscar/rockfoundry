"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Screen = {
  id: string;
  name: string;
  actorIds: string[];
  purpose: string;
  route: string;
  status: string;
  source: string;
};

type Studio = {
  status: string;
  readiness: {
    level: string;
    score: number;
    blockers: string[];
    unresolved: string[];
  };
  screenMap: Screen[];
  currentVersion: number;
  approvedVersion: number | null;
  stale: boolean;
  staleScreens: string[];
  revisions: Array<{ version: number; summary: string }>;
  assumptions: string[];
  debt: { count: number };
};

type PackageDesign = {
  screenMap: Screen[];
  designSpec: Record<string, unknown> | null;
  summary: string;
};

type DesignJob = {
  id: string;
  status: string;
  stage: string;
  stageLabel: string;
  progress: Record<string, unknown>;
  errorSummary?: string | null;
};

const VIEWPORTS = {
  Desktop: 1440,
  Tablet: 768,
  Mobile: 390,
} as const;

export function DesignStudio({
  projectId,
  studio,
  packageReady = false,
  packageDesign,
  language = "en",
  onState,
  onDownloadHandoff,
}: {
  projectId: string;
  studio?: Studio;
  packageReady?: boolean;
  packageDesign?: PackageDesign | null;
  language?: "id" | "en";
  onState: (state: unknown, version: number) => void;
  onDownloadHandoff: () => void;
}) {
  const [stage, setStage] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [viewport, setViewport] = useState<keyof typeof VIEWPORTS>("Desktop");
  const [composer, setComposer] = useState("");
  const [impactNote, setImpactNote] = useState("");
  const [remotePackageDesign, setRemotePackageDesign] = useState<PackageDesign | null>(null);
  const [designJob, setDesignJob] = useState<DesignJob | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [remoteReadiness, setRemoteReadiness] = useState<Studio["readiness"]>();
  const readiness = remoteReadiness || studio?.readiness;
  const previewUrl = `/api/projects/${projectId}/design/preview?v=${studio?.currentVersion || 0}`;
  const baseline = remotePackageDesign || packageDesign || null;
  const hasDesign = Boolean(studio && studio.currentVersion > 0);
  const effectivePackageReady = packageReady || Boolean(baseline) || hasDesign;
  const designBusy = working || ["QUEUED", "RUNNING"].includes(designJob?.status || "");

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/projects/${projectId}/design`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        if (data.readiness) setRemoteReadiness(data.readiness);
        if (data.packageDesign) setRemotePackageDesign(data.packageDesign);
        if (data.designJob) setDesignJob(data.designJob);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!designJob || !["QUEUED", "RUNNING"].includes(designJob.status)) return;
    const poll = window.setInterval(async () => {
      const response = await fetch(`/api/projects/${projectId}/design/generate`);
      if (!response.ok) return;
      const data = await response.json();
      if (!data.job) return;
      setDesignJob(data.job);
      if (["COMPLETED", "FAILED"].includes(data.job.status)) {
        setStage("");
        const snapshot = await fetch(`/api/projects/${projectId}/design`);
        if (!snapshot.ok) return;
        const next = await snapshot.json();
        if (next.packageDesign) setRemotePackageDesign(next.packageDesign);
        if (next.state && typeof next.version === "number") onState(next.state, next.version);
        if (data.job.status === "FAILED") setError(data.job.errorSummary || (language === "id" ? "Prototype belum berhasil dibuat." : "Prototype could not be created yet."));
      }
    }, 1000);
    return () => window.clearInterval(poll);
  }, [designJob, language, onState, projectId]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type !== "rf-select") return;
      if (typeof event.data.componentId !== "string") return;
      setSelected(event.data.componentId);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function generate() {
    setWorking(true);
    setError("");
    setStage(language === "id" ? "Menyiapkan prototype dengan AI..." : "Preparing AI prototype...");
    try {
      const response = await fetch(
        `/api/projects/${projectId}/design/generate`,
        {
          method: "POST",
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not generate design.");
      setDesignJob(data.job);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Generate failed.");
    } finally {
      setWorking(false);
    }
  }

  async function send(text: string) {
    if (!text.trim() || working) return;
    setWorking(true);
    setError("");
    setImpactNote("");
    try {
      if (/cari|referensi|research/i.test(text)) {
        const response = await fetch(
          `/api/projects/${projectId}/design/research`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: text }),
          },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Research failed.");
        setImpactNote(
          "Reference research stored as untrusted RESEARCH evidence. It did not auto-change the design.",
        );
        return;
      }
      const response = await fetch(`/api/projects/${projectId}/design/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Revision failed.");
      if (data.impact === "POTENTIAL_PRODUCT_DECISION") {
        setImpactNote(
          data.message ||
            "This is a product decision, not a visual tweak. Confirm it in Discover first.",
        );
        return;
      }
      onState(data.state, data.version);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Revision failed.");
    } finally {
      setWorking(false);
      setComposer("");
    }
  }

  async function approve() {
    setWorking(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/design/approve`,
        {
          method: "POST",
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Approve failed.");
      onState(data.state, data.version);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Approve failed.");
    } finally {
      setWorking(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(composer);
  }

  const grouped = useMemo(() => {
    const groups = new Map<string, Screen[]>();
    for (const screen of baseline?.screenMap || studio?.screenMap || []) {
      const key = screen.actorIds[0] || "product";
      groups.set(key, [...(groups.get(key) || []), screen]);
    }
    return [...groups.entries()];
  }, [baseline?.screenMap, studio?.screenMap]);

  const effectiveScreens = baseline?.screenMap || studio?.screenMap || [];
  const prototypeFailed = designJob?.status === "FAILED";
  const prototypeActionLabel = prototypeFailed
    ? language === "id"
      ? "Coba lagi membuat prototype"
      : "Retry prototype"
    : language === "id"
      ? "Buat prototype dengan AI"
      : "Generate Prototype with AI";

  return (
    <div className="rf-studio">
      <aside className="rf-studio-screens">
        <p className="rf-studio-kicker">Screen Map</p>
        {grouped.length === 0 && (
          <p className="text-[13px] text-muted-foreground">
            {language === "id"
              ? "Screen Map muncul dari Product Truth."
              : "Screen Map is derived from Product Truth."}
          </p>
        )}
        {grouped.map(([actor, screens]) => (
          <div key={actor}>
            <p className="rf-studio-actor">{actor.replaceAll("_", " ")}</p>
            {screens.map((screen) => (
              <a
                key={screen.id}
                className="rf-studio-screen"
                href={previewUrl + screen.route}
                target="rf-preview"
              >
                <span>{screen.name}</span>
                <span className="rf-studio-source">{screen.source}</span>
              </a>
            ))}
          </div>
        ))}
      </aside>

      <section className="rf-studio-preview">
        <div className="rf-studio-toolbar">
          {(Object.keys(VIEWPORTS) as Array<keyof typeof VIEWPORTS>).map(
            (name) => (
              <button
                key={name}
                type="button"
                className={viewport === name ? "is-active" : ""}
                onClick={() => setViewport(name)}
              >
                {name}
              </button>
            ),
          )}
          <span className="rf-studio-meta">
            {studio?.currentVersion
              ? `v${studio.currentVersion} · ${studio.status}`
              : baseline
                ? language === "id"
                  ? "Baseline · READY"
                  : "Baseline · READY"
                : language === "id"
                  ? "Belum ada paket"
                  : "No package yet"}
          </span>
        </div>
        {!hasDesign ? (
          <div className="rf-studio-empty">
            <p className="rf-studio-kicker">
              {baseline ? "Baseline DesignSpec" : "Design Readiness"}
            </p>
            {baseline ? (
              <p className="text-sm leading-6 text-muted-foreground">
                {baseline.summary}
              </p>
            ) : (
              <p className="rf-studio-score">
                {readiness?.score ?? 0}% · {readiness?.level || "BLOCKED"}
              </p>
            )}
            <p>
              {effectiveScreens.length > 0
                ? `${effectiveScreens.length} ${language === "id" ? "layar terpetakan" : "screens mapped"}`
                : language === "id"
                  ? "Screen Map belum tersedia"
                  : "Screen Map is not available yet"}
            </p>
            {prototypeFailed && (
              <p className="rf-studio-note">
                {language === "id"
                  ? "Prototype belum berhasil dibuat."
                  : "Prototype could not be created yet."}
              </p>
            )}
            {(readiness?.unresolved.length || 0) > 0 && !baseline && (
              <p>
                Prototype can use {readiness?.unresolved.length} unresolved
                assumptions.
              </p>
            )}
            <button
              type="button"
              className="rf-studio-primary"
              disabled={!effectivePackageReady || designBusy}
              onClick={() => void generate()}
            >
              {prototypeActionLabel}
            </button>
            <p className="text-xs leading-5 text-muted-foreground">
              {language === "id"
                ? "Opsional — buat referensi visual interaktif berdasarkan Product Truth dan Screen Map."
                : "Optional — create an interactive visual reference based on Product Truth and the Screen Map."}
            </p>
            {designJob && ["QUEUED", "RUNNING"].includes(designJob.status) && (
              <p role="status">{designJob.stageLabel}</p>
            )}
            {!effectivePackageReady && (
              <p className="text-xs text-muted-foreground">
                {language === "id"
                  ? "Buat Product Package dulu sebelum prototype."
                  : "Build the Product Package before creating a prototype."}
              </p>
            )}
            {stage && <p>{stage}</p>}
          </div>
        ) : (
          <div className="rf-studio-frame-wrap">
            <iframe
              ref={iframeRef}
              name="rf-preview"
              title="Product prototype"
              src={previewUrl}
              sandbox="allow-scripts"
              style={{ width: VIEWPORTS[viewport], maxWidth: "100%" }}
            />
          </div>
        )}
      </section>

      <aside className="rf-studio-agent">
        <p className="rf-studio-kicker">Design Agent</p>
        {selected && <p>Selected: {selected}</p>}
        {studio?.stale && (
          <p>Design needs review. Affected: {studio.staleScreens.join(", ")}</p>
        )}
        {studio?.debt.count ? (
          <p>Design Debt {studio.debt.count} unresolved design decisions</p>
        ) : null}
        <ol className="rf-studio-versions">
          {studio?.revisions.map((revision) => (
            <li key={revision.version}>
              v{revision.version} {revision.summary}
            </li>
          ))}
        </ol>
        {impactNote && <p className="rf-studio-note">{impactNote}</p>}
        {error && <p className="rf-studio-note">{error}</p>}
        <form onSubmit={submit}>
          <label className="sr-only" htmlFor="design-composer">
            Design revision
          </label>
          <textarea
            id="design-composer"
            value={composer}
            onChange={(event) => setComposer(event.target.value)}
            placeholder="Revise the design or ask for references..."
          />
          <div className="rf-studio-actions">
            <button type="submit" disabled={designBusy || !hasDesign}>
              Send
            </button>
            <button
              type="button"
              disabled={designBusy || !hasDesign}
              onClick={() => void approve()}
            >
              Approve Design
            </button>
            {effectivePackageReady && (
              <button type="button" onClick={onDownloadHandoff}>
                Download Handoff
              </button>
            )}
          </div>
        </form>
      </aside>
    </div>
  );
}
