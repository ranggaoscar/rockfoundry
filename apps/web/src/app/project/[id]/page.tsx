/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  ChevronDown,
  ChevronRight,
  FileText,
  Menu,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Square,
  X,
} from "lucide-react";

type ProjectData = {
  id: string;
  name: string;
  description: string | null;
  canonicalState: any;
  version: number;
};

type QuestionOption = { id: string; label: string; description?: string };
type Question = {
  id: string;
  text: string;
  options?: QuestionOption[];
  recommendation?: string;
  reasonAsked: string;
};
type Reference = {
  id: string;
  type: string;
  url: string;
  status: string;
  metadata: any;
};
type Message = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  text: string;
  detail?: string;
  options?: QuestionOption[];
  recommendation?: string;
  questionId?: string;
  collapsed?: boolean;
};
type Drawer = "context" | "documents" | "settings" | null;

function initialMessages(project: ProjectData): Message[] {
  const idea = project.description?.trim();
  if (!idea)
    return [
      {
        id: "welcome",
        role: "assistant",
        text: "What do you want to build? Tell me the idea in your own words. I will help clarify the product before a coding agent starts.",
      },
    ];
  return [
    { id: "idea", role: "user", text: idea },
    {
      id: "welcome",
      role: "assistant",
      text: "I have the starting idea. I will first identify the most important unknown, then ask one focused question at a time. You can answer naturally or choose an option.",
    },
  ];
}

function projectStatus(state: any) {
  const readiness = String(state?.readiness || "NOT_READY").toUpperCase();
  if (readiness.includes("BUILD") || readiness.includes("MVP"))
    return "Build ready";
  if (readiness.includes("DRAFT") || readiness.includes("PROTOTYPE"))
    return "Draft ready";
  return "Discovery";
}

function readinessScore(state: any) {
  const score = state?.generationMetadata?.lastReadinessScore;
  if (typeof score === "number")
    return Math.max(0, Math.min(100, Math.round(score)));
  const decisions = state?.decisions?.length || 0;
  const questions = state?.openQuestions?.length || 0;
  return Math.max(12, Math.min(92, 34 + decisions * 8 - questions * 3));
}

