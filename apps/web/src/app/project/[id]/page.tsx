"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

type ProjectData = {
  id: string;
  name: string;
  description: string | null;
  canonicalState: any;
  version: number;
};

type ExtractionResult = {
  extraction: any;
  merge: any;
  state: any;
  runId: string;
  version: number;
};

type Question = {
  id: string;
  text: string;
  answerType: string;
  options?: { id: string; label: string; description?: string }[];
  recommendation?: string;
  priority: number;
  reasonAsked: string;
};

type Reference = {
  id: string;
  type: string;
  url: string;
  status: string;
  metadata: any;
};

type Revision = { id: string; version: number; createdAt: string };

// Tabs
type Tab = "overview" | "understanding" | "questions" | "references" | "readiness" | "documents" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "understanding", label: "Understanding" },
  { id: "questions", label: "Questions" },
  { id: "references", label: "References" },
  { id: "readiness", label: "Readiness" },
  { id: "documents", label: "Documents" },
  { id: "history", label: "History" },
];

export default function ProjectWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [projectId, setProjectId] = useState<string>("");
  const [project, setProject] = useState<ProjectData | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  // Idea state
  const [rawIdea, setRawIdea] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);

  // Questions state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [answerLoading, setAnswerLoading] = useState<string | null>(null);

  // References state
  const [references, setReferences] = useState<Reference[]>([]);
  const [newRefUrl, setNewRefUrl] = useState("");
  const [newRefType, setNewRefType] = useState<"URL" | "GITHUB_REPO">("URL");
  const [addingRef, setAddingRef] = useState(false);

  // Export state
  const [exportReady, setExportReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Initialize project
  useEffect(() => {
    params.then(({ id }) => {
      setProjectId(id);
      fetchProject(id);
    });
  }, [params]);

  const fetchProject = async (id: string) => {
    try {
      setPageError("");
      const res = await fetch(`/api/projects/${id}`);
      if (res.status === 401) { router.push("/login"); return; }
      if (!res.ok) {
        setPageError(res.status === 404 ? "Project not found or you do not have access." : "Unable to load this project.");
        return;
      }
      const data = await res.json();
      setProject(data.project);
      setRawIdea(data.project.description || "");
    } catch {
      setPageError("Unable to load this project. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  // Extraction
  const handleExtract = async () => {
    if (!rawIdea.trim() || !projectId) return;
    setExtracting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawIdea }),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      setExtractionResult(data);
      setProject((prev) => prev ? { ...prev, canonicalState: data.state, version: data.version } : prev);
    } catch (e: any) {
      alert("Extraction failed: " + e.message);
    } finally {
      setExtracting(false);
    }
  };

  // Questions
  const fetchQuestions = useCallback(async () => {
    if (!projectId) return;
    setLoadingQuestions(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/questions`);
      const data = await res.json();
      setQuestions(data.questions || []);
    } finally {
      setLoadingQuestions(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (tab === "questions" && projectId) fetchQuestions();
  }, [tab, projectId, fetchQuestions]);

  const handleAnswer = async (questionId: string, answer: string) => {
    setAnswerLoading(questionId);
    try {
      const res = await fetch(`/api/projects/${projectId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, answer }),
      });
      const data = await res.json();
      if (data.state) {
        setProject((prev) => prev ? { ...prev, canonicalState: data.state, version: data.version } : prev);
      }
      // Refresh questions
      fetchQuestions();
    } finally {
      setAnswerLoading(null);
    }
  };

  // References
  const fetchReferences = useCallback(async () => {
    if (!projectId) return;
    const res = await fetch(`/api/projects/${projectId}/references`);
    const data = await res.json();
    setReferences(data.references || []);
  }, [projectId]);

  useEffect(() => {
    if (tab === "references" && projectId) fetchReferences();
  }, [tab, projectId, fetchReferences]);

  const handleAddRef = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingRef(true);
    try {
      await fetch(`/api/projects/${projectId}/references`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: newRefType, url: newRefUrl }),
      });
      setNewRefUrl("");
      fetchReferences();
    } finally {
      setAddingRef(false);
    }
  };

  const fetchRevisions = useCallback(async () => {
    if (!projectId) return;
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/revisions`);
      if (!res.ok) throw new Error("Unable to load history");
      const data = await res.json();
      setRevisions(data.revisions || []);
    } catch {
      setPageError("Unable to load project history.");
    } finally {
      setLoadingHistory(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (tab === "history" && projectId) fetchRevisions();
  }, [tab, projectId, fetchRevisions]);

  // Export
  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/export`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Export failed");
      setExportReady(Boolean(data.downloadUrl));
    } finally {
      setExporting(false);
    }
  };

  const downloadZip = () => {
    window.location.assign(`/api/projects/${projectId}/export`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" role="status" aria-live="polite">
        <p className="text-sm text-gray-500">Loading project...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-4" role="alert">
          <h1 className="text-lg font-semibold">Project unavailable</h1>
          <p className="text-sm text-gray-600">{pageError || "This project could not be loaded."}</p>
          <Button onClick={() => router.push("/dashboard")}>Back to projects</Button>
        </div>
      </div>
    );
  }

  const state = project.canonicalState || {};

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <nav className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">Projects</Link>
            <span className="text-gray-300">/</span>
            <span className="font-medium text-sm">{project.name}</span>
            <span className="text-xs text-gray-400">v{project.version}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              Readiness: <span className="font-medium text-gray-700">{state.readiness?.replace("_", " ") || "IDEA READY"}</span>
            </span>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Tab navigation */}
        <div className="flex gap-1 border-b mb-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {pageError && (
          <div className="mb-6 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md" role="alert">
            {pageError}
          </div>
        )}

        {/* Tab content */}
        {tab === "overview" && (
          <OverviewTab
            state={state}
            rawIdea={rawIdea}
            setRawIdea={setRawIdea}
            extracting={extracting}
            onExtract={handleExtract}
            extractionResult={extractionResult}
          />
        )}

        {tab === "understanding" && (
          <UnderstandingTab state={state} extractionResult={extractionResult} />
        )}

        {tab === "questions" && (
          <QuestionsTab
            questions={questions}
            loading={loadingQuestions}
            answerLoading={answerLoading}
            onAnswer={handleAnswer}
            onRefresh={fetchQuestions}
          />
        )}

        {tab === "references" && (
          <ReferencesTab
            references={references}
            newRefUrl={newRefUrl}
            setNewRefUrl={setNewRefUrl}
            newRefType={newRefType}
            setNewRefType={setNewRefType}
            addingRef={addingRef}
            onAdd={handleAddRef}
          />
        )}

        {tab === "readiness" && (
          <ReadinessTab state={state} />
        )}

        {tab === "documents" && (
          <DocumentsTab
            exportReady={exportReady}
            exporting={exporting}
            onExport={handleExport}
            onDownload={downloadZip}
          />
        )}

        {tab === "history" && (
          <HistoryTab revisions={revisions} loading={loadingHistory} />
        )}
      </div>
    </div>
  );
}

