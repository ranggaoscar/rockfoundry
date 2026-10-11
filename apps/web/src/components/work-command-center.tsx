"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Circle,
  Clock3,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import "./work-command-center.css";
import { LivingWorkspace } from "./living-workspace";

type Status = "TODO" | "IN_PROGRESS" | "REVIEW_REQUIRED" | "DONE";
type Assignment = {
  kind: "HUMAN" | "EXECUTOR";
  humanId?: string | null;
  executorId?: string | null;
} | null;
type Task = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  acceptanceCriteria: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  status: Status;
  dueAt: string | null;
  plannedDate: string | null;
  goalId: string | null;
  milestoneId: string | null;
  activeExecutionId: string | null;
  assignment: Assignment;
};
type Goal = { id: string; title: string; status: string };
type Milestone = {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  goalId: string | null;
};
type Project = {
  id: string;
  name: string;
  description: string | null;
  workStatus: "ACTIVE" | "PAUSED" | "DONE";
  targetDate: string | null;
  tasks: Task[];
  goals: Goal[];
  milestones: Milestone[];
};
type Evidence = {
  id: string;
  title: string;
  content: string;
  uri: string | null;
  kind: string;
};
type Run = {
  id: string;
  taskId: string;
  executorId: string;
  status:
    | "QUEUED"
    | "SUBMITTING"
    | "RUNNING"
    | "REVIEW_REQUIRED"
    | "COMPLETED"
    | "FAILED"
    | "REJECTED";
  externalId: string | null;
  output: string | null;
  errorSummary: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  task: { id: string; title: string; projectId: string };
  evidence: Evidence[];
  approval: {
    decision: "ACCEPTED" | "REJECTED";
    comment: string | null;
  } | null;
};
type WorkData = {
  workspace: { id: string; name: string };
  projects: Project[];
  runs: Run[];
  activity: Array<{
    id?: string;
    title?: string;
    description?: string;
    type?: string;
    detail?: string;
    createdAt?: string;
  }>;
  executors: Array<{
    id: "mock" | "hermes";
    label: string;
    available: boolean;
    reason?: string;
  }>;
};
type View = "today" | "projects" | "runs";
const EMPTY: WorkData = {
  workspace: { id: "", name: "Workspace" },
  projects: [],
  runs: [],
  activity: [],
  executors: [],
};
const ACTIVE_RUNS = ["QUEUED", "SUBMITTING", "RUNNING"];
const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const dateLabel = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "No date";

