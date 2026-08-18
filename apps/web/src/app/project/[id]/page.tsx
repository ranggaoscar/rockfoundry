/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  ChevronDown,
  ChevronRight,
  FileText,
  Menu,
  RefreshCw,
  Square,
  X,
} from "lucide-react";
import { SettingsPanel, useProviderStatus } from "@/components/settings-panel";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { humanTopicLabel } from "@/lib/topic-label";

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
  topic?: string;
  category?: string;
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
  topic?: string;
  category?: string;
  createdAt?: string;
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
        text: "What do you want to build?",
        detail:
          "Tell me the idea in plain language. I’ll surface the hidden decisions a coding agent would otherwise invent — then we’ll pay down Decision Debt before handoff.",
      },
    ];
  return [{ id: "idea", role: "user", text: idea }];
}

function projectStatus(state: any) {
  const readiness = String(state?.readiness || "NOT_READY").toUpperCase();
  if (readiness.includes("BUILD") || readiness.includes("MVP"))
    return "Safe to build";
  if (readiness.includes("DRAFT") || readiness.includes("PROTOTYPE"))
    return "Draft only";
  return "Not ready";
}

function discoverySummary(state: any) {
  const count = state?.discovery?.importantDecisionsRemaining;
  if (!state?.discovery?.evaluated || typeof count !== "number")
    return "Finding missing decisions";
  if (count === 0) return "Critical decisions locked";
  return `${count} high-risk decision${count === 1 ? "" : "s"} still open`;
}

function decisionDebtScore(state: any) {
  const score = state?.decisionDebt?.score;
  if (typeof score === "number")
    return Math.max(0, Math.min(100, Math.round(score)));
  return null;
}

function inventionRiskLabel(state: any) {
  const risk = String(state?.decisionDebt?.inventionRisk || "").toUpperCase();
  if (risk === "CRITICAL")
    return "Critical — coding agent would invent major rules";
  if (risk === "HIGH") return "High — several material rules still open";
  if (risk === "MEDIUM") return "Medium — draft possible, MVP still risky";
  if (risk === "LOW")
    return "Low — major rules are explicit enough to hand off";
  return "Invention risk not scored yet";
}

