"use client";

import {
  FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUp, Menu } from "lucide-react";
import { SettingsPanel, useProviderStatus } from "@/components/settings-panel";
import {
  WorkspaceSidebar,
  type ProjectStage,
  type SidebarProject,
} from "@/components/workspace-sidebar";
import { createProjectThroughWebMcp } from "@/lib/webmcp-create-project";

type Example = {
  label: string;
  idea: string;
};

type RecentProject = SidebarProject & {
  description: string | null;
};

type WebMcpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean };
  execute: (
    input: Record<string, unknown>,
    options: { signal: AbortSignal },
  ) => Promise<string> | string;
};

type WebMcpDocument = Document & {
  modelContext?: {
    registerTool: (
      tool: WebMcpTool,
      options: { signal: AbortSignal },
    ) => Promise<void>;
  };
};

const EXAMPLES: Example[] = [
  {
    label: "CRM untuk tim sales",
    idea: "CRM untuk tim sales. Setiap brand punya sales sendiri, owner lihat semua, lead datang dari WhatsApp Instagram dan website, ada follow-up dan quotation.",
  },
  {
    label: "Aplikasi keuangan usaha kecil",
    idea: "Aplikasi keuangan usaha kecil untuk owner warung. Fokus ke transaksi harian, kategori, dan posisi kas, bukan dashboard akuntansi kompleks.",
  },
  {
    label: "Booking untuk bisnis jasa",
    idea: "Booking untuk bisnis jasa. Pelanggan pilih jadwal, staf melihat antrean, owner mengatur ketersediaan dan pembayaran.",
  },
];

const CREATE_PROJECT_INPUT_SCHEMA = {
  type: "object",
  properties: {
    description: {
      type: "string",
      minLength: 1,
      maxLength: 5000,
      description: "What product or application should be built",
    },
    name: {
      type: "string",
      maxLength: 200,
      description: "Optional project name",
    },
  },
  required: ["description"],
  additionalProperties: false,
};

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
  const decisions = Array.isArray(record.decisions) ? record.decisions : [];
  if (decisions.length > 0 || record.readiness) return "spec";
  return "idea";
}

function HomeWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [idea, setIdea] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(
    searchParams.get("settings") === "1",
  );
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const provider = useProviderStatus();
  const indo = /\b(saya|mau|ingin|bikin|buat)\b/i.test(idea);
  const createProjectRef = useRef<
    (
      input: Record<string, unknown>,
      signal: AbortSignal,
    ) => Promise<string>
  >(async () =>
    JSON.stringify({
      status: "failed",
      message: "Project creation is not ready yet.",
    }),
  );

  const canSubmit = useMemo(
    () => idea.trim().length > 0 && !creating,
    [idea, creating],
  );

  const createProject = useCallback(
    async (input: Record<string, unknown>, signal: AbortSignal) =>
      JSON.stringify(
        await createProjectThroughWebMcp({
          description: input.description,
          name: input.name,
          signal,
          navigateToProject: (projectUrl) => router.push(projectUrl),
        }),
      ),
    [router],
  );

  useEffect(() => {
    createProjectRef.current = createProject;
  }, [createProject]);

  useEffect(() => {
    const modelContext = (document as WebMcpDocument).modelContext;
    if (!modelContext) return;
    const controller = new AbortController();
    const registerTool = async () => {
      try {
        await modelContext.registerTool(
          {
            name: "rockfoundry_start_product",
            description:
              "Start a new RockFoundry product workspace from a product idea and open it.",
            inputSchema: CREATE_PROJECT_INPUT_SCHEMA,
            annotations: { readOnlyHint: false },
            execute: (input, { signal }) =>
              createProjectRef.current(input, signal),
          },
          { signal: controller.signal },
        );
      } catch {
        controller.abort();
        // WebMCP is optional. Suppress registration failures outside supported contexts.
      }
    };
    void registerTool();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/projects")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active || !data?.projects) return;
        setRecent(
          (
            data.projects as Array<{
              id: string;
              name: string;
              description: string | null;
              updatedAt?: string;
              canonicalState?: unknown;
            }>
          )
            .slice(0, 8)
            .map((project) => ({
              id: project.id,
              name: project.name,
              description: project.description,
              updatedAt: project.updatedAt,
              stage: projectStageFromState(project.canonicalState),
            })),
        );
      })
      .catch(() => {
        /* local list is best-effort */
      });
    return () => {
      active = false;
    };
  }, []);

  async function startProject(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!canSubmit) return;

    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: idea.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.project?.id) {
        throw new Error(
          data.error || "RockFoundry couldn't create the project.",
        );
      }
      router.push(`/project/${data.project.id}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "RockFoundry couldn't create the project.",
      );
      setCreating(false);
    }
  }

  return (
    <main className="rf-app isolate flex min-h-dvh bg-background text-foreground">
      <WorkspaceSidebar
        projects={recent}
        provider={provider}
        mobileOpen={navOpen}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((current) => !current)}
        onCloseMobile={() => setNavOpen(false)}
        onGoHome={() => {
          setIdea("");
          setNavOpen(false);
          document.getElementById("idea-composer")?.focus();
        }}
        onNewProject={() => {
          setIdea("");
          setNavOpen(false);
          document.getElementById("idea-composer")?.focus();
        }}
        onOpenProject={(id) => router.push(`/project/${id}`)}
        onOpenSettings={() => {
          setNavOpen(false);
          setSettingsOpen(true);
        }}
      />

      <section className="rf-first-view flex min-w-0 flex-1 flex-col">
        <header className="rf-topbar flex h-12 items-center justify-between border-b border-border px-4 lg:px-6">
          <button
            className="rf-icon-button lg:hidden"
            type="button"
            aria-label="Open projects"
            onClick={() => setNavOpen(true)}
          >
            <Menu className="size-4 shrink-0" />
            <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" />
          </button>
          <p className="text-[0.75rem] text-muted-foreground">
            Local product studio
          </p>
        </header>

        <div className="flex min-h-0 flex-1 justify-center overflow-y-auto px-4 pt-10 pb-12 sm:px-8 sm:pt-16">
          <div className="flex w-full max-w-[42rem] flex-col">
            <div className="mb-5 flex items-center gap-2">
              <span className="rf-mark" aria-hidden="true">
                <img src="/brand/rockfoundry-mark.svg" alt="" />
              </span>
              <p className="text-[0.8rem] font-medium tracking-[0.04em] text-muted-foreground">
                RockFoundry
              </p>
            </div>
            <h1 className="max-w-[16ch] text-[2.15rem] font-semibold tracking-tight text-pretty sm:text-[2.6rem]">
              {indo ? "Mau bikin apa?" : "What are you building?"}
            </h1>
            <p className="mt-3 max-w-[46ch] text-pretty text-[1rem] leading-7 text-muted-foreground sm:text-[0.95rem] sm:leading-6">
              {indo
                ? "Mulai dari ide mentah. Kita pikirkan produknya, susun spec, lalu bikin design."
                : "Start from a rough idea. We think through the product, shape the spec, then design it."}
            </p>

            <form
              onSubmit={(event) => void startProject(event)}
              className="rf-composer-shell relative mt-8"
            >
              <label className="sr-only" htmlFor="idea-composer">
                Describe your idea
              </label>
              <textarea
                id="idea-composer"
                name="idea"
                value={idea}
                onChange={(event) => setIdea(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void startProject();
                  }
                }}
                placeholder={
                  indo
                    ? "Ceritakan idenya..."
                    : "Describe the product you want to build..."
                }
                rows={5}
                className="rf-composer min-h-[148px] w-full resize-none pb-14"
                disabled={creating}
              />
              <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-[0.72rem] text-muted-foreground">
                  {creating
                    ? "Creating project..."
                    : "Enter to start · Shift+Enter for a new line"}
                </p>
                <button
                  className="rf-idea-button"
                  type="submit"
                  disabled={!canSubmit}
                  aria-label={indo ? "Mulai" : "Start"}
                >
                  <ArrowUp className="size-4 shrink-0" />
                  <span className="max-sm:hidden">
                    {indo ? "Mulai" : "Start"}
                  </span>
                </button>
              </div>
            </form>

            {error ? (
              <p className="mt-4 text-[0.95rem] text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <div className="mt-7 flex flex-col gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  className="rf-example"
                  disabled={creating}
                  onClick={() => setIdea(example.idea)}
                >
                  {example.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </main>
  );
}

export default function LandingPage() {
  return (
    <Suspense fallback={<div className="rf-loading">Loading workspace...</div>}>
      <HomeWorkspace />
    </Suspense>
  );
}
