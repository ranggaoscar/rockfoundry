"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUp, Menu } from "lucide-react";
import { SettingsPanel, useProviderStatus } from "@/components/settings-panel";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";

type Example = {
  label: string;
  idea: string;
};

type RecentProject = {
  id: string;
  name: string;
  description: string | null;
  updatedAt?: string;
};

const EXAMPLES: Example[] = [
  {
    label: "Multi-brand CRM",
    idea: "Build a CRM for five marble brands. Each brand has its own salespeople, but the owner should see everything. Leads come from WhatsApp, Instagram, and the website.",
  },
  {
    label: "Multi-branch rental",
    idea: "Create a rental car booking system for several branches with vehicles, availability, transfers, and customer history.",
  },
  {
    label: "Multi-warehouse inventory",
    idea: "Build an inventory system for three marble warehouses that tracks individual slabs, transfers, and current location.",
  },
];

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
  const provider = useProviderStatus();

  const canSubmit = useMemo(
    () => idea.trim().length > 0 && !creating,
    [idea, creating],
  );

  useEffect(() => {
    let active = true;
    fetch("/api/projects")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active || !data?.projects) return;
        setRecent(
          (data.projects as RecentProject[]).slice(0, 8).map((project) => ({
            id: project.id,
            name: project.name,
            description: project.description,
            updatedAt: project.updatedAt,
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
        onCloseMobile={() => setNavOpen(false)}
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

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="rf-topbar flex h-14 items-center justify-between border-b border-border px-4 lg:px-6">
          <button
            className="rf-icon-button lg:hidden"
            type="button"
            aria-label="Open projects"
            onClick={() => setNavOpen(true)}
          >
            <Menu className="size-4" />
          </button>
          <div className="text-[13px] text-muted-foreground">
            Local workspace
          </div>
        </header>

        <div className="flex min-h-0 flex-1 justify-center overflow-y-auto px-4 pt-8 pb-10 sm:px-8 sm:pt-14">
          <div className="flex w-full max-w-[760px] flex-col">
            <p className="mb-3 text-[12px] font-medium tracking-[0.04em] text-muted-foreground">
              RockFoundry
            </p>
            <h1 className="max-w-[18ch] text-[1.75rem] font-semibold tracking-tight text-pretty sm:text-[2rem]">
              What do you want to build?
            </h1>
            <p className="mt-2 max-w-[42ch] text-[14px] leading-6 text-muted-foreground">
              Describe the idea. RockFoundry will ask the hidden decisions a
              coding agent would otherwise invent.
            </p>

            <form
              onSubmit={(event) => void startProject(event)}
              className="relative mt-7"
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
                placeholder="Describe your idea..."
                rows={4}
                className="rf-composer min-h-[132px] w-full resize-none pr-14"
                disabled={creating}
              />
              <button
                className="rf-send-button absolute right-3 bottom-3"
                type="submit"
                disabled={!canSubmit}
                aria-label="Start project"
              >
                <ArrowUp className="size-4" />
              </button>
              <div className="mt-2 px-1 text-[12px] text-muted-foreground">
                {creating
                  ? "Creating project..."
                  : "Enter to start · Shift+Enter for a new line"}
              </div>
            </form>

            {error && (
              <p className="mt-4 text-[14px] text-destructive" role="alert">
                {error}
              </p>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
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
