"use client";

import { Plus, Settings2, X } from "lucide-react";
import { formatRelativeTime } from "@/lib/topic-label";
import type { ProviderStatus } from "@/lib/provider";

export type SidebarProject = {
  id: string;
  name: string;
  updatedAt?: string;
};

export function WorkspaceSidebar({
  projects,
  activeProjectId,
  provider,
  mobileOpen = false,
  onCloseMobile,
  onNewProject,
  onOpenProject,
  onOpenSettings,
}: {
  projects: SidebarProject[];
  activeProjectId?: string;
  provider?: ProviderStatus;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  onNewProject: () => void;
  onOpenProject: (id: string) => void;
  onOpenSettings: () => void;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between px-2 pb-5">
        <button
          className="flex items-center gap-2 text-[15px] font-semibold tracking-tight"
          type="button"
          onClick={onNewProject}
        >
          <span className="rf-mark" aria-hidden="true">
            R
          </span>
          RockFoundry
        </button>
        {onCloseMobile ? (
          <button
            className="rf-icon-button lg:hidden"
            type="button"
            aria-label="Close sidebar"
            onClick={onCloseMobile}
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      <button className="rf-new-project" type="button" onClick={onNewProject}>
        <Plus className="size-4" />
        New project
      </button>
      <div className="mt-7 px-2 text-[11px] font-medium tracking-[0.06em] text-muted-foreground">
        Recent
      </div>
      <div className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {projects.length ? (
          projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className="rf-project-item"
              aria-current={project.id === activeProjectId ? "page" : undefined}
              onClick={() => onOpenProject(project.id)}
            >
              <span className="block min-w-0 flex-1 truncate">
                {project.name}
              </span>
              {project.updatedAt ? (
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatRelativeTime(project.updatedAt)}
                </span>
              ) : null}
            </button>
          ))
        ) : (
          <div className="rf-sidebar-placeholder">
            <div className="font-medium text-foreground">No projects yet</div>
            <div className="mt-1">Start with an idea.</div>
          </div>
        )}
      </div>
      <div className="mt-auto border-t border-border pt-3">
        <button
          className="rf-sidebar-link"
          type="button"
          onClick={onOpenSettings}
        >
          <Settings2 className="size-4" />
          Settings
        </button>
        {provider ? (
          <button
            className="rf-status-line px-2"
            type="button"
            onClick={onOpenSettings}
          >
            {provider.label}
            {provider.mode === "mock" ? " · offline" : ""}
          </button>
        ) : null}
      </div>
    </>
  );

  return (
    <>
      <aside className="rf-sidebar hidden w-[260px] shrink-0 flex-col border-r border-border px-3 py-4 lg:flex">
        {content}
      </aside>
      {mobileOpen ? (
        <div
          className="rf-drawer-backdrop lg:hidden"
          role="presentation"
          onClick={onCloseMobile}
        >
          <aside
            className="rf-sidebar flex h-full w-[min(280px,86vw)] flex-col border-r border-border px-3 py-4"
            role="dialog"
            aria-modal="true"
            aria-label="Projects"
            onClick={(event) => event.stopPropagation()}
          >
            {content}
          </aside>
        </div>
      ) : null}
    </>
  );
}
