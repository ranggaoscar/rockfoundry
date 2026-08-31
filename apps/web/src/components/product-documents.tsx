"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type DocumentType =
  "BRD" | "PRD" | "ERD" | "USER_FLOWS" | "SCREEN_MAP" | "DESIGN_BRIEF";

type DraftDocument = {
  id: string;
  type: DocumentType;
  fileName: string;
  status: string;
  content: string;
  version: number;
  current: boolean;
  generatedAt: string;
};

export type DraftGenerationBatch = {
  id: "BRD_PRD" | "ERD_USER_FLOWS" | "SCREEN_MAP_DESIGN_BRIEF";
  label: string;
  documentTypes: string[];
  status: "PENDING" | "RUNNING" | "COMPLETE" | "FAILED";
};

type DraftGeneration = {
  id: string;
  generationNumber: number;
  canonicalVersion: number;
  status: "RUNNING" | "COMPLETE" | "FAILED";
  batches: DraftGenerationBatch[];
};

type DraftBatchPresentation = "completed" | "active" | "failed" | "pending";

export type DraftBatchProgress = DraftGenerationBatch & {
  presentation: DraftBatchPresentation;
};

export function getDraftBatchProgress(
  batches: DraftGenerationBatch[],
): DraftBatchProgress[] {
  return batches.map((batch) => ({
    ...batch,
    presentation:
      batch.status === "COMPLETE"
        ? "completed"
        : batch.status === "RUNNING"
          ? "active"
          : batch.status === "FAILED"
            ? "failed"
            : "pending",
  }));
}

const DRAFT_PROGRESS_POLL_INTERVAL_MS = 1500;

const DOCUMENT_ORDER: DocumentType[] = [
  "BRD",
  "PRD",
  "ERD",
  "USER_FLOWS",
  "SCREEN_MAP",
  "DESIGN_BRIEF",
];

const DOCUMENT_LABELS: Record<
  DocumentType,
  { title: string; purpose: string }
> = {
  BRD: { title: "Business requirements", purpose: "Why this product exists" },
  PRD: { title: "Product requirements", purpose: "What the product should do" },
  ERD: { title: "Data model", purpose: "Entities and relationships" },
  USER_FLOWS: { title: "User flows", purpose: "How the work moves" },
  SCREEN_MAP: { title: "Screen map", purpose: "Where the work appears" },
  DESIGN_BRIEF: {
    title: "Design brief",
    purpose: "How the preview should feel",
  },
};


