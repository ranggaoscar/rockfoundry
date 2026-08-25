"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

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

const DESIGN_PROGRESS = [
  ["DESIGN_ARCHITECTURE", "Structuring screens", "Menyusun layar"],
  ["PROTOTYPE_GENERATION", "Building prototype", "Membangun prototype"],
  ["QUALITY_REVIEW", "Reviewing result", "Meninjau hasil"],
] as const;

export function designGenerationReady(input: {
  packageReady: boolean;
  draftSpecReady: boolean;
  packageDesignReady?: boolean;
}) {
  return (
    input.packageReady ||
    input.draftSpecReady ||
    Boolean(input.packageDesignReady)
  );
}

export function DesignStudio({
  projectId,
  studio,
  packageReady = false,
  draftSpecReady = false,
  packageDesign,
  language = "en",
  onState,
  onDownloadHandoff,
  showDownloadHandoff = true,
  showPrototypeAction = true,
  autoGenerate = false,
  onAutoGenerateHandled,
}: {
  projectId: string;
  studio?: Studio;
  packageReady?: boolean;
  draftSpecReady?: boolean;
  packageDesign?: PackageDesign | null;
  language?: "id" | "en";
  onState: (state: unknown, version: number) => void;
  onDownloadHandoff: () => void;
  showDownloadHandoff?: boolean;
  showPrototypeAction?: boolean;
  autoGenerate?: boolean;
  onAutoGenerateHandled?: () => void;
}) {
  const [stage, setStage] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [viewport, setViewport] = useState<keyof typeof VIEWPORTS>("Desktop");
  const [composer, setComposer] = useState("");
  const [impactNote, setImpactNote] = useState("");
  const [remotePackageDesign, setRemotePackageDesign] =
    useState<PackageDesign | null>(null);
  const [designJob, setDesignJob] = useState<DesignJob | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [remoteReadiness, setRemoteReadiness] = useState<Studio["readiness"]>();
  const readiness = remoteReadiness || studio?.readiness;
  const previewUrl = `/api/projects/${projectId}/design/preview?v=${studio?.currentVersion || 0}`;
  const baseline = remotePackageDesign || packageDesign || null;
  const hasDesign = Boolean(studio && studio.currentVersion > 0);
  const effectivePackageReady = designGenerationReady({
    packageReady,
    draftSpecReady,
    packageDesignReady: Boolean(baseline) || hasDesign,
  });
  const designBusy =
    working || ["QUEUED", "RUNNING"].includes(designJob?.status || "");

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
      const response = await fetch(
        `/api/projects/${projectId}/design/generate`,
      );
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
        if (next.state && typeof next.version === "number")
          onState(next.state, next.version);
        if (data.job.status === "FAILED")
          setError(
            data.job.errorSummary ||
              (language === "id"
                ? "Prototype belum berhasil dibuat."
                : "Prototype could not be created yet."),
          );
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

  const generate = useCallback(async () => {
    setWorking(true);
    setError("");
    setStage(
      language === "id"
        ? "Menyiapkan prototype dengan AI..."
        : "Preparing AI prototype...",
    );
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
  }, [language, projectId]);

  useEffect(() => {
    if (!autoGenerate || !effectivePackageReady || designBusy) return;
    const timer = window.setTimeout(() => {
      void generate().finally(() => onAutoGenerateHandled?.());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    autoGenerate,
    designBusy,
    effectivePackageReady,
    generate,
    onAutoGenerateHandled,
  ]);

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
        {effectiveScreens.length === 0 ? (
          <p className="text-[0.8rem] text-muted-foreground">
            {language === "id"
              ? "Screen map muncul setelah spec terkunci."
              : "The screen map appears after the spec locks."}
          </p>
        ) : (
          effectiveScreens.map((screen) => (
            <a
              key={screen.id}
              className="rf-studio-screen"
              href={previewUrl + screen.route}
              target="rf-preview"
            >
              <span>{screen.name}</span>
              <span className="rf-studio-source">{screen.route}</span>
            </a>
          ))
        )}
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
                ? "Baseline · READY"
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
              <p className="mt-2 max-w-[48ch] text-[0.95rem] leading-6 text-muted-foreground">
                {baseline.summary}
              </p>
            ) : (
              <p className="rf-studio-score">
                {readiness?.score ?? 0}% · {readiness?.level || "BLOCKED"}
              </p>
            )}
            <p className="mt-2 text-[0.875rem] text-muted-foreground">
              {effectiveScreens.length > 0
                ? `${effectiveScreens.length} ${language === "id" ? "layar terpetakan" : "screens mapped"}`
                : language === "id"
                  ? "Screen Map belum tersedia"
                  : "Screen Map is not available yet"}
            </p>
            {prototypeFailed ? (
              <p className="rf-studio-note">
                {language === "id"
                  ? "Prototype belum berhasil dibuat."
                  : "Prototype could not be created yet."}
              </p>
            ) : null}
            {designBusy ? (
              <ol className="mt-4 space-y-1.5 text-[0.875rem]" role="status">
                {DESIGN_PROGRESS.map(([key, en, id]) => {
                  const current = designJob?.stage === key;
                  const complete =
                    DESIGN_PROGRESS.findIndex((item) => item[0] === designJob?.stage) >
                    DESIGN_PROGRESS.findIndex((item) => item[0] === key);
                  return (
                    <li
                      key={key}
                      className={
                        complete || current
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }
                    >
                      <span className="mr-2" aria-hidden="true">
                        {complete ? "✓" : current ? "●" : "○"}
                      </span>
                      {language === "id" ? id : en}
                    </li>
                  );
                })}
              </ol>
            ) : null}
            {showPrototypeAction ? (
              <>
                <button
                  type="button"
                  className="rf-studio-primary mt-4"
                  disabled={!effectivePackageReady || designBusy}
                  onClick={() => void generate()}
                >
                  {prototypeActionLabel}
                </button>
                <p className="mt-2 max-w-[42ch] text-[0.75rem] leading-5 text-muted-foreground">
                  {language === "id"
                    ? "Opsional. Prototype jadi referensi visual dari Product Spec dan Screen Map."
                    : "Optional. The prototype becomes a visual reference from the Product Spec and Screen Map."}
                </p>
              </>
            ) : null}
            {designJob && ["QUEUED", "RUNNING"].includes(designJob.status) ? (
              <p className="rf-progress-row" role="status">
                <span className="rf-pulse-dot" />
                {designJob.stageLabel}
              </p>
            ) : null}
            {!effectivePackageReady ? (
              <p className="mt-3 text-[0.75rem] text-muted-foreground">
                {language === "id"
                  ? "Draft Spec sudah cukup untuk mulai design. Asumsi yang belum jelas akan ditampilkan."
                  : "A draft spec is enough to start design. Unresolved assumptions stay visible."}
              </p>
            ) : null}
            {stage ? <p className="rf-progress-row">{stage}</p> : null}
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
            {effectivePackageReady && showDownloadHandoff && (
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
