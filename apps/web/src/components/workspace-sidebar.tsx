"use client";

import { PanelLeftClose, PanelLeftOpen, Plus, Settings2, X } from "lucide-react";
import { formatRelativeTime } from "@/lib/topic-label";
import type { ProviderStatus } from "@/lib/provider";

export type ProjectStage = "idea" | "spec" | "design";

export type SidebarProject = {
  id: string;
  name: string;
  updatedAt?: string;
  stage?: ProjectStage;
};

export function WorkspaceSidebar({
  projects,
  activeProjectId,
  provider,
  mobileOpen = false,
  collapsed = false,
  onToggleCollapsed,
  onCloseMobile,
  onGoHome,
  onNewProject,
  onOpenProject,
  onOpenSettings,
}: {
  projects: SidebarProject[];
  activeProjectId?: string;
  provider?: ProviderStatus;
  mobileOpen?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onCloseMobile?: () => void;
  onGoHome?: () => void;
  onNewProject: () => void;
  onOpenProject: (id: string) => void;
  onOpenSettings: () => void;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-2 px-1 pb-4">
        <button
          className="flex min-w-0 items-center gap-2 text-[0.95rem] font-semibold tracking-tight"
          type="button"
          onClick={onGoHome || onNewProject}
        >
          <span className="rf-mark shrink-0" aria-hidden="true">
            <img src="/brand/rockfoundry-mark.svg" alt="" />
          </span>
          {collapsed ? null : <span className="truncate">RockFoundry</span>}
        </button>
        {onCloseMobile ? (
          <button
            className="rf-icon-button lg:hidden"
            type="button"
            aria-label="Close sidebar"
            onClick={onCloseMobile}
          >
            <X className="size-4 shrink-0" />
            <span className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2" />
          </button>
        ) : null}
        {onToggleCollapsed ? (
          <button
            className="rf-icon-button max-lg:hidden"
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={onToggleCollapsed}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4 shrink-0" />
            ) : (
              <PanelLeftClose className="size-4 shrink-0" />
            )}
          </button>
        ) : null}
      </div>
      <button className="rf-new-project" type="button" onClick={onNewProject}>
        <Plus className="size-4 shrink-0" />
        {collapsed ? null : <span>New project</span>}
      </button>
      {collapsed ? null : (
        <div className="mt-6 px-1 text-[0.68rem] font-medium tracking-[0.08em] text-muted-foreground">
          Recent
        </div>
      )}
      <div className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {projects.length ? (
          projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className="rf-project-item"
              aria-current={project.id === activeProjectId ? "page" : undefined}
              title={project.name}
              onClick={() => onOpenProject(project.id)}
            >
              <span
                className="rf-stage-dot"
                data-stage={project.stage || "idea"}
                aria-hidden="true"
              />
              {collapsed ? null : (
                <>
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  {project.updatedAt ? (
                    <span className="shrink-0 text-[0.68rem] text-muted-foreground">
                      {formatRelativeTime(project.updatedAt)}
                    </span>
                  ) : null}
                </>
              )}
            </button>
          ))
        ) : (
          <div className="rf-sidebar-placeholder">
            {collapsed ? null : (
              <>
                <div className="font-medium text-foreground">No projects yet</div>
                <div className="mt-1">Start with an idea.</div>
              </>
            )}
          </div>
        )}
      </div>
      <div className="mt-auto border-t border-border pt-3">
        <button
          className="rf-sidebar-link"
          type="button"
          title={
            provider
              ? `${provider.label}${provider.mode === "mock" ? " · offline" : ""}`
              : undefined
          }
          onClick={onOpenSettings}
        >
          <Settings2 className="size-4 shrink-0" />
          {collapsed ? null : <span>Settings</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      <aside
        className={`rf-sidebar hidden shrink-0 flex-col border-r border-sidebar-border px-2.5 py-4 lg:flex ${
          collapsed ? "w-16" : "w-[220px]"
        }`}
      >
        {content}
      </aside>
      {mobileOpen ? (
        <div
          className="rf-drawer-backdrop lg:hidden"
          role="presentation"
          onClick={onCloseMobile}
        >
          <aside
            className="rf-sidebar flex h-full w-[min(280px,86vw)] flex-col border-r border-sidebar-border px-3 py-4"
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
