"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

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
    // Fetch session
    fetch("/api/auth/get-session")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d?.user) {
          router.push("/login");
          return;
        }
        setSession(d);
        // Fetch projects
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <nav className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="font-semibold text-sm">RockFoundry</Link>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500">{session?.user?.email}</span>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>Log out</Button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Projects</h1>
          <Button onClick={() => setShowCreate(true)}>New project</Button>
        </div>

        {/* Create form */}
        {showCreate && (
          <form onSubmit={handleCreate} className="mb-8 p-4 bg-white border rounded-lg max-w-xl">
            <h2 className="text-sm font-medium mb-3">Create a new project</h2>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Project name"
              className="w-full px-3 py-2 border rounded-md text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={creating}>
                {creating ? "Creating..." : "Create"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {/* Project list */}
        {projects.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 mb-4">No projects yet.</p>
            <Button onClick={() => setShowCreate(true)}>Create your first project</Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/project/${p.id}`}
                className="block p-4 bg-white border rounded-lg hover:border-gray-400 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{p.name}</h3>
                    {p.description && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-1">{p.description}</p>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    v{p.version} · {new Date(p.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
