"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Inbox,
  Lightbulb,
  MessageCircle,
  Send,
} from "lucide-react";
import "./living-workspace.css";

type Idea = {
  id: string;
  originalText: string;
  createdAt: string;
  projectId: string | null;
  status: string;
  conversionType: string | null;
  conversionId: string | null;
};
type Project = {
  id: string;
  name: string;
  tasks: {
    id: string;
    title: string;
    status: string;
    priority: string;
    dueAt: string | null;
    plannedDate: string | null;
  }[];
};
type Thread = { id: string; title: string };
type Message = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
};
type Proposal = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: string;
  result: unknown;
};
type Turn = {
  id: string;
  status: string;
  errorSummary: string | null;
  executorId: string | null;
  externalId: string | null;
  createdAt: string;
  proposals: Proposal[];
};
type Snapshot = {
  ideas: Idea[];
  threads: Thread[];
  threadId: string | null;
  messages: Message[];
  turns: Turn[];
  projects: Project[];
  executors: {
    id: string;
    label: string;
    available: boolean;
    reason?: string;
  }[];
};
type Mode = "today" | "inbox" | "ask";
const EMPTY: Snapshot = {
  ideas: [],
  threads: [],
  threadId: null,
  messages: [],
  turns: [],
  projects: [],
  executors: [],
};
const ACTIVE = ["QUEUED", "SUBMITTING", "RUNNING"];