export function WorkCommandCenter({ view }: { view: View }) {
  const [data, setData] = useState<WorkData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState("");
  const [expanded, setExpanded] = useState("");
  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await fetch("/api/work", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not load work data.");
      setData(body as WorkData);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load work data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    const requestedProject = new URLSearchParams(window.location.search).get(
      "project",
    );
    const timer = window.setTimeout(() => {
      if (requestedProject) setSelected(requestedProject);
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const polling = useRef(false);
  const activeRunIds = (data.runs || [])
    .filter((run) => ACTIVE_RUNS.includes(run.status))
    .map((run) => run.id)
    .join(",");
  useEffect(() => {
    if (!activeRunIds) return;
    const timer = window.setInterval(async () => {
      if (polling.current) return;
      polling.current = true;
      try {
        for (const runId of activeRunIds.split(",")) {
          const response = await fetch("/api/work", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "poll", runId }),
          });
          if (!response.ok) break;
        }
        await load(true);
      } catch {
        setError("Execution refresh failed. Retry the persisted run safely.");
      } finally {
        polling.current = false;
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeRunIds, load]);
  const action = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy(true);
      setNotice("");
      setError("");
      try {
        const response = await fetch("/api/work", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Action failed.");
        setNotice("Saved.");
        await load(true);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );
  const projects = data.projects || [];
  const tasks = projects.flatMap((project) => project.tasks || []);
  const today = dayKey(new Date());
  const dateKey = (value: string | null) =>
    value ? dayKey(new Date(value)) : null;
  const priorityRank = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
  tasks.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
  const todayTasks = tasks.filter(
    (t) =>
      t.status !== "DONE" &&
      (dateKey(t.plannedDate) === today || dateKey(t.dueAt) === today),
  );
  const overdue = tasks.filter(
    (t) => t.status !== "DONE" && t.dueAt && dateKey(t.dueAt)! < today,
  );
  const upcoming = tasks.filter(
    (t) => t.status !== "DONE" && t.dueAt && dateKey(t.dueAt)! > today,
  );
  const reviewRuns = (data.runs || []).filter(
    (run) => run.status === "REVIEW_REQUIRED",
  );
  const activeRuns = (data.runs || []).filter((run) =>
    ACTIVE_RUNS.includes(run.status),
  );
  const executors = data.executors || [];
  const selectedProject =
    projects.find((p) => p.id === selected) ||
    (view === "today"
      ? projects.find((project) => project.workStatus !== "DONE")
      : projects[0]);
  const nav = [
    { id: "today", label: "Today", href: "/today" },
    { id: "projects", label: "Projects", href: "/projects" },
    { id: "runs", label: "Agent Runs", href: "/runs" },
    { id: "inbox", label: "Idea Inbox", href: "/inbox" },
    { id: "ask", label: "Ask Rock", href: "/ask" },
  ] as const;

  async function poll(run: Run) {
    await action({ action: "poll", runId: run.id });
  }
  async function startRun(task: Task, executorId: "mock" | "hermes") {
    await action({
      action: "execute",
      taskId: task.id,
      executorId,
      requestId: crypto.randomUUID(),
    });
  }
  async function review(run: Run, decision: "ACCEPTED" | "REJECTED") {
    const comment = window.prompt(
      decision === "ACCEPTED"
        ? "Acceptance note (optional)"
        : "Why reject this run?",
      "",
    );
    if (comment === null) return;
    await action({ action: "review", runId: run.id, decision, comment });
  }
  async function complete(task: Task) {
    const comment = window.prompt(
      "Confirm this human task is complete",
      "Accepted",
    );
    if (comment?.trim())
      await action({
        action: "complete_task",
        taskId: task.id,
        comment: comment.trim(),
      });
  }

  return (
    <main className="work-shell">
      <header className="work-top">
        <div>
          <p className="work-kicker">
            WORK OS <span>·</span> {data.workspace.name || "Workspace"}
          </p>
          <h1>
            {view === "today"
              ? "Today"
              : view === "projects"
                ? "Projects"
                : "Agent Runs"}
          </h1>
          <p className="work-subtitle">
            {view === "today"
              ? "A clear view of what needs attention."
              : view === "projects"
                ? "Organize projects, tasks, and milestones."
                : "Inspect execution progress and review results."}
          </p>
        </div>
        <button
          className="work-button work-secondary"
          disabled={refreshing || loading}
          onClick={() => void load(true)}
          aria-label="Refresh work data"
        >
          <RefreshCw size={16} className={refreshing ? "work-spin" : ""} />{" "}
          Refresh
        </button>
      </header>
      <nav className="work-tabs" aria-label="Work OS navigation">
        {nav.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            aria-current={view === item.id ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
        <div className="living-sidebar-projects" aria-label="Active projects">
          {projects.slice(0, 8).map((project) => (
            <Link key={project.id} href={`/projects?project=${project.id}`}>
              {project.name}
            </Link>
          ))}
        </div>
        <Link href="/" className="work-product-link">
          Legacy Projects · Product Studio <ArrowUpRight size={14} />
        </Link>
      </nav>
      {error && (
        <div className="work-alert" role="alert">
          {error}
          <button onClick={() => void load()} className="work-button">
            Retry
          </button>
        </div>
      )}
      {notice && (
        <p className="work-notice" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <div className="work-empty" role="status">
          Loading work…
        </div>
      ) : (
        <>
          {view === "today" && (
            <>
              <LivingWorkspace mode="today" />
              {!projects.length && (
                <section className="work-panel">
                  <h2>Your Work OS starts here</h2>
                  <p className="work-empty">
                    No active work yet. Historical Product Studio projects stay
                    separate; create your first operational project when ready.
                  </p>
                  <Link className="work-button work-primary" href="/projects">
                    Create Project
                  </Link>
                  <Link className="work-button work-secondary" href="/projects">
                    Create Task · choose a project first
                  </Link>
                </section>
              )}
              <details className="work-panel">
                <summary className="work-text-link">Quick add task</summary>
                {selectedProject ? (
                  <>
                    <label className="work-project-meta">
                      Project
                      <select
                        aria-label="Quick task project"
                        value={selectedProject.id}
                        onChange={(e) => setSelected(e.target.value)}
                      >
                        {projects
                          .filter((project) => project.workStatus !== "DONE")
                          .map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <TaskForm
                      key={selectedProject.id}
                      project={selectedProject}
                      busy={busy}
                      onSubmit={(value) =>
                        action({
                          action: "create_task",
                          projectId: selectedProject.id,
                          ...value,
                        })
                      }
                    />
                  </>
                ) : (
                  <Link className="work-text-link" href="/projects">
                    Create a project to add your first task
                  </Link>
                )}
              </details>
              <section className="work-summary" aria-label="Today's priorities">
                <div>
                  <span>Due today</span>
                  <strong>{todayTasks.length}</strong>
                </div>
                <div>
                  <span>Overdue</span>
                  <strong>{overdue.length}</strong>
                </div>
                <div>
                  <span>Needs review</span>
                  <strong>{reviewRuns.length}</strong>
                </div>
                <div>
                  <span>Active runs</span>
                  <strong>{activeRuns.length}</strong>
                </div>
              </section>
              <section className="work-panel">
                <div className="work-panel-head">
                  <div>
                    <h2>Priority tasks</h2>
                    <p>Planned or due today, plus overdue tasks.</p>
                  </div>
                  <Link className="work-text-link" href="/projects">
                    All projects <ArrowUpRight size={14} />
                  </Link>
                </div>
                {overdue.length + todayTasks.length === 0 ? (
                  <div className="work-empty">
                    Nothing scheduled or overdue. Add a task from Projects when
                    work comes up.
                  </div>
                ) : (
                  <div className="work-task-list">
                    {[
                      ...overdue,
                      ...todayTasks.filter(
                        (t) => !overdue.some((o) => o.id === t.id),
                      ),
                    ].map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        project={projects.find((p) => p.id === task.projectId)}
                        executors={executors}
                        busy={busy}
                        onExecute={startRun}
                        onComplete={complete}
                      />
                    ))}
                  </div>
                )}
              </section>
              <section className="work-panel">
                <div className="work-panel-head">
                  <h2>Upcoming tasks</h2>
                </div>
                {upcoming.length ? (
                  upcoming.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      project={projects.find(
                        (project) => project.id === task.projectId,
                      )}
                      executors={executors}
                      busy={busy}
                      onExecute={startRun}
                      onComplete={complete}
                    />
                  ))
                ) : (
                  <p className="work-empty">No upcoming deadlines.</p>
                )}
              </section>
              <section className="work-two-col">
                <RunList
                  runs={[...reviewRuns, ...activeRuns]}
                  busy={busy}
                  onPoll={poll}
                  onReview={review}
                  onExpand={setExpanded}
                  expanded={expanded}
                  compact
                />
                <div className="work-panel">
                  <div className="work-panel-head">
                    <div>
                      <h2>Projects</h2>
                      <p>
                        {projects.length
                          ? `${projects.length} in this workspace`
                          : "Your projects appear here."}
                      </p>
                    </div>
                    <Link className="work-text-link" href="/projects">
                      Browse <ArrowUpRight size={14} />
                    </Link>
                  </div>
                  {projects.slice(0, 4).map((p) => (
                    <button
                      key={p.id}
                      className="work-project-line"
                      onClick={() => {
                        window.location.href = `/projects?project=${encodeURIComponent(p.id)}`;
                      }}
                    >
                      <span>{p.name}</span>
                      <span>
                        {p.tasks.filter((t) => t.status === "DONE").length}/
                        {p.tasks.length} done
                      </span>
                    </button>
                  ))}
                  {!projects.length && (
                    <div className="work-empty">No projects yet.</div>
                  )}
                </div>
              </section>
              <section className="work-panel">
                <h2>Recent project activity</h2>
                {data.activity.length ? (
                  <ol>
                    {data.activity.slice(0, 8).map((entry, index) => (
                      <li key={entry.id || index}>
                        <strong>
                          {entry.type?.replaceAll("_", " ") || entry.title}
                        </strong>
                        <p>{entry.detail || entry.description}</p>
                        <small>
                          {entry.createdAt
                            ? new Date(entry.createdAt).toLocaleString()
                            : ""}
                        </small>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="work-empty">
                    No activity yet. Confirmed changes appear here.
                  </p>
                )}
              </section>
            </>
          )}
          {view === "projects" && (
            <div className="work-project-layout">
              <aside className="work-panel work-project-select">
                <div className="work-panel-head">
                  <h2>Workspace projects</h2>
                  <button
                    className="work-button work-primary"
                    onClick={async () => {
                      const name = window.prompt("Project name");
                      if (name?.trim())
                        await action({
                          action: "create_project",
                          name: name.trim(),
                        });
                    }}
                    disabled={busy}
                  >
                    <Plus size={16} /> New
                  </button>
                </div>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    className="work-project-choice"
                    aria-current={
                      selectedProject?.id === p.id ? "true" : undefined
                    }
                    onClick={() => setSelected(p.id)}
                  >
                    <strong>{p.name}</strong>
                    <span>
                      {p.workStatus} ·{" "}
                      {p.tasks.filter((t) => t.status === "DONE").length}/
                      {p.tasks.length} tasks done
                    </span>
                  </button>
                ))}
                {!projects.length && (
                  <div className="work-empty">
                    No projects yet. Create one to start organizing work.
                  </div>
                )}
              </aside>
              {selectedProject ? (
                <section className="work-panel">
                  <div className="work-panel-head">
                    <div>
                      <p className="work-kicker">PROJECT</p>
                      <Link
                        className="work-text-link"
                        href={`/project/${selectedProject.id}`}
                      >
                        Open Product Studio <ArrowUpRight size={14} />
                      </Link>
                      <h2>{selectedProject.name}</h2>
                    </div>
                    <button
                      className="work-button work-secondary"
                      disabled={busy}
                      onClick={async () => {
                        const name = window.prompt(
                          "Project name",
                          selectedProject.name,
                        );
                        if (name?.trim())
                          await action({
                            action: "update_project",
                            projectId: selectedProject.id,
                            name: name.trim(),
                          });
                      }}
                    >
                      Rename
                    </button>
                  </div>
                  <div className="work-project-meta">
                    <label>
                      Status
                      <select
                        aria-label="Project status"
                        value={selectedProject.workStatus}
                        disabled={busy}
                        onChange={(e) =>
                          void action({
                            action: "update_project",
                            projectId: selectedProject.id,
                            workStatus: e.target.value,
                          })
                        }
                      >
                        <option value="ACTIVE">Active</option>
                        <option value="PAUSED">Paused</option>
                        <option value="DONE">Done</option>
                      </select>
                    </label>
                    <span>
                      {
                        selectedProject.tasks.filter((t) => t.status === "DONE")
                          .length
                      }{" "}
                      of {selectedProject.tasks.length} tasks complete
                    </span>
                  </div>
                  <TaskForm
                    key={selectedProject.id}
                    project={selectedProject}
                    busy={busy}
                    onSubmit={(v) =>
                      action({
                        action: "create_task",
                        projectId: selectedProject.id,
                        ...v,
                      })
                    }
                  />
                  <div className="work-panel-head work-task-heading">
                    <div>
                      <h3>Tasks</h3>
                      <p>Update task status and manage execution.</p>
                    </div>
                  </div>
                  {selectedProject.tasks.length ? (
                    <div className="work-task-list">
                      {selectedProject.tasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          project={selectedProject}
                          executors={executors}
                          busy={busy}
                          onExecute={startRun}
                          onComplete={complete}
                          onUpdate={(payload) =>
                            action({
                              action: "update_task",
                              taskId: task.id,
                              ...payload,
                            })
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="work-empty">
                      No tasks in this project yet.
                    </div>
                  )}
                  <AuxiliaryForm
                    key={`aux-${selectedProject.id}`}
                    project={selectedProject}
                    busy={busy}
                    onAction={action}
                  />
                </section>
              ) : (
                <section className="work-panel work-empty">
                  Choose or create a project to view its work.
                </section>
              )}
            </div>
          )}
          {view === "runs" && (
            <>
              <div className="work-panel">
                <div className="work-panel-head">
                  <div>
                    <h2>Run history</h2>
                    <p>
                      Review agent output and evidence before accepting work.
                    </p>
                  </div>
                </div>
                {data.runs.length ? (
                  <RunList
                    runs={data.runs}
                    busy={busy}
                    onPoll={poll}
                    onReview={review}
                    onExpand={setExpanded}
                    expanded={expanded}
                  />
                ) : (
                  <div className="work-empty">
                    No agent runs yet. Assign a task to an executor from
                    Projects to start.
                  </div>
                )}
              </div>
              <div className="work-panel work-executor-info">
                <h2>Executors</h2>
                {executors.map((ex) => (
                  <div key={ex.id}>
                    <span>
                      {ex.label}{" "}
                      {ex.id === "mock" && <small>Development mock</small>}
                    </span>
                    <span
                      className={
                        ex.available ? "work-available" : "work-unavailable"
                      }
                    >
                      {ex.available ? "Available" : "Unavailable"}
                      {!ex.available && ex.reason ? ` · ${ex.reason}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}

function TaskForm({
  project,
  busy,
  onSubmit,
  initial,
  onCancel,
}: {
  project: Project;
  busy: boolean;
  onSubmit: (value: Record<string, unknown>) => Promise<boolean>;
  initial?: Task;
  onCancel?: () => void;
}) {
  const localDate = (value: string | null) =>
    value ? dayKey(new Date(value)) : "";
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [criteria, setCriteria] = useState(initial?.acceptanceCriteria || "");
  const [priority, setPriority] = useState<Task["priority"]>(
    initial?.priority || "NORMAL",
  );
  const [due, setDue] = useState(localDate(initial?.dueAt || null));
  const [planned, setPlanned] = useState(
    localDate(initial?.plannedDate || null),
  );
  const [goalId, setGoal] = useState(initial?.goalId || "");
  const [milestoneId, setMilestone] = useState(initial?.milestoneId || "");
  const [assignment, setAssignment] = useState(
    initial?.assignment?.executorId || "human",
  );
  const dateValue = (value: string) =>
    value ? new Date(`${value}T12:00:00`).toISOString() : null;
  return (
    <form
      className="work-create-task"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || !title.trim() || !criteria.trim()) return;
        const saved = await onSubmit({
          title: title.trim(),
          description: description || null,
          acceptanceCriteria: criteria.trim(),
          priority,
          dueAt: dateValue(due),
          plannedDate: dateValue(planned),
          goalId: goalId || null,
          milestoneId: milestoneId || null,
          assignment:
            assignment === "human"
              ? { kind: "HUMAN", humanId: "local-owner" }
              : { kind: "EXECUTOR", executorId: assignment },
        });
        if (saved && !initial) {
          setTitle("");
          setDescription("");
          setCriteria("");
          setDue("");
          setPlanned("");
        }
      }}
    >
      <h3>{initial ? "Edit task" : "Add task"}</h3>
      <label>
        Task title
        <input
          required
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What needs to be done?"
        />
      </label>
      <label>
        Description
        <textarea
          maxLength={10000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
        />
      </label>
      <label>
        Acceptance criteria
        <textarea
          required
          maxLength={10000}
          value={criteria}
          onChange={(event) => setCriteria(event.target.value)}
          rows={2}
          placeholder="How will you know it is complete?"
        />
      </label>
      <div className="work-form-row">
        <label>
          Priority
          <select
            value={priority}
            onChange={(event) =>
              setPriority(event.target.value as Task["priority"])
            }
          >
            {["LOW", "NORMAL", "HIGH", "URGENT"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Due date
          <input
            type="date"
            value={due}
            onChange={(event) => setDue(event.target.value)}
          />
        </label>
        <label>
          Planned date
          <input
            type="date"
            value={planned}
            onChange={(event) => setPlanned(event.target.value)}
          />
        </label>
        <label>
          Goal
          <select
            value={goalId}
            onChange={(event) => setGoal(event.target.value)}
          >
            <option value="">No goal</option>
            {project.goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Milestone
          <select
            value={milestoneId}
            onChange={(event) => setMilestone(event.target.value)}
          >
            <option value="">No milestone</option>
            {project.milestones.map((milestone) => (
              <option key={milestone.id} value={milestone.id}>
                {milestone.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Assign to
          <select
            value={assignment}
            onChange={(event) => setAssignment(event.target.value)}
          >
            <option value="human">Me (human)</option>
            <option value="mock">Mock executor (development)</option>
            <option value="hermes">Hermes executor</option>
          </select>
        </label>
      </div>
      <div className="work-task-actions">
        <button
          className="work-button work-primary"
          disabled={
            busy ||
            !title.trim() ||
            !criteria.trim() ||
            project.workStatus === "DONE"
          }
        >
          <Plus size={16} />
          {initial ? "Save task" : "Add task"}
        </button>
        {onCancel && (
          <button type="button" className="work-button" onClick={onCancel}>
            Cancel edit
          </button>
        )}
      </div>
    </form>
  );
}
function TaskRow({
  task,
  project,
  executors,
  busy,
  onExecute,
  onComplete,
  onUpdate,
}: {
  task: Task;
  project?: Project;
  executors: WorkData["executors"];
  busy: boolean;
  onExecute: (t: Task, id: "mock" | "hermes") => void;
  onComplete: (t: Task) => void;
  onUpdate?: (p: Record<string, unknown>) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [executor, setExecutor] = useState<"mock" | "hermes">(
    task.assignment?.executorId === "hermes" ? "hermes" : "mock",
  );
  if (editing && project && onUpdate)
    return (
      <TaskForm
        key={task.id}
        project={project}
        busy={busy}
        initial={task}
        onCancel={() => setEditing(false)}
        onSubmit={async (payload) => {
          const saved = await onUpdate(payload);
          if (saved) setEditing(false);
          return saved;
        }}
      />
    );
  return (
    <article className="work-task">
      <div className="work-task-main">
        <span
          className={`work-status-dot status-${task.status.toLowerCase()}`}
          aria-hidden="true"
        >
          {task.status === "DONE" ? <Check size={13} /> : <Circle size={12} />}
        </span>
        <div className="work-task-copy">
          <strong>{task.title}</strong>
          <span>
            {task.status.replaceAll("_", " ")} · {project?.name || "Project"} ·{" "}
            {task.priority} ·{" "}
            {task.dueAt
              ? `Due ${dateLabel(task.dueAt)}`
              : task.plannedDate
                ? `Planned ${dateLabel(task.plannedDate)}`
                : "No date"}
          </span>
        </div>
      </div>
      <div className="work-task-actions">
        {onUpdate && (
          <button
            className="work-button work-secondary"
            disabled={
              busy || !!task.activeExecutionId || task.status === "DONE"
            }
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        )}
        {task.status !== "DONE" && task.assignment?.kind === "HUMAN" && (
          <button
            className="work-button work-secondary"
            disabled={busy}
            onClick={() => onComplete(task)}
          >
            Complete
          </button>
        )}
        {task.status !== "DONE" && (
          <select
            aria-label={`Executor for ${task.title}`}
            value={executor}
            disabled={busy || !!task.activeExecutionId}
            onChange={(event) =>
              setExecutor(event.target.value as "mock" | "hermes")
            }
          >
            {executors.map((item) => (
              <option key={item.id} value={item.id} disabled={!item.available}>
                {item.label}
              </option>
            ))}
          </select>
        )}
        {task.status !== "DONE" && (
          <button
            className="work-button work-secondary"
            disabled={
              busy ||
              !!task.activeExecutionId ||
              !executors.some((item) => item.id === executor && item.available)
            }
            onClick={() => onExecute(task, executor)}
          >
            Execute with Agent
          </button>
        )}
      </div>
    </article>
  );
}
function RunList({
  runs,
  busy,
  onPoll,
  onReview,
  onExpand,
  expanded,
  compact = false,
}: {
  runs: Run[];
  busy: boolean;
  onPoll: (r: Run) => void;
  onReview: (r: Run, d: "ACCEPTED" | "REJECTED") => void;
  onExpand: (id: string) => void;
  expanded: string;
  compact?: boolean;
}) {
  return (
    <section className="work-panel">
      <div className="work-panel-head">
        <div>
          <h2>{compact ? "Agent attention" : "Runs"}</h2>
          <p>
            {compact
              ? "Active executions and results awaiting review."
              : `${runs.length} recorded run${runs.length === 1 ? "" : "s"}.`}
          </p>
        </div>
      </div>
      {runs.length === 0 ? (
        <div className="work-empty">No active runs or pending reviews.</div>
      ) : (
        <div className="work-run-list">
          {runs.map((run) => (
            <article className="work-run" key={run.id}>
              <div className="work-run-head">
                <div>
                  <span
                    className={`work-run-status run-${run.status.toLowerCase()}`}
                  >
                    {run.status.replaceAll("_", " ")}
                  </span>
                  <h3>{run.task.title}</h3>
                  <p>
                    {run.executorId === "mock"
                      ? "Mock · development only"
                      : run.executorId}{" "}
                    · {new Date(run.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="work-run-buttons">
                  {ACTIVE_RUNS.includes(run.status) && (
                    <button
                      className="work-button work-secondary"
                      disabled={busy}
                      onClick={() => onPoll(run)}
                    >
                      <Clock3 size={14} /> Poll
                    </button>
                  )}
                  {run.status === "FAILED" && (
                    <button
                      className="work-button work-secondary"
                      disabled={busy}
                      onClick={() => onPoll(run)}
                    >
                      Retry safely
                    </button>
                  )}
                  {run.status === "REVIEW_REQUIRED" && (
                    <>
                      <button
                        className="work-button work-primary"
                        disabled={busy}
                        onClick={() => onReview(run, "ACCEPTED")}
                      >
                        <Check size={14} /> Accept
                      </button>
                      <button
                        className="work-button work-secondary"
                        disabled={busy}
                        onClick={() => onReview(run, "REJECTED")}
                      >
                        <X size={14} /> Reject
                      </button>
                    </>
                  )}
                  <button
                    className="work-button work-secondary"
                    aria-expanded={expanded === run.id}
                    onClick={() => onExpand(expanded === run.id ? "" : run.id)}
                  >
                    {expanded === run.id ? "Hide details" : "Inspect"}
                  </button>
                </div>
              </div>
              {expanded === run.id && (
                <div className="work-run-detail">
                  {run.errorSummary && (
                    <p className="work-alert">{run.errorSummary}</p>
                  )}
                  <h4>Output</h4>
                  <pre>{run.output || "No output recorded."}</pre>
                  <h4>Evidence ({run.evidence.length})</h4>
                  {run.evidence.length ? (
                    run.evidence.map((item) => (
                      <details key={item.id}>
                        <summary>
                          {item.title} · {item.kind}
                        </summary>
                        <pre>{item.content}</pre>
                        {item.uri && /^https?:\/\//i.test(item.uri) && (
                          <a href={item.uri} target="_blank" rel="noreferrer">
                            Open source
                          </a>
                        )}
                      </details>
                    ))
                  ) : (
                    <p>No evidence attached.</p>
                  )}
                  {run.approval && (
                    <p>
                      Decision: {run.approval.decision}
                      {run.approval.comment ? ` · ${run.approval.comment}` : ""}
                    </p>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
function AuxiliaryForm({
  project,
  busy,
  onAction,
}: {
  project: Project;
  busy: boolean;
  onAction: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [goalTitle, setGoalTitle] = useState("");
  const [milestoneTitle, setMilestoneTitle] = useState("");
  return (
    <div className="work-auxiliary">
      <section>
        <h3>Goals</h3>
        {project.goals.map((g) => (
          <p key={g.id}>
            {g.title} <small>{g.status}</small>
          </p>
        ))}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              goalTitle.trim() &&
              (await onAction({
                action: "create_goal",
                projectId: project.id,
                title: goalTitle.trim(),
              }))
            )
              setGoalTitle("");
          }}
        >
          <label>
            Add goal
            <input
              aria-label="New goal title"
              value={goalTitle}
              onChange={(e) => setGoalTitle(e.target.value)}
              placeholder="Goal title"
            />
          </label>
          <button
            className="work-button work-secondary"
            disabled={busy || !goalTitle.trim()}
          >
            Add goal
          </button>
        </form>
      </section>
      <section>
        <h3>Milestones</h3>
        {project.milestones.map((m) => (
          <p key={m.id}>
            {m.title} · {m.dueAt ? dateLabel(m.dueAt) : m.status}
          </p>
        ))}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              milestoneTitle.trim() &&
              (await onAction({
                action: "create_milestone",
                projectId: project.id,
                title: milestoneTitle.trim(),
              }))
            )
              setMilestoneTitle("");
          }}
        >
          <label>
            Add milestone
            <input
              aria-label="New milestone title"
              value={milestoneTitle}
              onChange={(e) => setMilestoneTitle(e.target.value)}
              placeholder="Milestone title"
            />
          </label>
          <button
            className="work-button work-secondary"
            disabled={busy || !milestoneTitle.trim()}
          >
            Add milestone
          </button>
        </form>
      </section>
    </div>
  );
}