export function ProductDocuments({
  projectId,
  language = "en",
  onContinueChat,
  onOpenDesign,
  onGenerateHandoff,
  generationRequestId = 0,
  onGenerated,
  onGenerationSettled,
}: {
  projectId: string;
  language?: "id" | "en";
  onContinueChat: () => void;
  onOpenDesign: () => void;
  onGenerateHandoff: () => void;
  generationRequestId?: number;
  onGenerated?: () => void;
  onGenerationSettled?: () => void;
}) {
  const indo = language === "id";
  const [documents, setDocuments] = useState<DraftDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generation, setGeneration] = useState<DraftGeneration | null>(null);
  const [error, setError] = useState("");
  const [activeType, setActiveType] = useState<DocumentType>("PRD");
  const handledGenerationRequestRef = useRef<number | null>(null);

  const loadDocuments = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background ?? false;
    if (!background) {
      setLoading(true);
      setError("");
    }
    try {
      const response = await fetch(`/api/projects/${projectId}/documents`);
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not load documents.");
      const nextDocuments = Array.isArray(data.documents)
        ? (data.documents as DraftDocument[])
        : [];
      if (data.generation) setGeneration(data.generation as DraftGeneration);
      setDocuments(nextDocuments);
      setActiveType((current) =>
        nextDocuments.some((document) => document.type === current)
          ? current
          : nextDocuments[0]?.type || "PRD",
      );
    } catch (cause) {
      if (!background)
        setError(
          cause instanceof Error ? cause.message : "Could not load documents.",
        );
    } finally {
      if (!background) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDocuments(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDocuments]);

  useEffect(() => {
    if (!generating) return;
    let mounted = true;
    let timer: number | undefined;

    const poll = async () => {
      await loadDocuments({ background: true });
      if (mounted)
        timer = window.setTimeout(poll, DRAFT_PROGRESS_POLL_INTERVAL_MS);
    };

    timer = window.setTimeout(poll, DRAFT_PROGRESS_POLL_INTERVAL_MS);
    return () => {
      mounted = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [generating, loadDocuments]);

  const activeDocument = useMemo(
    () => documents.find((document) => document.type === activeType) || null,
    [activeType, documents],
  );
  const hasCurrentDraft = documents.some((document) => document.current);
  const hasDraft = documents.length > 0;

  const generateDraft = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/documents`, {
        method: "POST",
      });
      const data = await response.json();
      if (data.generation) setGeneration(data.generation as DraftGeneration);
      if (!response.ok)
        throw new Error(data.error || "Could not generate the Product Draft.");
      await loadDocuments();
      onGenerated?.();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not generate the Product Draft.",
      );
    } finally {
      setGenerating(false);
      onGenerationSettled?.();
    }
  }, [generating, loadDocuments, onGenerated, onGenerationSettled, projectId]);

  useEffect(() => {
    if (
      generationRequestId <= 0 ||
      handledGenerationRequestRef.current === generationRequestId
    )
      return;
    handledGenerationRequestRef.current = generationRequestId;
    void generateDraft();
  }, [generateDraft, generationRequestId]);

  return (
    <article className="rf-documents">
      <header className="rf-documents-header">
        <div>
          <p className="rf-workbench-kicker">PRODUCT DRAFT</p>
          <h2>{indo ? "Dokumen produk" : "Product documents"}</h2>
          <p className="rf-documents-intro">
            {indo
              ? "Review apa yang sudah diketahui, apa yang masih berupa proposal, dan apa yang perlu diputuskan. Dokumen ini bisa diperbarui dari chat."
              : "Review what is known, what is proposed, and what still needs a decision. Update the draft from chat whenever the product changes."}
          </p>
        </div>
        <div className="rf-documents-actions">
          <button
            className="rf-primary-button"
            type="button"
            onClick={() => void generateDraft()}
            disabled={generating}
          >
            {generating
              ? indo
                ? "Menyusun draft…"
                : "Updating draft…"
              : hasCurrentDraft || hasDraft
                ? indo
                  ? "Perbarui draft"
                  : "Update draft"
                : indo
                  ? "Generate Product Draft"
                  : "Generate Product Draft"}
          </button>
          <button
            className="rf-header-action inline-flex"
            type="button"
            onClick={onContinueChat}
          >
            {indo ? "Lanjut chat" : "Continue chat"}
          </button>
          <button
            className="rf-header-action inline-flex"
            type="button"
            onClick={onOpenDesign}
          >
            {indo ? "Buat design preview" : "Generate Design Preview"}
          </button>
          <button
            className="rf-header-action inline-flex"
            type="button"
            onClick={onGenerateHandoff}
            disabled={!hasDraft}
          >
            {indo ? "Siapkan handoff" : "Prepare final handoff"}
          </button>
          <a
            className="rf-header-action inline-flex"
            href={`/api/projects/${projectId}/export`}
          >
            {indo ? "Unduh draft" : "Download draft"}
          </a>
        </div>
      </header>

      {!hasCurrentDraft && hasDraft ? (
        <p className="rf-documents-stale" role="status">
          {indo
            ? `Draft terakhir dari versi ${documents[0]?.version}. Chat sudah berubah; perbarui untuk menyusun versi terbaru.`
            : `This draft is from version ${documents[0]?.version}. The conversation changed; update it to generate the current version.`}
        </p>
      ) : null}

      {error ? (
        <div className="rf-documents-error" role="alert">
          <p className="rf-error">{error}</p>
          <button
            className="rf-header-action inline-flex"
            type="button"
            onClick={() => void generateDraft()}
            disabled={generating}
          >
            {indo ? "Coba lagi" : "Retry Product Draft"}
          </button>
        </div>
      ) : null}

      {generating ? (
        <section
          className="rf-draft-progress"
          aria-busy="true"
          aria-live="polite"
          aria-label={
            indo ? "Status pembuatan Product Draft" : "Product Draft status"
          }
        >
          <p className="rf-draft-progress-title">
            {indo
              ? "RockFoundry sedang menyusun konsep produk…"
              : "RockFoundry is composing your product concept…"}
          </p>
          <ol>
            {getDraftBatchProgress(generation?.batches ?? []).map((batch) => (
              <li
                key={batch.id}
                data-complete={batch.presentation === "completed"}
                data-active={batch.presentation === "active"}
                data-failed={batch.presentation === "failed"}
              >
                <span aria-hidden="true">
                  {batch.presentation === "completed"
                    ? "✓"
                    : batch.presentation === "active"
                      ? "●"
                      : batch.presentation === "failed"
                        ? "!"
                        : "○"}
                </span>
                {batch.label}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="rf-documents-body">
        <nav
          className="rf-document-list"
          aria-label={indo ? "Daftar dokumen" : "Document list"}
        >
          <p className="rf-document-list-label">
            {indo ? "Draft files" : "Draft files"}
          </p>
          <ul role="list">
            {DOCUMENT_ORDER.map((type) => {
              const document = documents.find((item) => item.type === type);
              const label = DOCUMENT_LABELS[type];
              return (
                <li key={type}>
                  <button
                    className="rf-document-item"
                    data-active={activeType === type}
                    type="button"
                    onClick={() => setActiveType(type)}
                  >
                    <span className="rf-document-item-title">
                      {label.title}
                    </span>
                    <span className="rf-document-item-meta">
                      {document?.current
                        ? "Current"
                        : document
                          ? `v${document.version}`
                          : "Not generated"}
                    </span>
                    <span className="rf-document-item-purpose">
                      {label.purpose}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <section
          className="rf-document-reader"
          aria-live="polite"
          aria-label={activeDocument?.fileName || "Document reader"}
        >
          {loading ? (
            <p className="rf-document-empty">
              {indo ? "Memuat dokumen…" : "Loading documents…"}
            </p>
          ) : activeDocument ? (
            <>
              <header className="rf-document-reader-header">
                <div>
                  <p className="rf-workbench-kicker">
                    {activeDocument.fileName}
                  </p>
                  <h3>{DOCUMENT_LABELS[activeDocument.type].title}</h3>
                </div>
                <span
                  className="rf-document-status"
                  data-current={activeDocument.current}
                >
                  {activeDocument.current
                    ? "Current draft"
                    : `Version ${activeDocument.version}`}
                </span>
              </header>
              <pre className="rf-document-content">
                {activeDocument.content}
              </pre>
            </>
          ) : (
            <div className="rf-document-empty">
              <p>
                {indo ? "Belum ada Product Draft." : "No Product Draft yet."}
              </p>
              <p>
                {indo
                  ? "Setelah beberapa jawaban bermakna, kita sudah punya cukup bahan untuk membuat versi pertama."
                  : "After a few meaningful answers, there is enough context for a useful first draft."}
              </p>
            </div>
          )}
        </section>
      </div>
    </article>
  );
}