export function LivingWorkspace({ mode }: { mode: Mode }) {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [captureText, setCaptureText] = useState("");
  const [messageText, setMessageText] = useState("");
  const [executorId, setExecutorId] = useState("hermes");
  const [captureProject, setCaptureProject] = useState("");
  const [target, setTarget] = useState<
    Record<
      string,
      {
        kind: "task" | "project";
        projectId: string;
        title: string;
        criteria: string;
        planned: string;
      }
    >
  >({});
  const [proposalEdits, setProposalEdits] = useState<Record<string, string>>(
    {},
  );
  const requestId = useRef("");
  const sendingId = useRef("");
  const load = useCallback(async (threadId?: string | null) => {
    try {
      const response = await fetch(
        `/api/living${threadId ? `?threadId=${encodeURIComponent(threadId)}` : ""}`,
        { cache: "no-store" },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not load Living Workspace.");
      if (threadId) sessionStorage.setItem("rockfoundry-thread", threadId);
      setData(body as Snapshot);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load Living Workspace.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        void load(sessionStorage.getItem("rockfoundry-thread") || undefined),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [load]);
  const activeIds = data.turns
    .filter(
      (t) =>
        ACTIVE.includes(t.status) &&
        (data.executors.find((executor) => executor.id === t.executorId)
          ?.available ??
          false),
    )
    .map((t) => t.id)
    .join(",");
  useEffect(() => {
    if (!activeIds) return;
    const poll = async () => {
      for (const turnId of activeIds.split(",")) {
        try {
          const response = await fetch("/api/living", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "advance", turnId }),
          });
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            setError(body.error || "Could not advance the active turn.");
          }
        } catch {
          setError(
            "Connection lost while advancing this turn; retrying safely.",
          );
        }
      }
      await load(data.threadId);
    };
    const timer = window.setInterval(() => {
      void poll();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeIds, data.threadId, load]);
  const post = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy(true);
      setError("");
      setNotice("");
      try {
        const response = await fetch("/api/living", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(body.error || "Could not save this change.");
        setNotice("Saved.");
        await load(body.threadId ?? data.threadId);
        return body;
      } catch (e) {
        await load(data.threadId);
        setError(
          e instanceof Error ? e.message : "Could not save this change.",
        );
        return null;
      } finally {
        setBusy(false);
      }
    },
    [data.threadId, load],
  );
  async function capture() {
    if (!captureText.trim() || busy) return;
    if (!requestId.current) requestId.current = crypto.randomUUID();
    const body = await post({
      action: "capture",
      requestId: requestId.current,
      text: captureText,
      ...(captureProject ? { projectId: captureProject } : {}),
    });
    if (body) {
      setCaptureText("");
      requestId.current = "";
    }
  }
  async function send() {
    if (!messageText.trim() || busy || activeIds) return;
    if (!sendingId.current) sendingId.current = crypto.randomUUID();
    const body = await post({
      action: "send",
      requestId: sendingId.current,
      threadId: data.threadId || undefined,
      text: messageText.trim(),
      executorId,
    });
    if (body) {
      setMessageText("");
      sendingId.current = "";
    }
  }
  async function decide(
    proposal: Proposal,
    decision: "APPROVED" | "DISMISSED",
  ) {
    let payload: Record<string, unknown> | undefined;
    if (decision === "APPROVED") {
      try {
        payload = JSON.parse(
          proposalEdits[proposal.id] || JSON.stringify(proposal.payload),
        );
      } catch {
        setError("Proposal must be valid JSON before approval.");
        return;
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        setError("Proposal must be a JSON object.");
        return;
      }
    }
    await post({
      action: "decide",
      proposalId: proposal.id,
      decision,
      ...(payload ? { payload } : {}),
    });
  }
  const title =
    mode === "today"
      ? "A thought worth keeping?"
      : mode === "inbox"
        ? "Idea inbox"
        : "Ask Rock";
  return (
    <>
      {mode !== "today" && (
        <nav className="work-tabs living-nav" aria-label="Work OS navigation">
          <Link href="/today">Today</Link>
          <Link href="/projects">Projects</Link>
          <Link href="/runs">Agent Runs</Link>
          <Link
            href="/inbox"
            aria-current={mode === "inbox" ? "page" : undefined}
          >
            Idea Inbox
          </Link>
          <Link href="/ask" aria-current={mode === "ask" ? "page" : undefined}>
            Ask Rock
          </Link>
          <div className="living-sidebar-projects" aria-label="Active projects">
            {data.projects.slice(0, 8).map((project) => (
              <Link key={project.id} href={`/projects?project=${project.id}`}>
                {project.name}
              </Link>
            ))}
          </div>
          <Link href="/" className="work-product-link">
            Legacy Projects · Product Studio <ArrowUpRight size={14} />
          </Link>
        </nav>
      )}
      <section className={`living living-${mode}`} aria-label={title}>
        {mode === "today" ? (
          <div className="living-today-head">
            <div>
              <p className="living-eyebrow">LIVING WORKSPACE</p>
              <h2>{title}</h2>
              <p>Capture a thought, or talk it through.</p>
            </div>
            <div className="living-entry-links">
              <Link href="/inbox">
                <Inbox size={16} /> Inbox <ArrowUpRight size={14} />
              </Link>
              <Link href="/ask">
                <MessageCircle size={16} /> Ask Rock <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
        ) : (
          <header className="living-page-head">
            <p className="living-eyebrow">LIVING WORKSPACE</p>
            <h1>{title}</h1>
            <p>
              {mode === "inbox"
                ? "Your captured ideas, ready for you to shape into work."
                : "A private conversation that can suggest work. You decide what happens."}
            </p>
          </header>
        )}
        {error && (
          <div className="living-alert" role="alert">
            {error}
            <button type="button" onClick={() => void load(data.threadId)}>
              Retry
            </button>
          </div>
        )}
        {notice && (
          <p className="living-notice" role="status">
            {notice}
          </p>
        )}
        {mode !== "ask" && (
          <div className="living-capture">
            <label>
              Optional project
              <select
                aria-label="Capture project"
                value={captureProject}
                disabled={busy}
                onChange={(event) => {
                  requestId.current = "";
                  setCaptureProject(event.target.value);
                }}
              >
                <option value="">Inbox · no project</option>
                {data.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={`living-capture-${mode}`}>
              {mode === "today" ? "Quick Capture" : "Capture idea"}
            </label>
            <textarea
              id={`living-capture-${mode}`}
              aria-label={mode === "today" ? "Quick Capture" : "Capture idea"}
              rows={mode === "today" ? 2 : 3}
              maxLength={10000}
              value={captureText}
              disabled={busy}
              onChange={(e) => {
                requestId.current = "";
                setCaptureText(e.target.value);
              }}
              placeholder="A thought, a task, something to remember…"
            />
            <div className="living-compose-foot">
              <span>Saved to your inbox, even if no project is selected.</span>
              <button
                type="button"
                disabled={busy || !captureText.trim()}
                onClick={() => void capture()}
              >
                <Lightbulb size={16} />
                {mode === "today" ? "Capture idea" : "Save idea"}
              </button>
            </div>
          </div>
        )}
        {mode === "today" && (
          <div className="living-today-count">
            <span>
              {loading
                ? "Loading ideas…"
                : `${data.ideas.filter((idea) => idea.status === "INBOX").length} ${data.ideas.filter((idea) => idea.status === "INBOX").length === 1 ? "idea" : "ideas"} waiting in your inbox`}
            </span>
            <Link href="/inbox">
              Review inbox <ArrowUpRight size={14} />
            </Link>
          </div>
        )}
        {mode === "inbox" &&
          (loading ? (
            <div className="living-empty" role="status">
              Loading ideas…
            </div>
          ) : data.ideas.length === 0 ? (
            <div className="living-empty">
              <Lightbulb size={22} />
              <strong>No ideas yet</strong>
              <p>Capture an idea from Today or start here.</p>
              <Link href="/today">Go to Today</Link>
            </div>
          ) : (
            <div className="living-ideas">
              {data.ideas.map((idea) => (
                <article className="living-idea" key={idea.id}>
                  <div className="living-idea-content">
                    <p>{idea.originalText}</p>
                    <small>
                      Captured {new Date(idea.createdAt).toLocaleString()} ·{" "}
                      {idea.status.replaceAll("_", " ")}
                      {idea.conversionType
                        ? ` · ${idea.conversionType.toLowerCase()}`
                        : ""}
                    </small>
                  </div>
                  {idea.status === "INBOX" ? (
                    <div className="living-convert">
                      <label>
                        Convert to
                        <select
                          aria-label={`Convert idea ${idea.id} to`}
                          value={target[idea.id]?.kind || "task"}
                          onChange={(e) =>
                            setTarget((v) => ({
                              ...v,
                              [idea.id]: {
                                kind: e.target.value as "task" | "project",
                                projectId: v[idea.id]?.projectId || "",
                                title:
                                  v[idea.id]?.title ||
                                  idea.originalText.slice(0, 200),
                                criteria: v[idea.id]?.criteria || "",
                                planned: v[idea.id]?.planned || "",
                              },
                            }))
                          }
                        >
                          <option value="task">Task</option>
                          <option value="project">Project</option>
                        </select>
                      </label>
                      {(target[idea.id]?.kind || "task") === "task" && (
                        <label>
                          Project
                          <select
                            aria-label={`Project for idea ${idea.id}`}
                            value={target[idea.id]?.projectId || ""}
                            onChange={(e) =>
                              setTarget((v) => ({
                                ...v,
                                [idea.id]: {
                                  kind: v[idea.id]?.kind || "task",
                                  projectId: e.target.value,
                                  title:
                                    v[idea.id]?.title ||
                                    idea.originalText.slice(0, 200),
                                  criteria: v[idea.id]?.criteria || "",
                                  planned: v[idea.id]?.planned || "",
                                },
                              }))
                            }
                          >
                            <option value="">Choose project</option>
                            {data.projects.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label>
                        Title
                        <input
                          aria-label={`Title for idea ${idea.id}`}
                          maxLength={200}
                          value={
                            target[idea.id]?.title ??
                            idea.originalText.slice(0, 200)
                          }
                          onChange={(e) =>
                            setTarget((v) => ({
                              ...v,
                              [idea.id]: {
                                kind: v[idea.id]?.kind || "task",
                                projectId: v[idea.id]?.projectId || "",
                                title: e.target.value,
                                criteria: v[idea.id]?.criteria || "",
                                planned: v[idea.id]?.planned || "",
                              },
                            }))
                          }
                        />
                      </label>
                      {(target[idea.id]?.kind || "task") === "task" && (
                        <>
                          <label>
                            Acceptance criteria
                            <textarea
                              aria-label={`Acceptance criteria for idea ${idea.id}`}
                              value={target[idea.id]?.criteria || ""}
                              onChange={(e) =>
                                setTarget((v) => ({
                                  ...v,
                                  [idea.id]: {
                                    kind: v[idea.id]?.kind || "task",
                                    projectId: v[idea.id]?.projectId || "",
                                    title:
                                      v[idea.id]?.title ||
                                      idea.originalText.slice(0, 200),
                                    criteria: e.target.value,
                                    planned: v[idea.id]?.planned || "",
                                  },
                                }))
                              }
                            />
                          </label>
                          <label>
                            Planned date
                            <input
                              aria-label={`Planned date for idea ${idea.id}`}
                              type="date"
                              value={target[idea.id]?.planned || ""}
                              onChange={(e) =>
                                setTarget((v) => ({
                                  ...v,
                                  [idea.id]: {
                                    kind: "task",
                                    projectId: v[idea.id]?.projectId || "",
                                    title:
                                      v[idea.id]?.title ||
                                      idea.originalText.slice(0, 200),
                                    criteria: v[idea.id]?.criteria || "",
                                    planned: e.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                        </>
                      )}
                      <button
                        type="button"
                        disabled={
                          busy ||
                          !target[idea.id]?.title?.trim() ||
                          ((target[idea.id]?.kind || "task") === "task" &&
                            (!target[idea.id]?.projectId ||
                              !target[idea.id]?.criteria?.trim()))
                        }
                        onClick={() =>
                          void post({
                            action: "convert",
                            ideaId: idea.id,
                            target: target[idea.id]?.kind || "task",
                            ...(target[idea.id]?.kind === "project"
                              ? {}
                              : { projectId: target[idea.id]?.projectId }),
                            title:
                              target[idea.id]?.title ||
                              idea.originalText.slice(0, 200),
                            ...(target[idea.id]?.kind === "project"
                              ? {}
                              : {
                                  acceptanceCriteria: target[idea.id]?.criteria,
                                  ...(target[idea.id]?.planned
                                    ? {
                                        plannedDate: new Date(
                                          `${target[idea.id].planned}T12:00:00`,
                                        ).toISOString(),
                                      }
                                    : {}),
                                }),
                          })
                        }
                      >
                        Create {target[idea.id]?.kind || "task"}
                      </button>
                    </div>
                  ) : (
                    <small className="living-converted">
                      <Check size={14} />{" "}
                      {idea.status === "CONVERTED"
                        ? `Converted${idea.conversionType ? ` to ${idea.conversionType.toLowerCase()}` : ""}`
                        : idea.status.replaceAll("_", " ")}
                    </small>
                  )}
                </article>
              ))}
            </div>
          ))}
        {mode === "ask" && (
          <div className="living-chat">
            <div className="living-chat-toolbar">
              <label htmlFor="living-thread">Conversation</label>
              <select
                id="living-thread"
                aria-label="Conversation history"
                value={data.threadId || ""}
                onChange={(e) => void load(e.target.value || "new")}
              >
                <option value="">New conversation</option>
                {data.threads.map((thread) => (
                  <option key={thread.id} value={thread.id}>
                    {thread.title}
                  </option>
                ))}
              </select>
              <label htmlFor="living-executor">Executor</label>
              <select
                id="living-executor"
                aria-label="Conversation executor"
                value={executorId}
                onChange={(e) => setExecutorId(e.target.value)}
              >
                <option
                  value="hermes"
                  disabled={
                    !data.executors.find((ex) => ex.id === "hermes")?.available
                  }
                >
                  Hermes
                </option>
                {data.executors.find((ex) => ex.id === "mock")?.available && (
                  <option value="mock">Mock · development</option>
                )}
              </select>
              <span>
                {data.executors.find((ex) => ex.id === "hermes")?.available
                  ? "Hermes available"
                  : data.executors.find((ex) => ex.id === "hermes")?.reason ||
                    "Assistant unavailable"}
              </span>
            </div>
            <div className="living-messages" aria-live="polite">
              {loading ? (
                <p className="living-empty">Loading conversation…</p>
              ) : data.messages.length === 0 ? (
                <p className="living-empty">
                  No messages yet. Ask a question or think out loud.
                </p>
              ) : (
                data.messages.map((message) => (
                  <article
                    key={message.id}
                    className={`living-message living-message-${message.role.toLowerCase()}`}
                  >
                    <strong>
                      {message.role === "USER" ? "You" : "Rock · AI suggestion"}
                      <small>
                        {new Date(message.createdAt).toLocaleString()}
                      </small>
                    </strong>
                    <p>{message.content}</p>
                  </article>
                ))
              )}
            </div>
            {data.turns.map((turn) => (
              <div className="living-turn" key={turn.id}>
                <strong>{turn.status.replaceAll("_", " ")}</strong>
                {turn.errorSummary && <p role="alert">{turn.errorSummary}</p>}
                {["FAILED", "BLOCKED"].includes(turn.status) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void post({ action: "advance", turnId: turn.id })
                    }
                  >
                    Retry this turn
                  </button>
                )}
                {turn.proposals.map((proposal) => (
                  <article className="living-proposal" key={proposal.id}>
                    <div>
                      <strong>{proposal.type.replaceAll("_", " ")}</strong>
                      <span
                        className={`living-decision living-decision-${proposal.status.toLowerCase()}`}
                      >
                        {proposal.status}
                      </span>
                    </div>
                    <label>
                      Proposed changes (JSON)
                      <textarea
                        aria-label="Edit proposal"
                        spellCheck={false}
                        readOnly={proposal.status !== "PENDING"}
                        value={
                          proposalEdits[proposal.id] ??
                          JSON.stringify(
                            proposal.status === "APPROVED" &&
                              proposal.result &&
                              typeof proposal.result === "object" &&
                              "reviewedPayload" in proposal.result
                              ? proposal.result.reviewedPayload
                              : proposal.payload,
                            null,
                            2,
                          )
                        }
                        onChange={(e) =>
                          setProposalEdits((v) => ({
                            ...v,
                            [proposal.id]: e.target.value,
                          }))
                        }
                      />
                    </label>
                    {proposal.status === "PENDING" && (
                      <div className="living-proposal-actions">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void decide(proposal, "APPROVED")}
                        >
                          <Check size={15} />
                          Approve
                        </button>
                        <button
                          type="button"
                          className="living-secondary"
                          disabled={busy}
                          onClick={() => void decide(proposal, "DISMISSED")}
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ))}
            <form
              className="living-chat-compose"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <label className="living-sr-only" htmlFor="living-message">
                Message Rock
              </label>
              <textarea
                id="living-message"
                aria-label="Message Rock"
                rows={3}
                maxLength={10000}
                value={messageText}
                disabled={busy}
                onChange={(e) => {
                  sendingId.current = "";
                  setMessageText(e.target.value);
                }}
                placeholder="Message Rock…"
              />
              <button
                type="submit"
                disabled={busy || !!activeIds || !messageText.trim()}
              >
                <Send size={16} />
                Send
              </button>
            </form>
            {activeIds && (
              <p className="living-turn-note" role="status">
                Rock is working. This conversation will refresh automatically.
              </p>
            )}
          </div>
        )}
      </section>
    </>
  );
}