function readinessPlainLabel(state: any) {
  const status = projectStatus(state);
  if (status === "Safe to build")
    return "Build readiness: safe enough for MVP implementation";
  if (status === "Draft only")
    return "Build readiness: good for a draft, not a locked MVP";
  return "Build readiness: too much Decision Debt to build safely";
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
  const [renaming, setRenaming] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [recentProjects, setRecentProjects] = useState<
    Array<{ id: string; name: string; updatedAt?: string }>
  >([]);
  const [navOpen, setNavOpen] = useState(false);
  const conversationRef = useRef<HTMLDivElement>(null);
  const answeringRef = useRef(false);
  const provider = useProviderStatus();

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
    setMessages(
      data.messages?.length
        ? (data.messages as Message[])
        : initialMessages(data.project),
    );
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

  useEffect(() => {
    let active = true;
    fetch("/api/projects")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active || !data?.projects) return;
        setRecentProjects(
          (
            data.projects as Array<{
              id: string;
              name: string;
              updatedAt?: string;
            }>
          )
            .slice(0, 8)
            .map((item) => ({
              id: item.id,
              name: item.name,
              updatedAt: item.updatedAt,
            })),
        );
      })
      .catch(() => {
        /* best-effort sidebar */
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  const fetchQuestion = useCallback(async () => {
    if (!projectId) return;
    const response = await fetch(`/api/projects/${projectId}/questions`);
    if (!response.ok) return;
    const data = await response.json();
    setQuestion(data.questions?.[0] || null);
    if (data.readiness || data.decisionDebt) {
      setProject((current) =>
        current
          ? {
              ...current,
              canonicalState: {
                ...current.canonicalState,
                ...(data.readiness
                  ? {
                      readiness: data.readiness.level,
                      readinessScore: data.readiness.score,
                      readinessBreakdown: data.readiness.breakdown,
                    }
                  : {}),
                ...(data.decisionDebt
                  ? { decisionDebt: data.decisionDebt }
                  : {}),
                discovery: data.discovery || current.canonicalState.discovery,
              },
            }
          : current,
      );
    }
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
  const debtScore = decisionDebtScore(state);

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
        topic: question.topic,
        category: question.category,
      },
    ];
  }, [messages, question]);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (!conversation) return;
    window.requestAnimationFrame(() => {
      conversation.scrollTop = conversation.scrollHeight;
    });
  }, [visibleMessages.length, working]);

  async function runExtraction(rawIdea: string) {
    if (!projectId || !rawIdea.trim()) return;
    setWorking(true);
    setPageError("");
    setMessages((current) =>
      current.some(
        (message) => message.role === "user" && message.text === rawIdea.trim(),
      )
        ? current
        : [
            ...current,
            { id: `user-${Date.now()}`, role: "user", text: rawIdea.trim() },
          ],
    );
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
      const nextQuestion = data.question || null;
      setQuestion(nextQuestion);
      if (nextQuestion) {
        setMessages((current) => [
          ...current,
          {
            id: `question-${nextQuestion.id}`,
            role: "assistant",
            text: nextQuestion.text,
            detail: nextQuestion.reasonAsked,
            options: nextQuestion.options,
            recommendation: nextQuestion.recommendation,
            questionId: nextQuestion.id,
            topic: nextQuestion.topic,
            category: nextQuestion.category,
          },
        ]);
      }
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
    if (question) {
      await answerQuestion(text);
      return;
    }
    if (!project?.description) {
      await runExtraction(text);
      return;
    }
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", text },
    ]);
    await fetchQuestion();
  }

  async function reviseDecision(topic: string) {
    if (!projectId || !topic || working) return;
    setWorking(true);
    setDrawer(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "revise", topic }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "RockFoundry couldn't open that decision for revision.",
        );
      setProject((current) =>
        current
          ? { ...current, canonicalState: data.state, version: data.version }
          : current,
      );
      const nextQuestion = data.question || null;
      setQuestion(nextQuestion);
      if (nextQuestion) {
        setMessages((current) => [
          ...current,
          {
            id: `revise-${nextQuestion.id}-${Date.now()}`,
            role: "assistant",
            text: nextQuestion.text,
            detail:
              nextQuestion.reasonAsked ||
              "Revise this decision. The previous answer will be marked superseded.",
            options: nextQuestion.options,
            recommendation: nextQuestion.recommendation,
            questionId: nextQuestion.id,
            topic: nextQuestion.topic,
            category: nextQuestion.category,
          },
        ]);
      }
    } catch (cause) {
      setPageError(
        cause instanceof Error
          ? cause.message
          : "RockFoundry couldn't open that decision for revision.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function answerQuestion(
    option: QuestionOption | string,
    questionIdFromMessage?: string,
  ) {
    const activeQuestionId = questionIdFromMessage || question?.id;
    if (!projectId || !activeQuestionId || working || answeringRef.current)
      return;
    if (
      question &&
      questionIdFromMessage &&
      questionIdFromMessage !== question.id
    )
      return;
    answeringRef.current = true;
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
        body: JSON.stringify({ questionId: activeQuestionId, answer }),
      });
      const data = await response.json();
      if (response.status === 409) {
        await fetchQuestion();
        return;
      }
      if (!response.ok)
        throw new Error(
          data.error || "RockFoundry couldn't save that decision.",
        );
      setProject((current) =>
        current
          ? { ...current, canonicalState: data.state, version: data.version }
          : current,
      );
      const nextQuestion = data.question || null;
      setQuestion(nextQuestion);
      const affects = Array.isArray(data.decision?.affects)
        ? data.decision.affects.filter(Boolean)
        : [];
      const impactLines: Message[] = [];
      const impactHeadline =
        typeof data.impact?.headline === "string"
          ? data.impact.headline
          : affects.length
            ? `Locked. This decision affects ${affects.join(", ")}.`
            : "Decision recorded.";
      const impactDetailParts = [
        typeof data.impact?.detail === "string" ? data.impact.detail : "",
      ].filter(Boolean);
      if (data.decision || data.impact) {
        impactLines.push({
          id: `impact-${data.decision?.id || activeQuestionId}`,
          role: "assistant",
          text: impactHeadline,
          detail: impactDetailParts.join(" ") || undefined,
        });
      }
      if (nextQuestion && nextQuestion.id !== question?.id) {
        setMessages((current) => [
          ...current,
          ...impactLines,
          {
            id: `question-${nextQuestion.id}`,
            role: "assistant",
            text: nextQuestion.text,
            detail: nextQuestion.reasonAsked,
            options: nextQuestion.options,
            recommendation: nextQuestion.recommendation,
            questionId: nextQuestion.id,
            topic: nextQuestion.topic,
            category: nextQuestion.category,
          },
        ]);
      } else if (!nextQuestion) {
        setMessages((current) => [
          ...current,
          ...impactLines,
          {
            id: `readiness-${activeQuestionId}`,
            role: "assistant",
            text: "No critical blockers remain. The current decisions are enough to draft the build documents.",
          },
        ]);
      } else if (impactLines.length) {
        setMessages((current) => [...current, ...impactLines]);
      }
    } catch (cause) {
      setPageError(
        cause instanceof Error
          ? cause.message
          : "RockFoundry couldn't save that decision.",
      );
    } finally {
      answeringRef.current = false;
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
          text: "Reference added as evidence. Its interaction patterns stay separate from the product rules you still need to decide.",
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
          text: "Handoff package generated",
          detail:
            "BRD, PRD, ERD, DO_NOT_INVENT, decisions, invariants, readiness, and agent handoff are ready.",
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

  async function renameProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = projectNameDraft.trim();
    if (!name || !projectId || !project) return;
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, expectedVersion: project.version }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "RockFoundry couldn't rename this project.",
        );
      setProject(data.project);
      setRenaming(false);
    } catch (cause) {
      setPageError(
        cause instanceof Error
          ? cause.message
          : "RockFoundry couldn't rename this project.",
      );
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
    <main className="rf-app isolate flex h-dvh min-h-dvh overflow-hidden bg-background text-foreground">
      <WorkspaceSidebar
        projects={
          recentProjects.length
            ? recentProjects
            : [{ id: project.id, name: project.name }]
        }
        activeProjectId={project.id}
        provider={provider}
        mobileOpen={navOpen}
        onCloseMobile={() => setNavOpen(false)}
        onNewProject={() => router.push("/")}
        onOpenProject={(id) => {
          setNavOpen(false);
          if (id !== project.id) router.push(`/project/${id}`);
        }}
        onOpenSettings={() => {
          setNavOpen(false);
          setDrawer("settings");
        }}
      />

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="rf-topbar flex h-14 items-center gap-3 border-b border-border px-4 lg:px-6">
          <button
            className="rf-icon-button lg:hidden"
            type="button"
            aria-label="Open projects"
            onClick={() => setNavOpen(true)}
          >
            <Menu className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            {renaming ? (
              <form
                onSubmit={renameProject}
                className="flex max-w-sm items-center gap-2"
              >
                <label className="sr-only" htmlFor="project-name">
                  Project name
                </label>
                <input
                  id="project-name"
                  name="projectName"
                  value={projectNameDraft}
                  onChange={(event) => setProjectNameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setRenaming(false);
                  }}
                  className="rf-title-input min-w-0 flex-1"
                  autoFocus
                />
              </form>
            ) : (
              <button
                type="button"
                className="rf-project-title truncate text-left text-[16px] font-semibold"
                onClick={() => {
                  setProjectNameDraft(project.name);
                  setRenaming(true);
                }}
                aria-label="Rename project"
              >
                {project.name}
              </button>
            )}
            <button
              type="button"
              className="rf-status-line"
              onClick={() => setDrawer("context")}
              title={`${readinessPlainLabel(state)}. Decision Debt is invention risk for coding agents (higher is worse).`}
            >
              Decision Debt:{" "}
              {debtScore !== null ? (
                <span className="tabular-nums">{debtScore}</span>
              ) : (
                "—"
              )}{" "}
              · {discoverySummary(state)}
            </button>
          </div>
          <button
            className="rf-header-action hidden sm:inline-flex"
            type="button"
            onClick={() => setDrawer("context")}
          >
            Context
          </button>
          <button
            className="rf-header-action inline-flex"
            type="button"
            onClick={() => setDrawer("documents")}
          >
            <FileText className="size-3.5" /> Documents
          </button>
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={conversationRef}
            className="rf-conversation mx-auto min-h-0 w-full max-w-[820px] flex-1 overflow-y-auto px-4 pb-36 pt-5 sm:px-8 sm:pt-6"
          >
            {visibleMessages.map((message, index) => {
              const previous = visibleMessages[index - 1];
              const hidesAnswer =
                message.role === "user" &&
                Boolean(previous?.questionId && previous.options?.length);
              if (hidesAnswer) return null;
              return (
                <MessageRow
                  key={message.id}
                  message={message}
                  nextUserText={
                    visibleMessages
                      .slice(index + 1)
                      .find((item) => item.role === "user")?.text
                  }
                  activeQuestionId={question?.id}
                  working={working}
                  activityOpen={activityOpen}
                  onToggleActivity={() =>
                    setActivityOpen((current) => !current)
                  }
                  onAnswer={(option) =>
                    answerQuestion(option, message.questionId)
                  }
                />
              );
            })}
            {working && (
              <div className="rf-typing" role="status">
                <span className="rf-pulse-dot" /> Saving decision...
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
              className="mx-auto w-full max-w-[820px] px-4 pb-2 sm:px-8"
            >
              <div className="relative">
                <label className="sr-only" htmlFor="project-composer">
                  Message RockFoundry
                </label>
                <textarea
                  id="project-composer"
                  name="message"
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
                  placeholder={
                    question
                      ? "Answer naturally..."
                      : project.description
                        ? "Add context or a reference URL..."
                        : "Describe your idea..."
                  }
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
                <span>{provider.label}</span>
              </div>
            </form>
          </div>
        </div>
      </section>

      <SettingsPanel
        open={drawer === "settings"}
        onClose={() => setDrawer(null)}
      />
      {drawer && drawer !== "settings" && (
        <DrawerPanel
          drawer={drawer}
          project={project}
          state={state}
          references={references}
          exportReady={exportReady}
          exporting={exporting}
          working={working}
          onClose={() => setDrawer(null)}
          onExport={exportProject}
          onDownload={() =>
            window.location.assign(`/api/projects/${projectId}/export`)
          }
          onReviseDecision={reviseDecision}
        />
      )}
    </main>
  );
}

