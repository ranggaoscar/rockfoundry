"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Menu, Plus, Search, Settings2 } from "lucide-react";

type Example = {
  label: string;
  idea: string;
};

const EXAMPLES: Example[] = [
  {
    label: "CRM for marble sales",
    idea: "Build a CRM for marble sales teams to manage WhatsApp leads, quotations, and follow-ups.",
  },
  {
    label: "Rental car booking",
    idea: "Create a rental car booking system for several branches with vehicles, availability, and customer history.",
  },
  {
    label: "Three-warehouse inventory",
    idea: "Build an inventory system for three marble warehouses that tracks slabs, transfers, and current location.",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = useMemo(
    () => idea.trim().length > 0 && !creating,
    [idea, creating],
  );

  async function startProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setCreating(true);
    setError("");
    try {
      const name =
        idea
          .trim()
          .split(/\s+/)
          .slice(0, 5)
          .join(" ")
          .replace(/[.!?]+$/, "") || "New project";
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: idea.trim() }),
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
    <main className="rf-app min-h-[100dvh] bg-background text-foreground">
      <aside className="rf-sidebar hidden w-[264px] shrink-0 flex-col border-r border-border/70 bg-sidebar px-3 py-4 lg:flex">
        <div className="flex items-center justify-between px-2 pb-5">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="rf-mark" aria-hidden="true">
              R
            </span>
            ROCKFOUNDRY
          </div>
          <button
            className="rf-icon-button"
            type="button"
            aria-label="Collapse sidebar"
          >
            <Menu className="size-4" />
          </button>
        </div>
        <button
          className="rf-new-project"
          type="button"
          onClick={() => document.getElementById("idea-composer")?.focus()}
        >
          <Plus className="size-4" />
          New project
        </button>
        <div className="mt-7 flex items-center justify-between px-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          <span>Recent</span>
          <Search className="size-3.5" />
        </div>
        <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
          <div className="rf-sidebar-placeholder">
            Your projects appear here
          </div>
        </div>
        <div className="mt-auto border-t border-border/70 pt-3">
          <button
            className="rf-sidebar-link"
            type="button"
            onClick={() => router.push("/settings")}
          >
            <Settings2 className="size-4" />
            Settings
          </button>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="rf-topbar flex h-14 items-center justify-between border-b border-border/70 px-4 lg:px-7">
          <button
            className="rf-icon-button lg:hidden"
            type="button"
            aria-label="Open projects"
          >
            <Menu className="size-4" />
          </button>
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight lg:hidden">
            <span className="rf-mark" aria-hidden="true">
              R
            </span>
            ROCKFOUNDRY
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            Local workspace
          </div>
        </header>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-12 sm:px-8">
          <div className="w-full max-w-[720px]">
            <div className="mb-9 text-center">
              <div className="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Product discovery workspace
              </div>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                What do you want to build?
              </h1>
              <p className="mx-auto mt-3 max-w-[480px] text-sm leading-6 text-muted-foreground">
                Start with the idea in your head. RockFoundry will help clarify
                what a coding agent needs to know.
              </p>
            </div>

            <form onSubmit={startProject} className="relative">
              <label className="sr-only" htmlFor="idea-composer">
                Describe your idea
              </label>
              <textarea
                id="idea-composer"
                value={idea}
                onChange={(event) => setIdea(event.target.value)}
                placeholder="Describe your idea..."
                rows={4}
                className="rf-composer min-h-[142px] w-full resize-none pr-14"
                disabled={creating}
              />
              <button
                className="rf-send-button absolute bottom-3 right-3"
                type="submit"
                disabled={!canSubmit}
                aria-label="Start project"
              >
                <ArrowUp className="size-4" />
              </button>
              <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
                <span>Enter to start · Shift+Enter for a new line</span>
                <span>
                  {idea.length > 0
                    ? `${idea.length} characters`
                    : "Local-first"}
                </span>
              </div>
            </form>

            {error && (
              <p
                className="mt-4 text-center text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            )}

            <div className="mt-12">
              <div className="mb-3 text-center text-xs text-muted-foreground">
                Try an example
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {EXAMPLES.map((example) => (
                  <button
                    key={example.label}
                    type="button"
                    className="rf-example"
                    onClick={() => setIdea(example.idea)}
                  >
                    {example.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-14 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span>Free and open source</span>
              <span>Bring your own AI provider</span>
              <span>BRD · PRD · ERD</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