export default function ProjectWorkspace({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState("");
  const [project, setProject] = useState<ProjectData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [composer, setComposer] = useState("");
  const [question, setQuestion] = useState<Question | null>(null);
  const [references, setReferences] = useState<Reference[]>([]);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [pageError, setPageError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportReady, setExportReady] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  const fetchProject = useCallback(async (id: string) => {
    const response = await fetch(`/api/projects/${id}`);
    if (!response.ok)
      throw new Error(
        response.status === 404
          ? "Project not found."
          : "RockFoundry couldn't load this project.",
      );
    const data = await response.json();
    setProject(data.project);
    setMessages(initialMessages(data.project));
    return data.project as ProjectData;
  }, []);

  useEffect(() => {
    params.then(({ id }) => {
      setProjectId(id);
      fetchProject(id)
        .catch((cause) =>
          setPageError(
            cause instanceof Error
              ? cause.message
              : "RockFoundry couldn't load this project.",
          ),
        )
        .finally(() => setLoading(false));
    });
  }, [fetchProject, params]);

  const fetchQuestion = useCallback(async () => {
    if (!projectId) return;
    const response = await fetch(`/api/projects/${projectId}/questions`);
    if (!response.ok) return;
    const data = await response.json();
    setQuestion(data.questions?.[0] || null);
  }, [projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchQuestion();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchQuestion]);

  const fetchReferences = useCallback(async () => {
    if (!projectId) return;
    const response = await fetch(`/api/projects/${projectId}/references`);
    if (!response.ok) return;
    const data = await response.json();
    setReferences(data.references || []);
  }, [projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchReferences();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchReferences]);

  const state = project?.canonicalState || {};
  const score = readinessScore(state);
  const status = projectStatus(state);
  const openQuestionCount = state.openQuestions?.length || (question ? 1 : 0);

  const visibleMessages = useMemo(() => {
    if (
      !question ||
      messages.some((message) => message.questionId === question.id)
    )
      return messages;
    return [
      ...messages,
      {
        id: `question-${question.id}`,
        role: "assistant" as const,
        text: question.text,
        detail: question.reasonAsked,
        options: question.options,
        recommendation: question.recommendation,
        questionId: question.id,
      },
    ];
  }, [messages, question]);

  async function runExtraction(rawIdea: string) {
    if (!projectId || !rawIdea.trim()) return;
    setWorking(true);
    setPageError("");
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", text: rawIdea.trim() },
      {
        id: `tool-${Date.now()}`,
        role: "tool",
        text: "Analyzing project requirements...",
        detail:
          "The agent is extracting context and checking the next requirement gap.",
      },
    ]);
    try {
      const response = await fetch(`/api/projects/${projectId}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawIdea: rawIdea.trim() }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "RockFoundry couldn't analyze that idea.",
        );
      setProject((current) =>
        current
          ? {
              ...current,
              canonicalState: data.state,
              version: data.version,
              description: rawIdea.trim(),
            }
          : current,
      );
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: "I have updated the project understanding. I am checking the next decision that could change the product shape.",
        },
      ]);
      await fetchQuestion();
    } catch (cause) {
      setPageError(
        cause instanceof Error
          ? cause.message
          : "RockFoundry couldn't analyze that idea.",
      );
      setMessages((current) => [
        ...current,
        {
          id: `error-${Date.now()}`,
          role: "system",
          text: "I couldn't update the project yet. You can retry without losing the conversation.",
        },
      ]);
    } finally {
      setWorking(false);
    }
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = composer.trim();
    if (!text || working) return;
    setComposer("");
    if (!project?.description || messages.length <= 2) {
      await runExtraction(text);
      return;
    }
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", text },
      {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: "I have noted that. I will use it as project context and keep the next question focused.",
      },
    ]);
  }

  async function answerQuestion(option: QuestionOption | string) {
    if (!projectId || !question || working) return;
    const answer = typeof option === "string" ? option : option.id;
    setWorking(true);
    setMessages((current) => [
      ...current,
      {
        id: `answer-${Date.now()}`,
        role: "user",
        text: typeof option === "string" ? option : option.label,
      },
    ]);
    try {
      const response = await fetch(`/api/projects/${projectId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, answer }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "RockFoundry couldn't save that decision.",
        );
      setProject((current) =>
        current
          ? { ...current, canonicalState: data.state, version: data.version }
          : current,
      );
      setQuestion(null);
      setMessages((current) => [
        ...current,
        {
          id: `decision-${Date.now()}`,
          role: "assistant",
          text: "Decision recorded. I will recalculate readiness and look for the next unresolved requirement.",
        },
      ]);
      await fetchQuestion();
    } catch (cause) {
      setPageError(
        cause instanceof Error
          ? cause.message
          : "RockFoundry couldn't save that decision.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function addReferenceFromMessage(text: string) {
    const url = text.match(/https?:\/\/[^\s)]+/)?.[0];
    if (!url || !projectId || working) return false;
    setWorking(true);
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", text },
      {
        id: `tool-${Date.now()}`,
        role: "tool",
        text: `Inspecting ${new URL(url).hostname}...`,
        detail: "Public reference content is treated as untrusted evidence.",
      },
    ]);
    try {
      const type = url.includes("github.com/") ? "GITHUB_REPO" : "URL";
      const response = await fetch(`/api/projects/${projectId}/references`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, url }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "RockFoundry couldn't inspect that reference.",
        );
      setReferences((current) => [data.reference, ...current]);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: "Reference added. I will use it as evidence for the project conversation, not as instructions to copy.",
        },
      ]);
      return true;
    } catch (cause) {
      setPageError(
        cause instanceof Error
          ? cause.message
          : "RockFoundry couldn't inspect that reference.",
      );
      return false;
    } finally {
      setWorking(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = composer.trim();
    if (text && /https?:\/\//.test(text)) {
      const handled = await addReferenceFromMessage(text);
      if (handled) setComposer("");
      return;
    }
    await sendMessage();
  }

  async function exportProject() {
    if (!projectId || exporting) return;
    setExporting(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/export`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "RockFoundry couldn't generate the documents.",
        );
      setExportReady(Boolean(data.downloadUrl));
      setMessages((current) => [
        ...current,
        {
          id: `artifact-${Date.now()}`,
          role: "tool",
          text: "BRD, PRD, and ERD generated",
          detail: "The documents are ready to preview or download.",
        },
      ]);
    } catch (cause) {
      setPageError(
        cause instanceof Error
          ? cause.message
          : "RockFoundry couldn't generate the documents.",
      );
    } finally {
      setExporting(false);
    }
  }

  if (loading)
    return (
      <div className="rf-loading" role="status">
        Loading project...
      </div>
    );
  if (!project)
    return (
      <div className="rf-loading" role="alert">
        {pageError || "Project unavailable."}
      </div>
    );

  return (
    <main className="rf-app flex min-h-[100dvh] bg-background text-foreground">
      <aside className="rf-sidebar hidden w-[264px] shrink-0 flex-col border-r border-border/70 bg-sidebar px-3 py-4 lg:flex">
        <div className="flex items-center justify-between px-2 pb-5">
          <button
            className="flex items-center gap-2 text-sm font-semibold tracking-tight"
            type="button"
            onClick={() => router.push("/")}
          >
            <span className="rf-mark" aria-hidden="true">
              R
            </span>{" "}
            ROCKFOUNDRY
          </button>
          <button
            className="rf-icon-button"
            type="button"
            aria-label="Search projects"
          >
            <Search className="size-4" />
          </button>
        </div>
        <button
          className="rf-new-project"
          type="button"
          onClick={() => router.push("/")}
        >
          <Plus className="size-4" /> New project
        </button>
        <div className="mt-7 px-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Recent
        </div>
        <button
          className="rf-project-item mt-2"
          type="button"
          aria-current="page"
        >
          {project.name}
        </button>
        <div className="mt-auto border-t border-border/70 pt-3">
          <button
            className="rf-sidebar-link"
            type="button"
            onClick={() => setDrawer("settings")}
          >
            <Settings2 className="size-4" /> Settings
          </button>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="rf-topbar flex h-14 items-center gap-3 border-b border-border/70 px-4 lg:px-7">
          <button
            className="rf-icon-button lg:hidden"
            type="button"
            aria-label="Open projects"
          >
            <Menu className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{project.name}</div>
            <button
              type="button"
              className="rf-status-line"
              onClick={() => setDrawer("context")}
            >
              Discovery: {score}% · {openQuestionCount} important decision
              {openQuestionCount === 1 ? "" : "s"} remaining
            </button>
          </div>
          <button
            className="rf-header-action hidden sm:inline-flex"
            type="button"
            onClick={() => setDrawer("documents")}
          >
            <FileText className="size-3.5" /> Documents
          </button>
          <button
            className="rf-icon-button"
            type="button"
            aria-label="Open project menu"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="rf-conversation mx-auto w-full max-w-[820px] flex-1 overflow-y-auto px-4 pb-36 pt-8 sm:px-8">
            {visibleMessages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                activityOpen={activityOpen}
                onToggleActivity={() => setActivityOpen((current) => !current)}
                onAnswer={answerQuestion}
              />
            ))}
            {working && (
              <div className="rf-typing" role="status">
                <span className="rf-pulse-dot" /> RockFoundry is thinking
                through the next useful step...
              </div>
            )}
            {pageError && (
              <div className="rf-error" role="alert">
                <span>{pageError}</span>
                <button type="button" onClick={() => setPageError("")}>
                  <X className="size-4" />
                </button>
              </div>
            )}
            {!question && !working && messages.length > 2 && (
              <div className="mx-auto mt-10 max-w-md text-center text-xs text-muted-foreground">
                Keep describing the product, paste a reference URL, or open
                Documents when you want a draft.
              </div>
            )}
          </div>

          <div className="rf-composer-dock">
            <form
              onSubmit={handleSubmit}
              className="mx-auto w-full max-w-[820px] px-4 sm:px-8"
            >
              <div className="relative">
                <label className="sr-only" htmlFor="project-composer">
                  Message RockFoundry
                </label>
                <textarea
                  id="project-composer"
                  value={composer}
                  onChange={(event) => setComposer(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleSubmit(
                        event as unknown as FormEvent<HTMLFormElement>,
                      );
                    }
                  }}
                  placeholder="Message RockFoundry..."
                  rows={1}
                  className="rf-composer min-h-[54px] w-full resize-none pr-14"
                  disabled={working}
                />
                <button
                  className="rf-send-button absolute bottom-2.5 right-3"
                  type={working ? "button" : "submit"}
                  disabled={working ? false : !composer.trim()}
                  onClick={working ? () => setWorking(false) : undefined}
                  aria-label={working ? "Stop generation" : "Send message"}
                >
                  {working ? (
                    <Square className="size-3.5 fill-current" />
                  ) : (
                    <ArrowUp className="size-4" />
                  )}
                </button>
              </div>
              <div className="flex items-center justify-between px-1 py-2 text-[11px] text-muted-foreground">
                <span>Enter to send · Shift+Enter for a new line</span>
                <span>{status}</span>
              </div>
            </form>
          </div>
        </div>
      </section>

      {drawer && (
        <DrawerPanel
          drawer={drawer}
          project={project}
          state={state}
          references={references}
          exportReady={exportReady}
          exporting={exporting}
          onClose={() => setDrawer(null)}
          onExport={exportProject}
          onDownload={() =>
            window.location.assign(`/api/projects/${projectId}/export`)
          }
        />
      )}
    </main>
  );
}

function MessageRow({
  message,
  activityOpen,
  onToggleActivity,
  onAnswer,
}: {
  message: Message;
  activityOpen: boolean;
  onToggleActivity: () => void;
  onAnswer: (option: QuestionOption | string) => void;
}) {
  if (message.role === "tool") {
    return (
      <div className="rf-tool-row">
        <button
          type="button"
          className="flex w-full items-center gap-2 text-left"
          onClick={onToggleActivity}
        >
          <span className="rf-tool-check">✓</span>
          <span className="flex-1 text-sm">{message.text}</span>
          {activityOpen ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </button>
        {activityOpen && (
          <div className="mt-2 pl-7 text-xs leading-5 text-muted-foreground">
            {message.detail ||
              "Tool activity is shown at a useful level. Raw payloads remain hidden."}
          </div>
        )}
      </div>
    );
  }
  if (message.role === "system")
    return (
      <div className="rf-system-row" role="status">
        {message.text}
      </div>
    );
  const isUser = message.role === "user";
  return (
    <div
      className={`rf-message-row ${isUser ? "rf-message-user" : "rf-message-agent"}`}
    >
      <div
        className={`rf-avatar ${isUser ? "rf-avatar-user" : "rf-avatar-agent"}`}
      >
        {isUser ? "You" : "R"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-xs font-medium text-muted-foreground">
          {isUser ? "You" : "RockFoundry"}
        </div>
        <div className="rf-message-text">{message.text}</div>
        {message.detail && (
          <div className="mt-2 text-xs leading-5 text-muted-foreground">
            {message.detail}
          </div>
        )}
        {message.options && (
          <div className="mt-4 space-y-2">
            {message.options.map((option) => (
              <button
                key={option.id}
                type="button"
                className="rf-option"
                onClick={() => onAnswer(option)}
              >
                <span>
                  <span className="font-medium">{option.label}</span>
                  {option.description && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  )}
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
        {message.recommendation && (
          <p className="mt-3 text-xs italic text-muted-foreground">
            Recommendation: {message.recommendation}
          </p>
        )}
      </div>
    </div>
  );
}

function DrawerPanel({
  drawer,
  project,
  state,
  references,
  exportReady,
  exporting,
  onClose,
  onExport,
  onDownload,
}: {
  drawer: Exclude<Drawer, null>;
  project: ProjectData;
  state: any;
  references: Reference[];
  exportReady: boolean;
  exporting: boolean;
  onClose: () => void;
  onExport: () => void;
  onDownload: () => void;
}) {
  const title =
    drawer === "context"
      ? "Project context"
      : drawer === "documents"
        ? "Documents"
        : "AI Provider";
  return (
    <div className="rf-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="rf-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-border/70 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{project.name}</p>
          </div>
          <button
            className="rf-icon-button"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        {drawer === "context" && (
          <ContextContent state={state} references={references} />
        )}
        {drawer === "documents" && (
          <DocumentsContent
            state={state}
            exportReady={exportReady}
            exporting={exporting}
            onExport={onExport}
            onDownload={onDownload}
          />
        )}
        {drawer === "settings" && <ProviderContent />}
      </aside>
    </div>
  );
}

function ContextContent({
  state,
  references,
}: {
  state: any;
  references: Reference[];
}) {
  const decisions = state.decisions || [];
  const assumptions = state.assumptions || [];
  const contradictions = state.contradictions || [];
  return (
    <div className="space-y-7 overflow-y-auto px-5 py-5">
      <div>
        <div className="mb-2 flex items-center justify-between text-xs">
          <span>Business</span>
          <span>{state.readiness?.business ?? "-"}</span>
        </div>
        <div className="rf-meter">
          <span style={{ width: `${state.readiness?.business ?? 40}%` }} />
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between text-xs">
          <span>Product</span>
          <span>{state.readiness?.product ?? "-"}</span>
        </div>
        <div className="rf-meter">
          <span style={{ width: `${state.readiness?.product ?? 28}%` }} />
        </div>
      </div>
      <ContextList
        title="Decisions"
        items={decisions.map(
          (item: any) => item.title || item.description || String(item),
        )}
        empty="No confirmed decisions yet."
      />
      <ContextList
        title="Assumptions"
        items={assumptions.map((item: any) => item.statement || String(item))}
        empty="No assumptions yet."
      />
      <ContextList
        title="Contradictions"
        items={contradictions.map(
          (item: any) => item.explanation || String(item),
        )}
        empty="No contradictions found."
      />
      <ContextList
        title="References"
        items={references.map((item) => item.url)}
        empty="No references yet."
      />
    </div>
  );
}

function ContextList({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h3>
      {items.length ? (
        <ul className="space-y-2 text-sm leading-5">
          {items.slice(0, 6).map((item, index) => (
            <li
              key={`${item}-${index}`}
              className="border-b border-border/50 pb-2 last:border-0"
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

function DocumentsContent({
  state,
  exportReady,
  exporting,
  onExport,
  onDownload,
}: {
  state: any;
  exportReady: boolean;
  exporting: boolean;
  onExport: () => void;
  onDownload: () => void;
}) {
  const status = state.readiness ? projectStatus(state) : "Draft";
  return (
    <div className="space-y-5 px-5 py-5">
      <p className="text-sm leading-6 text-muted-foreground">
        Generate the three build documents from the current canonical state.
      </p>
      <div className="space-y-2">
        {["BRD", "PRD", "ERD"].map((doc) => (
          <div
            key={doc}
            className="flex items-center gap-3 border-b border-border/60 py-3"
          >
            <FileText className="size-4 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium">{doc}.md</span>
            <span className="text-xs text-muted-foreground">
              {exportReady ? "Ready" : status}
            </span>
          </div>
        ))}
      </div>
      <button
        className="rf-primary-button w-full"
        type="button"
        onClick={onExport}
        disabled={exporting}
      >
        {exporting ? (
          <>
            <RefreshCw className="size-4 animate-spin" /> Generating
          </>
        ) : (
          <>
            <FileText className="size-4" /> Generate documents
          </>
        )}
      </button>
      {exportReady && (
        <button
          className="rf-secondary-button w-full"
          type="button"
          onClick={onDownload}
        >
          Download project
        </button>
      )}
    </div>
  );
}

function ProviderContent() {
  return (
    <div className="space-y-5 px-5 py-5">
      <p className="text-sm leading-6 text-muted-foreground">
        Configure your own provider when RockFoundry needs AI. Credentials stay
        local and never enter project documents.
      </p>
      <label className="rf-field">
        Provider
        <select defaultValue="openai-compatible">
          <option value="openai-compatible">OpenAI Compatible</option>
          <option value="anthropic">Anthropic</option>
          <option value="gemini">Gemini</option>
          <option value="mock">Mock provider</option>
        </select>
      </label>
      <label className="rf-field">
        Base URL
        <input defaultValue="https://api.openai.com/v1" />
      </label>
      <label className="rf-field">
        API key
        <input type="password" placeholder="Stored locally" />
      </label>
      <label className="rf-field">
        Model
        <input placeholder="model-name" />
      </label>
      <button className="rf-secondary-button w-full" type="button">
        Test connection
      </button>
    </div>
  );
}