function MessageRow({
  message,
  nextUserText,
  activeQuestionId,
  working,
  activityOpen,
  onToggleActivity,
  onAnswer,
}: {
  message: Message;
  nextUserText?: string;
  activeQuestionId?: string;
  working: boolean;
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
  const isQuestion = Boolean(message.questionId && message.options?.length);
  const isActive =
    isQuestion && message.questionId === activeQuestionId && !working;
  const isResolvedQuestion =
    isQuestion && message.questionId !== activeQuestionId;
  if (isResolvedQuestion) {
    return (
      <div className="rf-message-row rf-message-agent">
        <div className="rf-avatar rf-avatar-agent">R</div>
        <div className="min-w-0 flex-1">
          <div className="rf-topic">{humanTopicLabel(message.topic)}</div>
          <div className="rf-resolved">
            <span aria-hidden="true">✓</span>
            <span>{nextUserText || message.text}</span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div
      className={`rf-message-row ${isUser ? "rf-message-user" : "rf-message-agent"}`}
    >
      <div
        className={`rf-avatar ${isUser ? "rf-avatar-user" : "rf-avatar-agent"}`}
      >
        {isUser ? "Y" : "R"}
      </div>
      <div className="min-w-0 flex-1">
        {isQuestion ? (
          <div className="rf-topic">{humanTopicLabel(message.topic)}</div>
        ) : isUser ? null : (
          <div className="mb-1 text-[12px] font-medium text-muted-foreground">
            RockFoundry
          </div>
        )}
        <div className={isQuestion ? "rf-question-text" : "rf-message-text"}>
          {message.text}
        </div>
        {message.detail && (
          <div className="mt-2 text-[13px] leading-5 text-muted-foreground">
            {isQuestion ? (
              <>
                <span className="font-medium text-foreground/80">
                  Why this matters
                </span>
                <span className="mt-0.5 block">{message.detail}</span>
              </>
            ) : (
              message.detail
            )}
          </div>
        )}
        {message.options && (
          <div className="mt-4 space-y-2">
            {message.options.map((option) => (
              <button
                key={option.id}
                type="button"
                className="rf-option"
                disabled={!isActive}
                aria-disabled={!isActive}
                onClick={() => onAnswer(option)}
              >
                <span>
                  <span className="font-medium">{option.label}</span>
                  {option.description && (
                    <span className="mt-0.5 block text-[12px] leading-5 text-muted-foreground">
                      {option.description}
                    </span>
                  )}
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            ))}
          </div>
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
  working,
  onClose,
  onExport,
  onDownload,
  onReviseDecision,
}: {
  drawer: Exclude<Drawer, null>;
  project: ProjectData;
  state: any;
  references: Reference[];
  exportReady: boolean;
  exporting: boolean;
  working: boolean;
  onClose: () => void;
  onExport: () => void;
  onDownload: () => void;
  onReviseDecision: (topic: string) => void;
}) {
  const title = drawer === "context" ? "Project context" : "Documents";
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
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
          <ContextContent
            state={state}
            references={references}
            working={working}
            onReviseDecision={onReviseDecision}
          />
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
      </aside>
    </div>
  );
}

function ContextContent({
  state,
  references,
  working,
  onReviseDecision,
}: {
  state: any;
  references: Reference[];
  working: boolean;
  onReviseDecision: (topic: string) => void;
}) {
  const decisions = (state.decisions || []).filter(
    (item: any) => item && item.status !== "SUPERSEDED",
  );
  const assumptions = state.assumptions || [];
  const contradictions = state.contradictions || [];
  const topRisks = state.decisionDebt?.topRisks || [];
  const debtScore = decisionDebtScore(state);
  const artifactGaps =
    typeof state.decisionDebt?.unresolvedArtifactSectionCount === "number"
      ? state.decisionDebt.unresolvedArtifactSectionCount
      : null;
  return (
    <div className="space-y-7 overflow-y-auto px-5 py-5">
      <section className="space-y-2">
        <h3 className="text-[12px] font-medium tracking-[0.04em] text-muted-foreground">
          Decision Debt
        </h3>
        <p className="text-sm leading-5 text-muted-foreground">
          Higher Decision Debt means a coding agent must invent more product
          rules — including unresolved artifact sections, not only open
          discovery questions.
        </p>
        <p className="text-sm leading-5">
          {debtScore !== null ? (
            <>
              <span className="font-medium tabular-nums">{debtScore}/100</span>
              {" · "}
              {inventionRiskLabel(state)}
              {artifactGaps !== null ? (
                <span className="text-muted-foreground">
                  {" · "}
                  {artifactGaps} artifact gaps
                </span>
              ) : null}
            </>
          ) : (
            "Decision Debt appears after discovery starts."
          )}
        </p>
        {state.decisionDebt?.summary ? (
          <p className="text-sm leading-5 text-muted-foreground">
            {state.decisionDebt.summary}
          </p>
        ) : null}
        <div className="rf-meter rf-meter-debt">
          <span style={{ width: `${debtScore ?? 0}%` }} />
        </div>
      </section>
      <section className="space-y-1">
        <h3 className="text-[12px] font-medium tracking-[0.04em] text-muted-foreground">
          Build readiness
        </h3>
        <p className="text-sm leading-5">{readinessPlainLabel(state)}</p>
        <p className="text-xs leading-5 text-muted-foreground">
          Ready score is coverage. Decision Debt is invention risk. Optimize
          both before export.
        </p>
      </section>
      <ContextList
        title="Top invention risks"
        items={topRisks.map((item: any) =>
          item.title && item.reason
            ? `${item.title}: ${item.reason}`
            : String(item.title || item.topic || item),
        )}
        empty="No ranked invention risks yet."
      />
      <div>
        <div className="mb-2 flex items-center justify-between text-xs">
          <span>Business coverage</span>
          <span className="tabular-nums">
            {state.readinessBreakdown?.business ?? "-"}%
          </span>
        </div>
        <div className="rf-meter">
          <span
            style={{ width: `${state.readinessBreakdown?.business ?? 0}%` }}
          />
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between text-xs">
          <span>Product coverage</span>
          <span className="tabular-nums">
            {state.readinessBreakdown?.product ?? "-"}%
          </span>
        </div>
        <div className="rf-meter">
          <span
            style={{ width: `${state.readinessBreakdown?.product ?? 0}%` }}
          />
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between text-xs">
          <span>Data coverage</span>
          <span className="tabular-nums">
            {state.readinessBreakdown?.data ?? "-"}%
          </span>
        </div>
        <div className="rf-meter">
          <span style={{ width: `${state.readinessBreakdown?.data ?? 0}%` }} />
        </div>
      </div>
      <section>
        <h3 className="mb-2 text-[12px] font-medium tracking-[0.04em] text-muted-foreground">
          Confirmed decisions
        </h3>
        {decisions.length ? (
          <ul className="space-y-2 text-sm leading-5">
            {decisions.slice(0, 8).map((item: any, index: number) => {
              const label =
                item.topic && item.decision
                  ? `${humanTopicLabel(item.topic)}: ${String(item.decision).replace(/[_-]+/g, " ")}`
                  : item.title || item.description || String(item);
              const canRevise = Boolean(item.topic);
              return (
                <li
                  key={`${item.id || item.topic || label}-${index}`}
                  className="flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-0"
                >
                  <span className="min-w-0 flex-1">{label}</span>
                  {canRevise ? (
                    <button
                      type="button"
                      className="rf-revise-button"
                      disabled={working}
                      onClick={() => onReviseDecision(String(item.topic))}
                    >
                      Revise
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No confirmed decisions yet.
          </p>
        )}
      </section>
      <ContextList
        title="Open decisions"
        items={(state.discovery?.unresolvedTopics || []).map((topic: string) =>
          humanTopicLabel(topic),
        )}
        empty="No high-impact decisions remain open."
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
      <h3 className="mb-2 text-[12px] font-medium tracking-[0.04em] text-muted-foreground">
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
  const primary = ["BRD.md", "PRD.md", "ERD.md"];
  const advanced = [
    "DO_NOT_INVENT.md",
    "DECISIONS.md",
    "INVARIANTS.md",
    "READINESS.md",
    "AGENT_HANDOFF.md",
    "decisions.json",
  ];
  return (
    <div className="space-y-5 px-5 py-5">
      <p className="text-sm leading-6 text-muted-foreground">
        Generate the working documents first. Advanced handoff files stay
        available in the same export.
      </p>
      <p className="text-xs leading-5 text-muted-foreground">
        {readinessPlainLabel(state)}
        {decisionDebtScore(state) !== null
          ? ` · Decision Debt ${decisionDebtScore(state)}/100`
          : ""}
      </p>
      <div className="space-y-2">
        {primary.map((doc) => (
          <div
            key={doc}
            className="flex items-center gap-3 border-b border-border/60 py-3"
          >
            <FileText className="size-4 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium">{doc}</span>
            <span className="text-xs text-muted-foreground">
              {exportReady ? "Ready" : status}
            </span>
          </div>
        ))}
      </div>
      <div>
        <h3 className="mb-2 text-[11px] font-medium tracking-[0.06em] text-muted-foreground">
          Advanced handoff
        </h3>
        <div className="space-y-1">
          {advanced.map((doc) => (
            <div
              key={doc}
              className="flex items-center gap-3 py-1.5 text-[13px] text-muted-foreground"
            >
              <span className="flex-1">{doc}</span>
              <span className="text-[11px]">
                {exportReady ? "Ready" : status}
              </span>
            </div>
          ))}
        </div>
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
            <FileText className="size-4" /> Generate handoff package
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