// ========== OVERVIEW TAB ==========
function OverviewTab({ state, rawIdea, setRawIdea, extracting, onExtract, extractionResult }: any) {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Your product idea</h2>
        <textarea
          value={rawIdea}
          onChange={(e: any) => setRawIdea(e.target.value)}
          placeholder="Describe your product idea here. The more detail, the better the extraction..."
          className="w-full h-40 p-4 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={onExtract} disabled={extracting || !rawIdea.trim()}>
            {extracting ? "Analyzing..." : state.normalizedSummary ? "Re-analyze idea" : "Analyze idea"}
          </Button>
          {state.normalizedSummary && (
            <span className="text-xs text-green-600">✓ Extracted and merged into project state</span>
          )}
        </div>
      </div>

      {state.normalizedSummary && (
        <div className="p-4 bg-white border rounded-lg">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Normalized summary</h3>
          <p className="text-sm">{state.normalizedSummary}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {state.targetUsers?.length > 0 && (
          <div className="p-4 bg-white border rounded-lg">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Target users</h3>
            <ul className="text-sm space-y-1">
              {state.targetUsers.map((u: string, i: number) => <li key={i}>• {u}</li>)}
            </ul>
          </div>
        )}
        {state.entities?.length > 0 && (
          <div className="p-4 bg-white border rounded-lg">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Core entities</h3>
            <ul className="text-sm space-y-1">
              {state.entities.map((e: string, i: number) => <li key={i}>• {e}</li>)}
            </ul>
          </div>
        )}
        {state.features?.length > 0 && (
          <div className="p-4 bg-white border rounded-lg">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Features</h3>
            <ul className="text-sm space-y-1">
              {state.features.map((f: string, i: number) => <li key={i}>• {f}</li>)}
            </ul>
          </div>
        )}
        {state.assumptions?.length > 0 && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <h3 className="text-sm font-medium text-amber-700 mb-2">Assumptions ({state.assumptions.length})</h3>
            <ul className="text-sm space-y-1 text-amber-800">
              {state.assumptions.slice(0, 5).map((a: any, i: number) => (
                <li key={i}>• {a.statement}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ========== UNDERSTANDING TAB ==========
function UnderstandingTab({ state, extractionResult }: any) {
  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-lg font-semibold">What the AI understood</h2>

      {extractionResult?.merge && (
        <div className="p-4 bg-gray-50 border rounded-lg text-sm space-y-1">
          <p className="font-medium">Merge results:</p>
          {extractionResult.merge.appliedChanges?.map((c: string, i: number) => (
            <p key={i} className="text-green-700">✓ {c}</p>
          ))}
          {extractionResult.merge.skippedChanges?.map((c: string, i: number) => (
            <p key={i} className="text-gray-500">⊘ {c}</p>
          ))}
          {extractionResult.merge.assumptionsCreated > 0 && (
            <p className="text-amber-600">⚠ {extractionResult.merge.assumptionsCreated} assumptions created</p>
          )}
          {extractionResult.merge.questionsCreated > 0 && (
            <p className="text-blue-600">? {extractionResult.merge.questionsCreated} open questions created</p>
          )}
          {extractionResult.merge.conflictsDetected > 0 && (
            <p className="text-red-600">⚠ {extractionResult.merge.conflictsDetected} potential contradictions detected</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        <Section title="Objectives" items={state.objectives} />
        <Section title="Constraints" items={state.constraints} />
        <Section title="Integrations" items={state.integrations} />
        <Section title="Open questions" items={state.openQuestions} />
        <Section title="Risks" items={state.risks} />
      </div>

      {state.contradictions?.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <h3 className="text-sm font-medium text-red-700 mb-2">Contradictions detected</h3>
          {state.contradictions.map((c: any, i: number) => (
            <div key={i} className="text-sm text-red-800 space-y-1">
              <p><span className="font-medium">[{c.severity}]</span> {c.explanation}</p>
              <p className="text-red-600 text-xs">→ {c.recommendedResolution}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="p-4 bg-white border rounded-lg">
      <h3 className="text-sm font-medium text-gray-500 mb-2">{title}</h3>
      <ul className="text-sm space-y-1">
        {items.map((item: string, i: number) => <li key={i}>• {item}</li>)}
      </ul>
    </div>
  );
}

// ========== QUESTIONS TAB ==========
function QuestionsTab({ questions, loading, answerLoading, onAnswer, onRefresh }: any) {
  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Adaptive questions</h2>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      {questions.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-500">
          <p>No more questions right now.</p>
          <p className="text-sm mt-1">Add more details to your idea or check the readiness tab.</p>
        </div>
      )}

      {questions.map((q: Question) => (
        <div key={q.id} className="p-5 bg-white border rounded-lg">
          <p className="text-sm font-medium mb-1">{q.text}</p>
          <p className="text-xs text-gray-400 mb-3">{q.reasonAsked}</p>

          {q.options && q.options.length > 0 && (
            <div className="space-y-2">
              {q.options.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => onAnswer(q.id, opt.id)}
                  disabled={answerLoading !== null}
                  className="w-full text-left p-3 border rounded-md text-sm hover:bg-gray-50 hover:border-gray-400 transition-colors disabled:opacity-50"
                >
                  <span className="font-medium">{opt.label}</span>
                  {opt.description && <span className="text-gray-500 ml-2">— {opt.description}</span>}
                </button>
              ))}
            </div>
          )}

          {q.recommendation && (
            <p className="mt-2 text-xs text-gray-500 italic">Recommendation: {q.recommendation}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ========== REFERENCES TAB ==========
function ReferencesTab({ references, newRefUrl, setNewRefUrl, newRefType, setNewRefType, addingRef, onAdd }: any) {
  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-lg font-semibold">References</h2>
      <p className="text-sm text-gray-600">Add websites or GitHub repos to help RockFoundry understand your product better.</p>

      <form onSubmit={onAdd} className="p-4 bg-white border rounded-lg space-y-3">
        <div className="flex gap-2">
          <select
            value={newRefType}
            onChange={(e) => setNewRefType(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="URL">Website URL</option>
            <option value="GITHUB_REPO">GitHub Repository</option>
          </select>
          <input
            type="url"
            required
            value={newRefUrl}
            onChange={(e) => setNewRefUrl(e.target.value)}
            placeholder={newRefType === "URL" ? "https://example.com" : "https://github.com/user/repo"}
            className="flex-1 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <Button type="submit" size="sm" disabled={addingRef}>
            {addingRef ? "Adding..." : "Add"}
          </Button>
        </div>
      </form>

      {references.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">No references added yet.</p>
      ) : (
        <div className="space-y-2">
          {references.map((ref: Reference) => (
            <div key={ref.id} className="p-4 bg-white border rounded-lg flex items-center justify-between">
              <div>
                <span className="text-xs font-medium bg-gray-100 px-2 py-0.5 rounded mr-2">{ref.type}</span>
                <a href={ref.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
                  {ref.url}
                </a>
              </div>
              <span className={`text-xs ${ref.status === "analyzed" ? "text-green-600" : "text-gray-400"}`}>
                {ref.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ========== READINESS TAB ==========
function ReadinessTab({ state }: { state: any }) {
  const score = state.generationMetadata?.lastReadinessScore || 0;
  const readiness = state.readiness?.replace("_", " ") || "IDEA READY";

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-lg font-semibold">Build readiness</h2>

      {/* Score */}
      <div className="p-6 bg-white border rounded-lg text-center">
        <div className="text-4xl font-bold">{readiness}</div>
        <p className="text-sm text-gray-500 mt-2">Current readiness level</p>
      </div>

      {/* Data summary */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Target users" count={state.targetUsers?.length || 0} />
        <StatCard label="Entities" count={state.entities?.length || 0} />
        <StatCard label="Features" count={state.features?.length || 0} />
        <StatCard label="Objectives" count={state.objectives?.length || 0} />
        <StatCard label="Decisions" count={state.decisions?.length || 0} />
        <StatCard label="Open questions" count={state.openQuestions?.length || 0} />
        <StatCard label="Assumptions" count={state.assumptions?.length || 0} />
        <StatCard label="Contradictions" count={state.contradictions?.length || 0} alert={state.contradictions?.length > 0} />
      </div>

      {/* Contradictions */}
      {state.contradictions?.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <h3 className="text-sm font-medium text-red-700 mb-2">Blocking contradictions</h3>
          {state.contradictions.map((c: any, i: number) => (
            <div key={i} className="text-sm text-red-800">
              <p><span className="font-medium">[{c.severity}]</span> {c.explanation}</p>
              <p className="text-xs text-red-600 ml-4">→ {c.recommendedResolution}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, count, alert }: { label: string; count: number; alert?: boolean }) {
  return (
    <div className={`p-4 border rounded-lg ${alert ? "bg-red-50 border-red-200" : "bg-white"}`}>
      <div className="text-2xl font-bold">{count}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  );
}

// ========== DOCUMENTS TAB ==========
function HistoryTab({ revisions, loading }: { revisions: Revision[]; loading: boolean }) {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Project history</h2>
        <p className="mt-1 text-sm text-gray-600">A read-only timeline of saved project state versions.</p>
      </div>
      {loading ? (
        <div className="p-6 bg-white border rounded-lg text-sm text-gray-500" role="status">Loading history...</div>
      ) : revisions.length === 0 ? (
        <div className="p-6 bg-white border rounded-lg text-sm text-gray-500" role="status">No saved revisions yet. Analyze your idea to create the first revision.</div>
      ) : (
        <ol className="space-y-3" aria-label="Project revisions">
          {revisions.map((revision) => (
            <li key={revision.id} className="p-4 bg-white border rounded-lg flex items-center justify-between">
              <span className="font-medium text-sm">Version {revision.version}</span>
              <time className="text-xs text-gray-500" dateTime={revision.createdAt}>{new Date(revision.createdAt).toLocaleString()}</time>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function DocumentsTab({ exportReady, exporting, onExport, onDownload }: { exportReady: boolean; exporting: boolean; onExport: () => void; onDownload: () => void }) {
  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-lg font-semibold">Build Package</h2>
      <p className="text-sm text-gray-600">Generate a documentation package for your coding agent, then download the ZIP.</p>
      <div className="flex gap-3">
        <Button onClick={onExport} disabled={exporting}>{exporting ? "Generating..." : "Generate Build Package"}</Button>
        {exportReady && <Button variant="outline" onClick={onDownload}>Download ZIP</Button>}
      </div>
      {exportReady && <p className="rounded-lg border bg-white p-3 text-sm text-green-700">Build package ready for download.</p>}
    </div>
  );
}
