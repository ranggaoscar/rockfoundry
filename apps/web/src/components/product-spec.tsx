"use client";

import { humanTopicLabel } from "@/lib/topic-label";

type SpecRecord = Record<string, unknown>;

type SpecProps = {
  state: SpecRecord;
  language?: "id" | "en";
  packageReady?: boolean;
  working?: boolean;
  onUpdate?: () => void;
  onDownload?: () => void;
  onGenerateHandoff?: () => void;
};

type SpecDecision = {
  id?: string;
  topic?: string;
  decision?: string;
  title?: string;
  description?: string;
  status?: string;
};

function asText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return "";
      const record = item as SpecRecord;
      return asText(
        record.name ||
          record.title ||
          record.statement ||
          record.description ||
          record.summary,
        "",
      );
    })
    .map((item) => item.trim())
    .filter(Boolean);
}

function unresolvedTopics(state: SpecRecord): string[] {
  const discovery = state.discovery;
  if (!discovery || typeof discovery !== "object") return [];
  const topics = (discovery as SpecRecord).unresolvedTopics;
  if (!Array.isArray(topics)) return [];
  return topics.filter((topic): topic is string => typeof topic === "string");
}

function specDecisions(state: SpecRecord): SpecDecision[] {
  if (!Array.isArray(state.decisions)) return [];
  return state.decisions.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as SpecRecord;
    return [
      {
        id: typeof record.id === "string" ? record.id : undefined,
        topic: typeof record.topic === "string" ? record.topic : undefined,
        decision:
          typeof record.decision === "string" ? record.decision : undefined,
        title: typeof record.title === "string" ? record.title : undefined,
        description:
          typeof record.description === "string"
            ? record.description
            : undefined,
        status: typeof record.status === "string" ? record.status : undefined,
      },
    ];
  });
}

function identityName(state: SpecRecord) {
  const identity = state.identity;
  if (identity && typeof identity === "object" && "name" in identity) {
    const name = (identity as SpecRecord).name;
    if (typeof name === "string" && name.trim()) return name;
  }
  return typeof state.name === "string" ? state.name : undefined;
}

export function productSpecText(state: SpecRecord, language: "id" | "en" = "en") {
  const overview = asText(
    state.normalizedSummary || state.rawIdea,
    language === "id"
      ? "RockFoundry masih merangkai gambaran produk ini."
      : "RockFoundry is still assembling this product.",
  );
  const audience =
    asList(state.targetUsers).join(", ") ||
    asList(state.roles).join(", ") ||
    (language === "id" ? "Belum dikunci." : "Not locked yet.");
  const experience =
    asList(state.objectives)[0] ||
    asList(state.workflows)[0] ||
    (language === "id"
      ? "Pengalaman inti masih dibuka lewat percakapan."
      : "The core experience is still being shaped in conversation.");
  const flows = asList(state.workflows);
  const questions = [
    ...asList(state.openQuestions),
    ...unresolvedTopics(state).map((topic) => humanTopicLabel(topic, language)),
  ];
  return [
    "PRODUCT SPEC",
    "",
    "Product Overview",
    overview,
    "",
    "Who It's For",
    audience,
    "",
    "Core Experience",
    experience,
    "",
    "Main Flows",
    ...(flows.length ? flows.map((flow, index) => `${index + 1}. ${flow}`) : ["-"]),
    "",
    "Open Questions",
    ...(questions.length ? questions.map((item) => `• ${item}`) : ["-"]),
  ].join("\n");
}

