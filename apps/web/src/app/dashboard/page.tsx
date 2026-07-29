"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sparkles, Plus, FolderGit2, Clock, LogOut, User as UserIcon, ArrowRight } from "lucide-react";

type Project = {
  id: string;
  name: string;
  description: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type Session = { user: { id: string; email: string; name: string } } | null;

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [session, setSession] = useState<Session>(null);

  useEffect(() => {
    fetch("/api/auth/get-session")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d?.user) {
          router.push("/login");
          return;
        }
        setSession(d);
        return fetch("/api/projects");
      })
      .then((r) => r?.json())
      .then((d) => {
        setProjects(d?.projects || []);
        setLoading(false);
      })
      .catch(() => {
        router.push("/login");
        setLoading(false);
      });
  }, [router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json();
      if (data.project) {
        router.push(`/project/${data.project.id}`);
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleSignOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background dark text-foreground flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground animate-pulse">Loading workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark text-foreground selection:bg-primary/30 relative">
      {/* Abstract Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px]" />
      </div>

      {/* Top bar */}
      <nav className="glass sticky top-0 z-50 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <Sparkles className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
            <span className="text-lg font-bold tracking-tight text-gradient">RockFoundry</span>
          </Link>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full glass border-white/5 text-xs text-muted-foreground">
              <UserIcon className="w-3 h-3" />
              {session?.user?.email}
            </div>
            <Link href="/account">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground hover:bg-white/5">Account</Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground hover:text-destructive hover:bg-destructive/10">
              <LogOut className="w-4 h-4 mr-2" />
              Log out
            </Button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-12">
          <div>
            <h1 className="text-3xl font-bold">Your Workspace</h1>
            <p className="text-muted-foreground mt-1">Manage your product ideas and build packages.</p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5">
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </Button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="mb-12 animate-in slide-in-from-top-4 fade-in duration-300">
            <form onSubmit={handleCreate} className="glass-panel p-6 rounded-2xl max-w-xl border-primary/20 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
              <h2 className="text-lg font-semibold mb-1">Create a new project</h2>
              <p className="text-sm text-muted-foreground mb-4">Start with a name, you can describe the idea later.</p>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  required
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Acme CRM..."
                  className="flex-1 px-4 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                />
                <div className="flex gap-2">
                  <Button type="submit" disabled={creating} className="rounded-xl px-6">
                    {creating ? "Creating..." : "Create"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setShowCreate(false)} className="rounded-xl">
                    Cancel
                  </Button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Project list */}
        {projects.length === 0 ? (
          <div className="glass-panel p-16 text-center rounded-3xl border-white/5 border-dashed border-2">
            <FolderGit2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No projects yet</h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">Turn your first rough idea into a structured build package ready for coding agents.</p>
            <Button onClick={() => setShowCreate(true)} size="lg" className="rounded-full shadow-xl shadow-primary/20">
              <Plus className="w-4 h-4 mr-2" />
              Create your first project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/project/${p.id}`}
                className="group glass-panel p-6 rounded-2xl border-white/5 hover:border-primary/30 transition-all duration-300 hover:-translate-y-1 relative overflow-hidden flex flex-col h-full"
              >
                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowRight className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-2 pr-6">{p.name}</h3>
                  {p.description ? (
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                      {p.description}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground/50 italic">No description provided yet.</p>
                  )}
                </div>
                <div className="mt-6 flex items-center justify-between text-xs text-muted-foreground/70 border-t border-border/50 pt-4">
                  <span className="flex items-center gap-1.5 font-medium px-2 py-1 rounded bg-secondary/50">
                    v{p.version}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    {new Date(p.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
