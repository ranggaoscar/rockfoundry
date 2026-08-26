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
  Square,
  X,
} from "lucide-react";
import { SettingsPanel, useProviderStatus } from "@/components/settings-panel";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { DesignStudio } from "@/components/design-studio";
import { ProductDocuments } from "@/components/product-documents";
import { humanTopicLabel } from "@/lib/topic-label";
import { safeConversationFailureMessage } from "@/lib/ai-error-messages";
import type { ProjectStage } from "@/components/workspace-sidebar";
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
  answerType?: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "FREE_TEXT" | "BOOLEAN";
  options?: QuestionOption[];
  recommendation?: string;
  recommendedOptionId?: string;
  recommendationReason?: string;
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
  recommendedOptionId?: string;
  recommendationReason?: string;
  questionId?: string;
  topic?: string;
  category?: string;
  createdAt?: string;
  requestId?: string;
  userMessageId?: string;
  conversationTurnId?: string;
  turnStatus?: string;
  turnError?: string;
  retryable?: boolean;
  collapsed?: boolean;
};
type Activity = {
  id: string;
  toolName: string;
  status: string;
  inputSummary?: string | null;
  outputSummary?: string | null;
  failureReason?: string | null;
};
type Drawer = "context" | "documents" | "settings" | null;
type Workbench = "documents" | "design" | null;

const PACKAGE_PROGRESS_STAGES = [
  ["GENERATING_DOCUMENTS", "Menyusun dokumen"],
  ["BUILDING_SCREEN_MAP", "Merancang layar aplikasi"],
  ["BASELINE_DESIGN_SPEC", "Menyiapkan arah desain dasar"],
  ["FINALIZING_HANDOFF", "Menyiapkan handoff"],
] as const;

function isIndonesianProject(state: any) {
  return /\b(saya|mau|ingin|bikin|buat|membuat|dengan|untuk|dan|yang|aplikasi|supaya|agar|pesanan|pembayaran|kasir|warteg)\b/i.test(
    String(state?.rawIdea || state?.normalizedSummary || ""),
  );
}