export function ProductSpec({
  state,
  language = "en",
  packageReady = false,
  working = false,
  onUpdate,
  onDownload,
  onGenerateHandoff,
}: SpecProps) {
  const indo = language === "id";
  const overview = asText(
    state.normalizedSummary || state.rawIdea,
    indo
      ? "Ceritakan idenya di chat. Spec ini akan ikut hidup."
      : "Describe the idea in chat. This spec will stay in motion.",
  );
  const audience = asList(state.targetUsers).slice(0, 6);
  const roles = asList(state.roles).slice(0, 4);
  const experience =
    asList(state.objectives)[0] ||
    asList(state.workflows)[0] ||
    (indo
      ? "Belum ada pengalaman inti yang dikunci."
      : "No core experience is locked yet.");
  const flows = asList(state.workflows).slice(0, 8);
  const questions = [
    ...asList(state.openQuestions),
    ...unresolvedTopics(state).map((topic) => humanTopicLabel(topic, language)),
  ].slice(0, 8);
  const decisions = specDecisions(state).filter(
    (item) => item.status !== "SUPERSEDED",
  );

  async function copySpec() {
    try {
      await navigator.clipboard.writeText(productSpecText(state, language));
    } catch {
      /* clipboard may be blocked */
    }
  }

  return (
    <article className="rf-spec">
      <header>
        <h2 className="text-pretty">
          {identityName(state) ||
            (indo ? "Spec produk hidup" : "Living product spec")}
        </h2>
        <p className="mt-1 max-w-[52ch] text-pretty text-[0.875rem] text-muted-foreground">
          {indo
            ? "Dokumen ini berubah lewat percakapan. Bukan dump Markdown."
            : "This document changes through conversation. It is not a Markdown dump."}
        </p>
        <div className="rf-spec-actions">
          <button
            className="rf-header-action inline-flex"
            type="button"
            onClick={onUpdate}
          >
            {indo ? "Perbarui" : "Update"}
          </button>
          <button
            className="rf-header-action inline-flex"
            type="button"
            onClick={() => void copySpec()}
          >
            {indo ? "Salin" : "Copy"}
          </button>
          <button
            className="rf-header-action inline-flex"
            type="button"
            disabled={!packageReady}
            onClick={onDownload}
          >
            {indo ? "Unduh" : "Download"}
          </button>
          <button
            className="rf-primary-button"
            type="button"
            disabled={working}
            onClick={onGenerateHandoff}
          >
            Generate Handoff
          </button>
        </div>
      </header>

      <section className="rf-spec-section">
        <h3>Product Overview</h3>
        <p className="text-pretty">{overview}</p>
      </section>

      <section className="rf-spec-section">
        <h3>Who It&apos;s For</h3>
        {audience.length || roles.length ? (
          <p className="text-pretty">
            {[...audience, ...roles.filter((role) => !audience.includes(role))].join(
              " · ",
            )}
          </p>
        ) : (
          <p className="text-muted-foreground">
            {indo ? "Audiens masih terbuka." : "Audience is still open."}
          </p>
        )}
      </section>

      <section className="rf-spec-section">
        <h3>Core Experience</h3>
        <p className="text-pretty">{experience}</p>
      </section>

      <section className="rf-spec-section">
        <h3>Main Flows</h3>
        {flows.length ? (
          <ol>
            {flows.map((flow) => (
              <li key={flow}>{flow}</li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground">
            {indo
              ? "Alur utama akan muncul setelah keputusan penting terkunci."
              : "Main flows appear after the important decisions lock."}
          </p>
        )}
      </section>

      <section className="rf-spec-section">
        <h3>Open Questions</h3>
        {questions.length ? (
          <ul>
            {questions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">
            {indo
              ? "Tidak ada pertanyaan terbuka yang menahan spec."
              : "No open questions are blocking the spec."}
          </p>
        )}
      </section>

      {decisions.length ? (
        <section className="rf-spec-section">
          <h3>{indo ? "Keputusan terkunci" : "Locked decisions"}</h3>
          <ul>
            {decisions.slice(0, 8).map((item, index) => (
              <li key={`${item.id || item.topic || index}`}>
                {item.topic
                  ? `${humanTopicLabel(item.topic, language)}: ${String(item.decision || "").replace(/[_-]+/g, " ")}`
                  : item.title || item.description}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