function initialMessages(project: ProjectData): Message[] {
  const idea = project.description?.trim();
  const indo = isIndonesianProject(project.canonicalState || { rawIdea: idea });
  if (!idea)
    return [
      {
        id: "welcome",
        role: "assistant",
        text: indo ? "Mau bikin apa?" : "What do you want to build?",
        detail: indo
          ? "Ceritakan idenya dengan bahasa biasa. Setelah beberapa jawaban penting, kita susun Product Draft pertama dengan asumsi dan open question yang tetap terlihat."
          : "Tell me the idea in plain language. After a few meaningful answers, we’ll create a first Product Draft with assumptions and open questions kept visible.",
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

function PackageBuildStatus({
  job,
  onRetry,
}: {
  job: {
    status: string;
    stage: string;
    stageLabel: string;
    completedStages: string[];
    errorSummary?: string | null;
  };
  onRetry: () => void;
}) {
  const failed = job.status === "FAILED";
  const queued = job.status === "QUEUED";
  return (
    <section className="rf-package-status" aria-label="Final handoff status">
      <p>
        {failed
          ? "Pembuatan final handoff berhenti"
          : queued
            ? "Final handoff sedang disiapkan"
            : "Final handoff sedang dibuat"}
      </p>
      <p className="mt-1">
        {failed
          ? job.errorSummary || "Final handoff gagal. Coba lagi."
          : queued
            ? "Menunggu worker..."
            : job.stageLabel}
      </p>
      {!failed && (
        <ol aria-label="Tahapan final handoff">
          {PACKAGE_PROGRESS_STAGES.map(([stage, label]) => {
            const complete = job.completedStages.includes(stage);
            const current = !complete && job.stage === stage;
            return (
              <li
                key={stage}
                className={
                  complete || current
                    ? "text-foreground"
                    : "text-muted-foreground/70"
                }
              >
                <span className="mr-2" aria-hidden="true">
                  {complete ? "✓" : current ? "●" : "○"}
                </span>
                {label}
              </li>
            );
          })}
        </ol>
      )}
      {failed && (
        <button
          className="rf-primary-button mt-3"
          type="button"
          onClick={onRetry}
        >
          Coba lagi
        </button>
      )}
    </section>
  );
}

function PackageReadyActions({
  language,
  onDownload,
  onProductMap,
  onPrototype,
}: {
  language: "id" | "en";
  onDownload: () => void;
  onProductMap: () => void;
  onPrototype: () => void;
}) {
  const indo = language === "id";
  return (
    <section
      className="rf-package-status"
      aria-label={indo ? "Final handoff siap" : "Final handoff ready"}
    >
      <p className="text-foreground">
        {indo ? "Final handoff siap." : "Final handoff is ready."}
      </p>
      <p className="mt-1">
        {indo
          ? "Artifact terbaru dan referensi design sudah bisa diunduh."
          : "The latest artifacts and design references are ready to download."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="rf-primary-button"
          type="button"
          onClick={onDownload}
        >
          Download final handoff
        </button>
        <button
          className="rf-header-action inline-flex"
          type="button"
          onClick={onProductMap}
        >
          {indo ? "Lihat documents" : "View documents"}
        </button>
        <button
          className="rf-header-action inline-flex"
          type="button"
          onClick={onPrototype}
        >
          {indo ? "Buat prototype dengan AI" : "Build prototype with AI"}
        </button>
      </div>
    </section>
  );
}

function isDesignIntent(text: string) {
  return /\b(buat design|bikin design|generate design|buat prototype|bikin prototype)\b/i.test(
    text,
  );
}

function projectStageFromState(state: unknown): ProjectStage {
  if (!state || typeof state !== "object") return "idea";
  const record = state as Record<string, unknown>;
  const studio =
    record.studio && typeof record.studio === "object"
      ? (record.studio as Record<string, unknown>)
      : null;
  if (typeof studio?.currentVersion === "number" && studio.currentVersion > 0) {
    return "design";
  }
  if (Array.isArray(record.decisions) && record.decisions.length > 0) {
    return "spec";
  }
  if (record.readiness) return "spec";
  return "idea";
}

function thinkingCopy(elapsed: number, indo: boolean) {
  if (elapsed < 4) {
    return indo ? "Memahami idemu" : "Understanding your idea";
  }
  if (elapsed < 10) {
    return indo
      ? "Menemukan asumsi penting"
      : "Identifying important assumptions";
  }
  return indo ? "Memikirkan alur kerjanya" : "Thinking through the workflow";
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
  const [activity, setActivity] = useState<Activity[]>([]);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [workbench, setWorkbench] = useState<Workbench>(null);
  const [draftGenerationRequestId, setDraftGenerationRequestId] = useState(0);
  const [draftGenerationInFlight, setDraftGenerationInFlight] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [retryingTurnId, setRetryingTurnId] = useState<string | null>(null);
  const [initialTurnStatus, setInitialTurnStatus] = useState<
    "IDLE" | "RUNNING" | "COMPLETED" | "FAILED"
  >("IDLE");
  const [initialTurnError, setInitialTurnError] = useState("");
  const [thinkingElapsedSec, setThinkingElapsedSec] = useState(0);
  const [pageError, setPageError] = useState("");
  const [exportReady, setExportReady] = useState(false);
  const [prototypeLaunchRequested, setPrototypeLaunchRequested] =
    useState(false);
  const [packageJob, setPackageJob] = useState<{
    id: string;
    status: string;
    stage: string;
    stageLabel: string;
    completedStages: string[];
    errorSummary?: string | null;
  } | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [recentProjects, setRecentProjects] = useState<
    Array<{
      id: string;
      name: string;
      updatedAt?: string;
      stage?: ProjectStage;
    }>
  >([]);
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const conversationRef = useRef<HTMLDivElement>(null);
  const pendingDesignRef = useRef(false);
  const initialTurnStartedRef = useRef(false);
  const activeConversationRef = useRef<{
    controller: AbortController;
    generation: number;
  } | null>(null);
  const conversationGenerationRef = useRef(0);
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
    setExportReady(false);
    setActivity(data.activity || []);
    setMessages(
      data.messages?.length
        ? (data.messages as Message[])
        : initialMessages(data.project),
    );
    return data.project as ProjectData;
  }, []);

  const runInitialTurn = useCallback(
    async (id: string, rawIdea: string, retry = false) => {
      if (!rawIdea.trim()) return;
      setInitialTurnError("");
      setInitialTurnStatus("RUNNING");
      setWorking(true);
      try {
        const response = await fetch(`/api/projects/${id}/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rawIdea: rawIdea.trim(), retry }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            data.error ||
              "RockFoundry couldn't reach the configured AI provider. Retry or open Provider Settings.",
          );
        }
        if (data.state && typeof data.version === "number") {
          setProject((current) =>
            current
              ? {
                  ...current,
                  canonicalState: data.state,
                  version: data.version,
                }
              : current,
          );
        }
        setInitialTurnStatus(
          data.status === "RUNNING"
            ? "RUNNING"
            : data.status === "FAILED"
              ? "FAILED"
              : "COMPLETED",
        );
        if (typeof data.message === "string" && data.message.trim()) {
          setMessages((current) =>
            current.some((message) => message.role === "assistant")
              ? current
              : [
                  ...current,
                  {
                    id: `initial-assistant-${Date.now()}`,
                    role: "assistant",
                    text: data.message,
                  },
                ],
          );
        } else if (data.status === "RUNNING") {
          const refreshed = await fetchProject(id);
          setInitialTurnStatus(
            refreshed.canonicalState?.generationMetadata?.initialConversation
              ?.status === "COMPLETED"
              ? "COMPLETED"
              : "RUNNING",
          );
        }
      } catch (cause) {
        const message =
          cause instanceof Error
            ? cause.message
            : "RockFoundry couldn't reach the configured AI provider. Retry or open Provider Settings.";
        setInitialTurnStatus("FAILED");
        setInitialTurnError(message);
      } finally {
        setWorking(false);
      }
    },
    [fetchProject],
  );

  useEffect(() => {
    let cancelled = false;
    params.then(({ id }) => {
      if (cancelled) return;
      setProjectId(id);
      fetchProject(id)
        .then(async (loaded) => {
          if (cancelled) return;
          const statusResponse = await fetch(`/api/projects/${id}/extract`);
          const status = statusResponse.ok
            ? await statusResponse.json().catch(() => null)
            : null;
          if (cancelled) return;
          if (status?.status === "COMPLETED") {
            setInitialTurnStatus("COMPLETED");
            if (typeof status.message === "string") {
              setMessages((current) =>
                current.some((message) => message.role === "assistant")
                  ? current
                  : [
                      ...current,
                      {
                        id: `initial-assistant-${Date.now()}`,
                        role: "assistant",
                        text: status.message,
                      },
                    ],
              );
            }
          } else if (
            !initialTurnStartedRef.current &&
            status?.status !== "FAILED"
          ) {
            initialTurnStartedRef.current = true;
            void runInitialTurn(
              id,
              loaded.description || loaded.canonicalState?.rawIdea || "",
            );
          } else if (status?.status === "FAILED") {
            setInitialTurnStatus("FAILED");
            setInitialTurnError(
              "RockFoundry belum berhasil memahami ide ini. Coba lagi atau buka Provider Settings.",
            );
          }
        })
        .catch((cause) =>
          setPageError(
            cause instanceof Error
              ? cause.message
              : "RockFoundry couldn't load this project.",
          ),
        )
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [fetchProject, params, runInitialTurn]);

  useEffect(() => {
    if (!projectId || initialTurnStatus !== "RUNNING") return;
    let cancelled = false;
    const poll = window.setInterval(async () => {
      const response = await fetch(`/api/projects/${projectId}/extract`);
      if (!response.ok || cancelled) return;
      const status = await response.json().catch(() => null);
      if (cancelled || !status) return;
      if (status.status === "COMPLETED") {
        setInitialTurnStatus("COMPLETED");
        if (typeof status.message === "string") {
          setMessages((current) =>
            current.some((message) => message.role === "assistant")
              ? current
              : [
                  ...current,
                  {
                    id: `initial-assistant-${Date.now()}`,
                    role: "assistant",
                    text: status.message,
                  },
                ],
          );
        }
        if (status.state && typeof status.version === "number") {
          setProject((current) =>
            current
              ? {
                  ...current,
                  canonicalState: status.state,
                  version: status.version,
                }
              : current,
          );
        }
      } else if (status.status === "FAILED") {
        setInitialTurnStatus("FAILED");
        setInitialTurnError(
          "RockFoundry belum berhasil memahami ide ini. Coba lagi atau buka Provider Settings.",
        );
      }
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [initialTurnStatus, projectId]);

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
              canonicalState?: unknown;
            }>
          )
            .slice(0, 8)
            .map((item) => ({
              id: item.id,
              name: item.name,
              updatedAt: item.updatedAt,
              stage: projectStageFromState(item.canonicalState),
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

  useEffect(() => {
    if (!working) return;
    let cancelled = false;
    const startedAt = Date.now();
    const tick = () => {
      if (cancelled) return;
      setThinkingElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    };
    const kickoff = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(kickoff);
      window.clearInterval(interval);
    };
  }, [working]);

  const state = project?.canonicalState || {};
  const indo = isIndonesianProject(state);
  const thinkingStatus = thinkingCopy(thinkingElapsedSec, indo);
  const initialTurnWorking = initialTurnStatus === "RUNNING";
  const packageReady = Boolean(
    exportReady || packageJob?.status === "COMPLETED",
  );
  const draftAvailable = Boolean(
    state.rawIdea?.trim() || state.normalizedSummary?.trim(),
  );
  const designReady = packageReady || draftAvailable;

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

  async function sendMessage(event?: FormEvent, directText?: string) {
    event?.preventDefault();
    const submittedText = (directText ?? composer).trim();
    if (!submittedText || working || initialTurnStatus === "RUNNING") return;
    setComposer("");
    const optimisticId = `user-${crypto.randomUUID()}`;
    const controller = new AbortController();
    const generation = conversationGenerationRef.current + 1;
    conversationGenerationRef.current = generation;
    activeConversationRef.current = { controller, generation };
    const isCurrent = () =>
      activeConversationRef.current?.generation === generation;
    setMessages((current) => [
      ...current,
      { id: optimisticId, role: "user", text: submittedText },
    ]);
    setWorking(true);
    try {
      const requestId = crypto.randomUUID();
      const response = await fetch(`/api/projects/${projectId}/conversation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-conversation-request-id": requestId,
        },
        body: JSON.stringify({ text: submittedText }),
        signal: controller.signal,
      });
      if (!isCurrent()) return;
      const data = await response.json().catch(() => ({}));
      if (!isCurrent()) return;
      if (response.status === 202 || data.turn?.status === "RUNNING") {
        setMessages((current) =>
          current.map((message) =>
            message.id === optimisticId
              ? {
                  ...message,
                  userMessageId: data.userMessageId || message.userMessageId,
                  conversationTurnId:
                    data.turn?.id || message.conversationTurnId,
                  turnStatus: "RUNNING",
                  retryable: false,
                }
              : message,
          ),
        );
        return;
      }
      if (!response.ok) {
        const retryFailureMessage = safeConversationFailureMessage(data.error);
        if (data.retryable && data.userMessageId) {
          setMessages((current) =>
            current.map((message) =>
              message.id === optimisticId
                ? {
                    ...message,
                    userMessageId: data.userMessageId,
                    conversationTurnId: data.turn?.id,
                    turnStatus: "FAILED",
                    turnError: retryFailureMessage,
                    retryable: true,
                  }
                : message,
            ),
          );
        }
        throw new Error(
          data.retryable
            ? retryFailureMessage
            : data.error || "RockFoundry couldn't process that message.",
        );
      }
      setProject((current) =>
        current
          ? { ...current, canonicalState: data.state, version: data.version }
          : current,
      );
      setQuestion(null);
      const quickReplies = Array.isArray(data.quickReplies)
        ? data.quickReplies
            .filter(
              (item: unknown): item is { label: string; value?: string } =>
                item !== null &&
                typeof item === "object" &&
                "label" in item &&
                typeof item.label === "string",
            )
            .map((item: { label: string; value?: string }) => ({
              id: item.value || item.label,
              label: item.label,
            }))
        : [];
      setMessages((current) => [
        ...current.filter((message) => message.id !== optimisticId),
        {
          id: data.userMessageId || optimisticId,
          role: "user",
          text: submittedText,
          requestId: data.requestId || requestId,
          userMessageId: data.userMessageId,
          conversationTurnId: data.turn?.id,
          turnStatus: data.turn?.status,
        },
        {
          id: `assistant-${crypto.randomUUID()}`,
          role: "assistant",
          text:
            typeof data.message === "string"
              ? data.message
              : "RockFoundry updated the product context.",
          options: quickReplies.length ? quickReplies : undefined,
        },
      ]);
      if (isDesignIntent(submittedText)) {
        pendingDesignRef.current = false;
        setWorkbench("design");
        setPrototypeLaunchRequested(true);
      }
      await fetchReferences();
    } catch (cause) {
      if (!isCurrent() || controller.signal.aborted) return;
      setPageError(
        cause instanceof Error
          ? cause.message
          : "RockFoundry couldn't process that message.",
      );
    } finally {
      if (!isCurrent()) return;
      activeConversationRef.current = null;
      setWorking(false);
    }
  }

  async function retryMessage(message: Message) {
    const userMessageId = message.userMessageId || message.id;
    if (!projectId || !userMessageId || working || retryingTurnId) return;
    setPageError("");
    setRetryingTurnId(message.conversationTurnId || userMessageId);
    setWorking(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/conversation/retry`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userMessageId }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Retry failed.");
      setProject((current) =>
        current
          ? { ...current, canonicalState: data.state, version: data.version }
          : current,
      );
      await fetchProject(projectId);
    } catch (cause) {
      setPageError(cause instanceof Error ? cause.message : "Retry failed.");
    } finally {
      setRetryingTurnId(null);
      setWorking(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendMessage();
  }

  async function buildProductDraft() {
    if (!projectId || !project || working || draftGenerationInFlight) return;
    setPageError("");
    setDraftGenerationInFlight(true);
    setWorkbench("documents");
    setDraftGenerationRequestId((current) => current + 1);
  }

  async function buildProductPackage() {
    if (
      !projectId ||
      !project ||
      working ||
      ["QUEUED", "RUNNING"].includes(packageJob?.status || "")
    )
      return;
    setPageError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/package`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "RockFoundry couldn't start the product package.",
        );
      setPackageJob(data.job);
      setDrawer(null);
    } catch (cause) {
      setPageError(
        cause instanceof Error
          ? cause.message
          : "RockFoundry couldn't start the product package.",
      );
    }
  }

  useEffect(() => {
    if (!projectId || packageJob) return;
    void fetch(`/api/projects/${projectId}/package`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data?.job) return;
        setPackageJob(data.job);
        if (data.job.status === "COMPLETED") {
          setExportReady(true);
          setWorkbench("design");
          if (pendingDesignRef.current) setPrototypeLaunchRequested(true);
        }
      })
      .catch(() => undefined);
  }, [packageJob, projectId]);

  useEffect(() => {
    if (
      !projectId ||
      !packageJob ||
      ["COMPLETED", "FAILED"].includes(packageJob.status)
    )
      return;
    const poll = window.setInterval(async () => {
      const response = await fetch(`/api/projects/${projectId}/package`);
      if (!response.ok) return;
      const data = await response.json();
      if (!data.job) return;
      setPackageJob(data.job);
      if (data.job.status === "COMPLETED") {
        await fetchProject(projectId);
        setExportReady(true);
        setWorkbench("design");
        if (pendingDesignRef.current) {
          setPrototypeLaunchRequested(true);
          pendingDesignRef.current = false;
        }
        setMessages((current) =>
          current.some((message) => message.id === `package-${data.job.id}`)
            ? current
            : [
                ...current,
                {
                  id: `package-${data.job.id}`,
                  role: "assistant",
                  text: indo
                    ? "Handoff final sudah tersusun. Design workbench terbuka di kanan."
                    : "The final handoff is assembled. The Design workbench is open on the right.",
                },
              ],
        );
      }
      if (data.job.status === "FAILED")
        setPageError(
          data.job.errorSummary ||
            "Package generation failed. Retry the build.",
        );
    }, 1000);
    return () => window.clearInterval(poll);
  }, [fetchProject, indo, packageJob, projectId]);

  async function reviseDecision(topic: string) {
    if (!projectId || !topic || working) return;
    setWorking(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/questions?revise=${encodeURIComponent(topic)}`,
      );
      const data = await response.json();
      if (!response.ok || !data.questions?.[0])
        throw new Error("That decision is not available for revision.");
      const nextQuestion = data.questions[0] as Question;
      setQuestion(nextQuestion);
      setMessages((current) => [
        ...current,
        {
          id: `revise-${nextQuestion.id}-${Date.now()}`,
          role: "assistant",
          text: nextQuestion.text,
          detail: nextQuestion.reasonAsked,
          options: nextQuestion.options,
          questionId: nextQuestion.id,
          topic: nextQuestion.topic,
          category: nextQuestion.category,
        },
      ]);
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
            : [
                {
                  id: project.id,
                  name: project.name,
                  stage: projectStageFromState(state),
                },
              ]
        }
        activeProjectId={project.id}
        provider={provider}
        mobileOpen={navOpen}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((current) => !current)}
        onCloseMobile={() => setNavOpen(false)}
        onGoHome={() => {
          setNavOpen(false);
          router.push("/");
        }}
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
        <header className="rf-topbar flex min-h-12 items-center gap-2 border-b border-border px-3 py-2 lg:px-5">
          <button
            className="rf-icon-button lg:hidden"
            type="button"
            aria-label="Open projects"
            onClick={() => setNavOpen(true)}
          >
            <Menu className="size-4 shrink-0" />
            <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" />
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
                className="rf-project-title block max-w-full truncate text-left text-[1rem] font-semibold"
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
              className="rf-status-line hidden sm:block"
              onClick={() => setWorkbench("documents")}
              title={
                draftAvailable
                  ? "Open the current Product Draft"
                  : "Open the product idea"
              }
            >
              {draftAvailable
                ? indo
                  ? "Product draft tersedia"
                  : "Product draft available"
                : indo
                  ? "Ide produk"
                  : "Product idea"}
            </button>
          </div>
          <button
            className="rf-header-action hidden sm:inline-flex"
            type="button"
            data-active={workbench === "documents"}
            onClick={() =>
              setWorkbench(workbench === "documents" ? null : "documents")
            }
          >
            Documents
          </button>
          <button
            className="rf-header-action hidden sm:inline-flex"
            type="button"
            data-active={workbench === "design"}
            onClick={() =>
              setWorkbench(workbench === "design" ? null : "design")
            }
          >
            Design
          </button>
          <button
            className="rf-header-action inline-flex"
            type="button"
            aria-label="Handoff"
            onClick={() => setDrawer("documents")}
          >
            <FileText className="size-3.5 shrink-0" />
            <span className="max-sm:hidden">Handoff</span>
          </button>
        </header>

        <div
          className="rf-studio-frame relative min-h-0 flex-1"
          data-workbench={workbench ? "open" : "closed"}
        >
          <div className="rf-chat-pane relative flex min-h-0 flex-col">
            <div
              ref={conversationRef}
              className="rf-conversation mx-auto min-h-0 w-full max-w-[46rem] flex-1 overflow-y-auto px-4 pb-64 pt-5 sm:px-7"
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
                    language={indo ? "id" : "en"}
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
                    onAnswer={(option) => {
                      if (
                        typeof option === "object" &&
                        option !== null &&
                        "retryable" in option &&
                        option.retryable
                      ) {
                        void retryMessage(option as Message);
                        return;
                      }
                      void sendMessage(
                        undefined,
                        typeof option === "string"
                          ? option
                          : "label" in option
                            ? option.label
                            : "",
                      );
                    }}
                  />
                );
              })}
              {working || initialTurnWorking ? (
                <div className="rf-typing" role="status" aria-live="polite">
                  <span className="rf-pulse-dot" />
                  {initialTurnWorking
                    ? indo
                      ? "RockFoundry sedang memahami idenya…"
                      : "RockFoundry is thinking through your idea…"
                    : thinkingStatus}
                </div>
              ) : null}
              {initialTurnStatus === "FAILED" ? (
                <div className="rf-error" role="alert">
                  <span>
                    {initialTurnError ||
                      (indo
                        ? "Respons awal belum berhasil dibuat."
                        : "The first response could not be generated yet.")}
                  </span>
                  <button
                    className="rf-header-action"
                    type="button"
                    onClick={() =>
                      void runInitialTurn(
                        project.id,
                        project.description || state.rawIdea || "",
                        true,
                      )
                    }
                  >
                    {indo ? "Coba lagi" : "Retry"}
                  </button>
                </div>
              ) : null}
              {pageError ? (
                <div className="rf-error" role="alert">
                  <span>{pageError}</span>
                  <button type="button" onClick={() => setPageError("")}>
                    <X className="size-4 shrink-0" />
                  </button>
                </div>
              ) : null}
              {packageJob &&
              !working &&
              ["QUEUED", "RUNNING", "FAILED"].includes(packageJob.status) ? (
                <PackageBuildStatus
                  job={packageJob}
                  onRetry={() => void buildProductPackage()}
                />
              ) : packageJob?.status === "COMPLETED" ? (
                <PackageReadyActions
                  language={indo ? "id" : "en"}
                  onDownload={() =>
                    window.location.assign(
                      `/api/projects/${projectId}/export?mode=handoff`,
                    )
                  }
                  onProductMap={() => setWorkbench("documents")}
                  onPrototype={() => {
                    setPrototypeLaunchRequested(true);
                    setWorkbench("design");
                  }}
                />
              ) : null}
            </div>

            <div className="rf-composer-dock">
              <form
                onSubmit={handleSubmit}
                className="mx-auto w-full max-w-[46rem] px-4 pb-2 sm:px-7"
              >
                <div className="rf-composer-shell relative">
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
                      project.description
                        ? indo
                          ? "Tambah konteks, URL, atau minta design..."
                          : "Add context, a URL, or ask for design..."
                        : indo
                          ? "Ceritakan idenya..."
                          : "Describe your idea..."
                    }
                    rows={1}
                    className="rf-composer min-h-[56px] w-full resize-none pb-12"
                    disabled={working}
                  />
                  <div className="absolute inset-x-3 bottom-2.5 flex items-center gap-2">
                    <button
                      className="rf-chip"
                      type="button"
                      onClick={() => setWorkbench("documents")}
                    >
                      Documents
                    </button>
                    <button
                      className="rf-chip"
                      type="button"
                      onClick={() => {
                        pendingDesignRef.current = false;
                        setWorkbench("design");
                        setPrototypeLaunchRequested(true);
                      }}
                    >
                      Design
                    </button>
                    <span className="ml-auto" />
                    <button
                      className="rf-send-button"
                      type={working ? "button" : "submit"}
                      onClick={
                        working
                          ? () => {
                              activeConversationRef.current?.controller.abort();
                              conversationGenerationRef.current += 1;
                              activeConversationRef.current = null;
                              setWorking(false);
                            }
                          : undefined
                      }
                    >
                      {working ? (
                        <Square className="size-3.5 fill-current" />
                      ) : (
                        <ArrowUp className="size-4 shrink-0" />
                      )}
                    </button>
                    {draftAvailable ? (
                      <>
                        <button
                          className="rf-primary-button"
                          type="button"
                          onClick={() => void buildProductDraft()}
                          disabled={working || draftGenerationInFlight}
                        >
                          {indo
                            ? "Generate Product Draft"
                            : "Generate Product Draft"}
                        </button>
                        <button
                          className="rf-header-action inline-flex"
                          type="button"
                          onClick={() => {
                            pendingDesignRef.current = false;
                            setWorkbench("design");
                            setPrototypeLaunchRequested(true);
                          }}
                          disabled={working}
                        >
                          {indo
                            ? "Buat Design Preview"
                            : "Generate Design Preview"}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center justify-between px-1 py-2 text-[0.72rem] text-muted-foreground">
                  <span>
                    {indo
                      ? "Enter untuk mengirim · Shift+Enter untuk baris baru"
                      : "Enter to send · Shift+Enter for a new line"}
                  </span>
                  <span>{provider.label}</span>
                </div>
              </form>
            </div>
          </div>

          {workbench ? (
            <aside className="rf-workbench" aria-label="Product workbench">
              <div className="rf-workbench-head">
                <p className="rf-workbench-kicker">
                  {workbench === "documents" ? "PRODUCT DRAFT" : "DESIGN"}
                </p>
                <button
                  className="rf-icon-button"
                  type="button"
                  aria-label="Close workbench"
                  onClick={() => setWorkbench(null)}
                >
                  <X className="size-4 shrink-0" />
                </button>
              </div>
              {workbench === "documents" ? (
                <ProductDocuments
                  projectId={project.id}
                  language={indo ? "id" : "en"}
                  onContinueChat={() => {
                    setWorkbench(null);
                    document.getElementById("project-composer")?.focus();
                  }}
                  onOpenDesign={() => {
                    pendingDesignRef.current = false;
                    setWorkbench("design");
                    setPrototypeLaunchRequested(true);
                  }}
                  onGenerateHandoff={() => void buildProductPackage()}
                  generationRequestId={draftGenerationRequestId}
                  onGenerated={() =>
                    setMessages((current) => [
                      ...current,
                      {
                        id: `draft-${Date.now()}`,
                        role: "assistant",
                        text: indo
                          ? "Product Draft sudah dibuat. Yang belum jelas tetap terlihat sebagai asumsi atau open question."
                          : "The Product Draft is ready. Unresolved details stay visible as assumptions or open questions.",
                      },
                    ])
                  }
                  onGenerationSettled={() => setDraftGenerationInFlight(false)}
                />
              ) : (
                <DesignStudio
                  projectId={project.id}
                  studio={state.studio}
                  packageReady={designReady}
                  draftSpecReady={draftAvailable}
                  showDownloadHandoff={false}
                  showPrototypeAction
                  autoGenerate={prototypeLaunchRequested}
                  onAutoGenerateHandled={() =>
                    setPrototypeLaunchRequested(false)
                  }
                  language={indo ? "id" : "en"}
                  onDownloadHandoff={() =>
                    window.location.assign(
                      `/api/projects/${projectId}/export?mode=handoff`,
                    )
                  }
                  onState={(nextState, version) =>
                    setProject((current) =>
                      current
                        ? {
                            ...current,
                            canonicalState: nextState,
                            version,
                          }
                        : current,
                    )
                  }
                />
              )}
            </aside>
          ) : null}
        </div>
      </section>
      {drawer && drawer !== "settings" ? (
        <DrawerPanel
          drawer={drawer}
          project={project}
          state={state}
          references={references}
          activity={activity}
          exportReady={exportReady}
          working={working}
          onClose={() => setDrawer(null)}
          onDownload={() =>
            window.location.assign(
              `/api/projects/${projectId}/export?mode=handoff`,
            )
          }
          onReviseDecision={reviseDecision}
        />
      ) : null}
    </main>
  );
}

function MessageRow({
  message,
  language = "en",
  nextUserText,
  activeQuestionId,
  working,
  activityOpen,
  onToggleActivity,
  onAnswer,
}: {
  message: Message;
  language?: "id" | "en";
  nextUserText?: string;
  activeQuestionId?: string;
  working: boolean;
  activityOpen: boolean;
  onToggleActivity: () => void;
  onAnswer: (option: QuestionOption | Message | string) => void;
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
        {activityOpen ? (
          <div className="mt-2 pl-7 text-xs leading-5 text-muted-foreground">
            {message.detail ||
              "Tool activity is shown at a useful level. Raw payloads remain hidden."}
          </div>
        ) : null}
      </div>
    );
  }
  if (message.role === "system") {
    return (
      <div className="rf-system-row" role="status">
        {message.text}
      </div>
    );
  }
  const isUser = message.role === "user";
  const isQuestion = Boolean(message.options?.length);
  const isActive = isQuestion && !working;
  const isResolvedQuestion = Boolean(
    message.questionId && message.questionId !== activeQuestionId,
  );
  if (isResolvedQuestion) {
    return (
      <div className="rf-message-row rf-message-agent">
        <div className="rf-avatar rf-avatar-agent">R</div>
        <div className="min-w-0 flex-1">
          <div className="rf-topic">
            {humanTopicLabel(message.topic, language)}
          </div>
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
      data-question-id={message.questionId}
      className={`rf-message-row ${isUser ? "rf-message-user" : "rf-message-agent"}`}
    >
      <div
        className={`rf-avatar ${isUser ? "rf-avatar-user" : "rf-avatar-agent"}`}
      >
        {isUser ? "Y" : "R"}
      </div>
      <div className="min-w-0 flex-1">
        {message.questionId ? (
          <div className="rf-topic">
            {humanTopicLabel(message.topic, language)}
          </div>
        ) : isUser ? null : (
          <div className="mb-1 text-[0.75rem] font-medium text-muted-foreground">
            RockFoundry
          </div>
        )}
        <div className={isQuestion ? "rf-question-text" : "rf-message-text"}>
          {message.text}
        </div>
        {isUser && message.retryable ? (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{safeConversationFailureMessage(message.turnError)}</span>
            <button
              type="button"
              className="rf-header-action"
              disabled={working}
              onClick={() => onAnswer(message)}
            >
              {working
                ? "Retrying…"
                : language === "id"
                  ? "Coba lagi"
                  : "Retry"}
            </button>
          </div>
        ) : null}
        {message.detail ? (
          <div className="mt-2 text-[0.875rem] leading-6 text-muted-foreground">
            {message.detail}
          </div>
        ) : null}
        {message.options ? (
          <div className="rf-options">
            {message.options.map((option) => (
              <button
                key={option.id}
                type="button"
                className="rf-option"
                disabled={!isActive}
                aria-disabled={!isActive}
                onClick={() => onAnswer(option)}
              >
                <span className="font-medium">{option.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
function DrawerPanel({
  drawer,
  project,
  state,
  references,
  activity,
  exportReady,
  working,
  onClose,
  onDownload,
  onReviseDecision,
}: {
  drawer: Exclude<Drawer, null>;
  project: ProjectData;
  state: any;
  references: Reference[];
  activity: Activity[];
  exportReady: boolean;
  working: boolean;
  onClose: () => void;
  onDownload: () => void;
  onReviseDecision: (topic: string) => void;
}) {
  const title = drawer === "context" ? "Product Map" : "Handoff";
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
            activity={activity}
            working={working}
            onReviseDecision={onReviseDecision}
          />
        )}
        {drawer === "documents" && (
          <DocumentsContent
            state={state}
            exportReady={exportReady}
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
  activity,
  working,
  onReviseDecision,
}: {
  state: any;
  references: Reference[];
  activity: Activity[];
  working: boolean;
  onReviseDecision: (topic: string) => void;
}) {
  const indo = isIndonesianProject(state);
  const language = indo ? "id" : "en";
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
          Overview
        </h3>
        <p className="text-sm leading-6">
          {state.normalizedSummary ||
            state.rawIdea ||
            "RockFoundry is still learning about this product."}
        </p>
        <div className="grid gap-2 text-xs text-muted-foreground">
          <p>
            <span className="text-foreground">Actors:</span>{" "}
            {(state.targetUsers || state.roles || []).slice(0, 4).join(", ") ||
              "Not confirmed yet"}
          </p>
          <p>
            <span className="text-foreground">Entities:</span>{" "}
            {(state.entities || []).slice(0, 4).join(", ") ||
              "Not confirmed yet"}
          </p>
          <p>
            <span className="text-foreground">Core outcome:</span>{" "}
            {(state.objectives || state.workflows || []).slice(0, 1).join("") ||
              "Still open"}
          </p>
        </div>
      </section>
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
                  ? `${humanTopicLabel(item.topic, language)}: ${String(item.decision).replace(/[_-]+/g, " ")}`
                  : item.title || item.description || String(item);
              const canRevise = Boolean(item.topic);
              return (
                <li
                  key={`${item.id || item.topic || label}-${index}`}
                  className="flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-0"
                >
                  <span className="min-w-0 flex-1">{label}</span>
                  <ProvenanceChip provenance={String(item.source || "USER")} />
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
          humanTopicLabel(topic, language),
        )}
        empty="No high-impact decisions remain open."
      />
      <ContextList
        title="Evidence"
        items={references.map((item) => item.url)}
        empty="No reference evidence yet."
        provenance="RESEARCH"
      />
      <section>
        <h3 className="mb-2 text-[12px] font-medium tracking-[0.04em] text-muted-foreground">
          Assumptions (not yet confirmed)
        </h3>
        {assumptions.length ? (
          <ul className="space-y-2 text-sm leading-5">
            {assumptions.slice(0, 6).map((item: any, index: number) => (
              <li
                key={`${item.id || index}`}
                className="flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-0"
              >
                <span className="min-w-0 flex-1">
                  {item.statement || String(item)}
                </span>
                <ProvenanceChip provenance="INFERRED" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No assumptions yet.</p>
        )}
      </section>
      <ContextList
        title="Contradictions"
        items={contradictions.map(
          (item: any) => item.explanation || String(item),
        )}
        empty="No contradictions found."
      />
      <section>
        <h3 className="mb-2 text-[12px] font-medium tracking-[0.04em] text-muted-foreground">
          Activity
        </h3>
        {activity.length ? (
          <ul className="space-y-2 text-sm leading-5">
            {activity
              .slice(-6)
              .reverse()
              .map((item) => (
                <li
                  key={item.id}
                  className="border-b border-border/50 pb-2 last:border-0"
                >
                  <span className="mr-2 text-emerald-500">✓</span>
                  <span className="font-medium">
                    {item.toolName.replace(/_/g, " ")}
                  </span>
                  <span className="block pl-5 text-xs text-muted-foreground">
                    {item.status === "COMPLETED"
                      ? item.outputSummary
                      : item.failureReason || item.status}
                  </span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No tool activity yet.</p>
        )}
      </section>
    </div>
  );
}

function ProvenanceChip({ provenance }: { provenance: string }) {
  const known = ["USER", "RESEARCH", "INFERRED", "SYSTEM"] as const;
  type Chip = (typeof known)[number];
  const label = (known as readonly string[]).includes(provenance)
    ? (provenance as Chip)
    : provenance.replace(/^REFERENCE_/, "");
  return (
    <span
      className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium tracking-[0.05em] text-muted-foreground"
      title={
        label === "USER"
          ? "Dikonfirmasi langsung oleh kamu"
          : label === "RESEARCH"
            ? "Bukti dari referensi publik — bukan keputusan"
            : label === "INFERRED"
              ? "Kesimpulan sementara — belum dikonfirmasi"
              : "Dihasilkan sistem RockFoundry"
      }
    >
      {label}
    </span>
  );
}

function ContextList({
  title,
  items,
  empty,
  provenance,
}: {
  title: string;
  items: string[];
  empty: string;
  provenance?: "USER" | "RESEARCH" | "INFERRED" | "SYSTEM";
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-medium tracking-[0.04em] text-muted-foreground">
          {title}
        </h3>
        {provenance ? <ProvenanceChip provenance={provenance} /> : null}
      </div>
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
  onDownload,
}: {
  state: any;
  exportReady: boolean;
  onDownload: () => void;
}) {
  const status = exportReady ? "Ready" : "Not prepared";
  const hasDesign = state.studio?.currentVersion > 0;
  const hasReferences =
    Array.isArray(state.references) && state.references.length > 0;
  const supportingReferences = hasReferences
    ? "reference/BRD.md · reference/PRD.md · reference/ERD.md · reference/references.json"
    : "reference/BRD.md · reference/PRD.md · reference/ERD.md";
  const core = [
    {
      file: "BRD.md · PRD.md · ERD.md",
      description:
        "Business, product, and data documents included in the final package.",
    },
    {
      file: "USER_FLOWS.md · SCREEN_MAP.md · DESIGN_BRIEF.md",
      description:
        "The reviewed flow and design inputs used by the coding agent.",
    },
    {
      file: "PRODUCT_SPEC.md",
      description: "Compact compatibility summary of the product truth.",
    },
    {
      file: "AGENT_HANDOFF.md",
      description: "Start-here implementation brief for a coding agent.",
    },
  ];
  const advanced = [
    {
      file: "DO_NOT_INVENT.md",
      description: "Rules the coding agent must not invent.",
    },
    {
      file: "DECISIONS.md",
      description: "Every confirmed decision with provenance.",
    },
    {
      file: "reference/",
      description: supportingReferences,
    },
  ];
  return (
    <div className="space-y-5 px-5 py-5">
      <p className="text-sm leading-6 text-muted-foreground">
        {exportReady
          ? "This package contains the latest reviewed artifacts and design references."
          : "Final handoff is separate from the working draft. Review Documents and choose Prepare final handoff when ready."}
      </p>
      <section className="space-y-2">
        <h3 className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground">
          Final package contents
        </h3>
        {core.map((doc) => (
          <div
            key={doc.file}
            className="flex items-start gap-3 border-b border-border/60 py-3"
          >
            <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{doc.file}</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                {doc.description}
              </span>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {exportReady ? "Ready" : status}
            </span>
          </div>
        ))}
      </section>
      <section>
        <h3 className="mb-2 text-[11px] font-medium tracking-[0.06em] text-muted-foreground">
          Coding-agent guardrails
        </h3>
        <div className="space-y-1">
          {advanced.map((doc) => (
            <div
              key={doc.file}
              className="flex items-center gap-3 py-1.5 text-[13px] text-muted-foreground"
            >
              <span className="flex-1 truncate">{doc.file}</span>
              <span className="text-[11px]">
                {exportReady ? "Ready" : status}
              </span>
            </div>
          ))}
        </div>
      </section>
      {exportReady && hasDesign && (
        <section>
          <h3 className="mb-2 text-[11px] font-medium tracking-[0.06em] text-muted-foreground">
            Product design reference
          </h3>
          <div className="space-y-1 text-[13px] text-muted-foreground">
            <div>design/DESIGN_SPEC.json</div>
            <div>design/SCREEN_MAP.json</div>
            <div>design/DESIGN_DECISIONS.md</div>
            <div className="pt-1 text-xs">
              Prototype files are included when generated.
            </div>
          </div>
        </section>
      )}
      {exportReady ? (
        <button
          className="rf-primary-button w-full"
          type="button"
          onClick={onDownload}
        >
          <FileText className="size-4" /> Download Handoff
        </button>
      ) : (
        <p className="text-sm text-muted-foreground">
          Prepare the final handoff from Documents after reviewing the current
          draft.
        </p>
      )}
    </div>
  );
}
