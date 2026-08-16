import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronRight, Copy, Database, ExternalLink, History, Plus, RotateCcw, Search, Send, Trash2, X } from "lucide-react";
import {
  createProjectQuerySession,
  deleteProjectQuerySession,
  executeProjectQuery,
  fetchProjectQuerySession,
  fetchProjectQuerySessions,
  importProjectQueryHistory,
  interpretProjectQuery,
  fetchProjectQueryPlaybooks,
  runProjectQueryPlaybook,
  createProjectQueryTemplate,
  fetchProjectQueryTemplates,
  runProjectQueryTemplate,
  deleteProjectQueryTemplate,
} from "../api/client";
import type { DimensionRecord } from "../../shared/types";
import { PROJECT_QUERY_SUGGESTIONS, type ProjectQueryInterpretation, type ProjectQueryPlaybookDefinition, type ProjectQueryPlaybookRun, type ProjectQueryResult, type ProjectQuerySession, type ProjectQuerySessionSummary, type ProjectQueryTarget, type ProjectQueryTemplate } from "../../shared/projectQuery";

const CATEGORIES = ["Overview", "Validation", "Hierarchy", "Search", "Changes"];

export function ProjectQueryPanel({ projectId, dimensions = [], onNavigateTarget }: {
  projectId: string;
  dimensions?: DimensionRecord[];
  onNavigateTarget?: (target: ProjectQueryTarget) => void;
}) {
  const [sessions, setSessions] = useState<ProjectQuerySessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<ProjectQuerySession | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("Overview");
  const [suggestions, setSuggestions] = useState<Array<{ text: string; intent: string; label: string }>>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const [interpretation, setInterpretation] = useState<ProjectQueryInterpretation | null>(null);
  const [playbooks, setPlaybooks] = useState<ProjectQueryPlaybookDefinition[]>([]);
  const [playbookRun, setPlaybookRun] = useState<ProjectQueryPlaybookRun | null>(null);
  const [templates, setTemplates] = useState<ProjectQueryTemplate[]>([]);
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        await importLegacyHistoryOnce(projectId);
        const playbookResponse = await fetchProjectQueryPlaybooks(projectId);
        if (!cancelled) setPlaybooks(playbookResponse.playbooks);
        const templateResponse = await fetchProjectQueryTemplates(projectId);
        if (!cancelled) setTemplates(templateResponse.templates);
        const response = await fetchProjectQuerySessions(projectId);
        if (cancelled) return;
        setSessions(response.sessions);
        const first = response.sessions[0] ?? (await createProjectQuerySession(projectId)).session;
        if (!response.sessions.length) setSessions([first]);
        const detail = await fetchProjectQuerySession(projectId, first.id);
        if (!cancelled) setActiveSession(detail.session);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load query history");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
  }, [activeSession?.entries.length, loading]);

  useEffect(() => {
    const query = input.trim().toLowerCase();
    if (!query) {
      setSuggestions([]);
      setSelectedSuggestion(-1);
      return;
    }
    const dynamic = dimensions.flatMap((dimension) => [
      `How many members in ${dimension.dimensionName}?`,
      `How many leaf members in ${dimension.dimensionName}?`,
      `What is the max hierarchy depth in ${dimension.dimensionName}?`,
      `List all members in ${dimension.dimensionName}`
    ].map((text) => ({ text, intent: "dimension", label: "Hierarchy" })));
    const staticMatches = PROJECT_QUERY_SUGGESTIONS.filter((suggestion) => suggestion.text.toLowerCase().includes(query));
    const merged = [...staticMatches, ...dynamic.filter((item) => item.text.toLowerCase().includes(query))];
    setSuggestions(merged.filter((item, index, all) => all.findIndex((candidate) => candidate.text === item.text) === index).slice(0, 8));
    setSelectedSuggestion(-1);
  }, [input, dimensions]);

  useEffect(() => {
    const question = input.trim();
    if (question.length < 2) {
      setInterpretation(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void interpretProjectQuery(projectId, question).then((response) => {
        if (!cancelled) setInterpretation(response.interpretation);
      }).catch(() => {
        if (!cancelled) setInterpretation(null);
      });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [input, projectId]);

  async function runQuery(value = input) {
    const question = value.trim();
    if (!question || loading) return;
    setLoading(true);
    setError("");
    setSuggestions([]);
    try {
      const response = await executeProjectQuery(projectId, question, activeSession?.id);
      if (response.session) {
        setActiveSession(response.session);
        setSessions((current) => [response.session!, ...current.filter((session) => session.id !== response.session!.id)]);
      }
      setInput("");
    } catch (err) {
      setInput(question);
      setError(err instanceof Error ? err.message : "Query failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function selectSession(sessionId: string) {
    try {
      const response = await fetchProjectQuerySession(projectId, sessionId);
      setActiveSession(response.session);
      setHistoryOpen(false);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open query history");
    }
  }

  async function newSession() {
    const response = await createProjectQuerySession(projectId);
    setSessions((current) => [response.session, ...current]);
    await selectSession(response.session.id);
  }

  async function runPlaybook(playbookId: ProjectQueryPlaybookDefinition["id"]) {
    setLoading(true);
    setError("");
    try {
      const response = await runProjectQueryPlaybook(projectId, playbookId, { sessionId: activeSession?.id });
      setPlaybookRun(response.run);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to run playbook");
    } finally {
      setLoading(false);
    }
  }

  async function pinCurrentQuery() {
    const question = input.trim();
    if (!question) return;
    const name = window.prompt("Name this query template", question.slice(0, 40));
    if (!name?.trim()) return;
    try {
      const response = await createProjectQueryTemplate(projectId, { name, question, category: "Pinned" });
      setTemplates((current) => [response.template, ...current]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save query template");
    }
  }

  async function removeSession(sessionId: string) {
    await deleteProjectQuerySession(projectId, sessionId);
    const remaining = sessions.filter((session) => session.id !== sessionId);
    setSessions(remaining);
    if (activeSession?.id === sessionId) {
      if (remaining[0]) await selectSession(remaining[0].id);
      else await newSession();
    }
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setSuggestions([]);
      setSelectedSuggestion(-1);
      return;
    }
    if (suggestions.length > 0 && event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedSuggestion((current) => (current + 1) % suggestions.length);
      return;
    }
    if (suggestions.length > 0 && event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedSuggestion((current) => (current - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void runQuery(selectedSuggestion >= 0 ? suggestions[selectedSuggestion].text : input);
    }
  }

  const visibleCatalog = useMemo(() => {
    return PROJECT_QUERY_SUGGESTIONS.filter((suggestion) => suggestion.label === selectedCategory).slice(0, 6);
  }, [selectedCategory]);

  return (
    <section className="project-query-panel" aria-label="Project Query">
      <header className="project-query-header">
        <div className="project-query-title-group">
          <div className="project-query-mark"><Database size={17} /></div>
          <div>
            <h1>Project Query</h1>
            <p>Rule-based analysis over saved project metadata and validation results.</p>
          </div>
        </div>
        <div className="project-query-actions">
          <button type="button" className={`query-toolbar-button ${historyOpen ? "active" : ""}`} onClick={() => setHistoryOpen((open) => !open)} aria-expanded={historyOpen}>
            <History size={14} /> History <span className="query-count">{sessions.length}</span>
          </button>
          <button type="button" className="query-toolbar-button" onClick={() => void newSession()}><Plus size={14} /> New query</button>
          {activeSession && <button type="button" className="query-toolbar-button" onClick={() => window.open(`/api/projects/${projectId}/query/sessions/${activeSession.id}/export?format=markdown`, "_blank")}><ExternalLink size={14} /> Export</button>}
        </div>
      </header>

      {historyOpen && (
        <aside className="project-query-history" aria-label="Query history">
          <div className="project-query-history-heading"><strong>Saved queries</strong><button type="button" onClick={() => setHistoryOpen(false)} aria-label="Close history"><X size={14} /></button></div>
          {sessions.length === 0 ? <p className="query-muted">No saved queries.</p> : sessions.map((session) => (
            <div key={session.id} className={`project-query-session ${session.id === activeSession?.id ? "active" : ""}`}>
              <button type="button" onClick={() => void selectSession(session.id)} className="project-query-session-select">
                <span>{session.title}</span><small>{session.entryCount} {session.entryCount === 1 ? "query" : "queries"}</small>
              </button>
              <button type="button" className="project-query-session-delete" onClick={() => void removeSession(session.id)} aria-label={`Delete ${session.title}`}><Trash2 size={13} /></button>
            </div>
          ))}
        </aside>
      )}

      <div className="project-query-body" ref={messagesRef}>
        {!activeSession?.entries.length && playbooks.length > 0 && (
          <div className="project-query-playbooks" aria-label="Diagnostic playbooks">
            <div><span className="query-command-label">Diagnostic playbooks</span><p>Run a deterministic investigation with explicit steps and evidence.</p></div>
            <div className="project-query-playbook-grid">{playbooks.map((playbook) => <button key={playbook.id} type="button" onClick={() => void runPlaybook(playbook.id)} disabled={loading}><strong>{playbook.label}</strong><span>{playbook.description}</span></button>)}</div>
          </div>
        )}
        {playbookRun && <PlaybookRunCard projectId={projectId} run={playbookRun} onRerun={() => void runPlaybook(playbookRun.playbookId)} />}
        {templates.length > 0 && <section className="project-query-templates" aria-label="Pinned query templates"><span className="query-command-label">Pinned templates</span>{templates.slice(0, 6).map((template) => <span key={template.id} className="project-query-template"><button type="button" onClick={() => { setInput(template.question); void runProjectQueryTemplate(projectId, template.id).then((response) => { if (response.session) setActiveSession(response.session); setError(""); }).catch((err) => setError(err instanceof Error ? err.message : "Template failed")); }}>{template.name}</button><button type="button" aria-label={`Delete ${template.name}`} onClick={() => void deleteProjectQueryTemplate(projectId, template.id).then(() => setTemplates((current) => current.filter((item) => item.id !== template.id))).catch((err) => setError(err instanceof Error ? err.message : "Unable to delete template"))}><Trash2 size={12} /></button></span>)}</section>}
        {!activeSession?.entries.length && (
          <div className="project-query-empty">
            <div className="project-query-empty-icon"><Search size={24} /></div>
            <h2>Inspect the project</h2>
            <p>Ask about dimensions, hierarchies, validation, readiness, coverage, changes, and artifact impact.</p>
            <div className="project-query-categories" role="tablist" aria-label="Query categories">
              {CATEGORIES.map((category) => <button key={category} type="button" role="tab" aria-selected={selectedCategory === category} className={selectedCategory === category ? "active" : ""} onClick={() => setSelectedCategory(category)}>{category}</button>)}
            </div>
            <div className="project-query-catalog">
              {visibleCatalog.map((suggestion) => <button key={suggestion.text} type="button" onClick={() => void runQuery(suggestion.text)}><span>{suggestion.text}</span><Send size={13} /></button>)}
            </div>
          </div>
        )}

        {activeSession?.entries.map((entry) => <QueryEntry key={entry.id} question={entry.question} result={entry.result} onNavigateTarget={onNavigateTarget} onFollowUp={(question) => void runQuery(question)} onRunAgain={(question) => void runQuery(question)} />)}
        {loading && <div className="project-query-pending" role="status" aria-live="polite"><span className="query-status-badge pending">pending</span> Running deterministic query against project data...</div>}
      </div>

      <div className="project-query-composer">
        {error && <div className="project-query-error" role="alert"><AlertTriangle size={15} /><span>{error}</span><button type="button" onClick={() => void runQuery()}><RotateCcw size={13} /> Retry</button></div>}
        {suggestions.length > 0 && (
          <div className="project-query-autocomplete" role="listbox" aria-label="Query suggestions">
            {suggestions.map((suggestion, index) => <button key={suggestion.text} type="button" role="option" aria-selected={selectedSuggestion === index} className={selectedSuggestion === index ? "active" : ""} onMouseDown={(event) => { event.preventDefault(); void runQuery(suggestion.text); }}><Search size={13} /><span>{suggestion.text}</span><small>{suggestion.label}</small></button>)}
          </div>
        )}
        {interpretation && input.trim() && (
          <div className={`project-query-interpretation ${interpretation.matchQuality}`} aria-live="polite">
            <span>Interpreted as</span><strong>{interpretation.intentLabel}</strong>
            {interpretation.scope.filter((token) => token.kind !== "project").map((token) => <span key={`${token.kind}-${token.label}`} className="query-scope-token">{token.label}</span>)}
            {interpretation.choices && <small>Choose a dimension from the clarification result after running.</small>}
          </div>
        )}
        <div className="project-query-input-row">
          <input value={input} onChange={(event) => setInput(event.currentTarget.value)} onKeyDown={onInputKeyDown} placeholder="Ask about members, dimensions, validation, readiness, or impact..." maxLength={500} aria-label="Project query" disabled={loading} />
          <button type="button" className="project-query-run" onClick={() => void runQuery()} disabled={loading || !input.trim()} aria-label="Run project query"><Send size={16} /></button>
        </div>
        <button type="button" className="project-query-pin" onClick={() => void pinCurrentQuery()} disabled={!input.trim()}>Pin current query</button>
        <p className="project-query-hint">Enter to run - Up/Down to choose a command - Esc to close</p>
      </div>
    </section>
  );
}

function PlaybookRunCard({ projectId, run, onRerun }: { projectId: string; run: ProjectQueryPlaybookRun; onRerun: () => void }) {
  return <section className="project-query-playbook-run" aria-live="polite"><div className="project-query-playbook-run-heading"><div><span className="query-command-label">Diagnostic run</span><strong>{run.playbookId}</strong></div><div><button type="button" className="query-copy-button" onClick={onRerun}><RotateCcw size={13} /> Run again</button><button type="button" className="query-copy-button" onClick={() => window.open(`/api/projects/${projectId}/query/playbook-runs/${run.id}/export?format=markdown`, "_blank")}><ExternalLink size={13} /> Export</button></div></div><ol>{run.steps.map((step) => <li key={step.id} className={step.status}><span>{step.status}</span><strong>{step.label}</strong>{step.result?.summary && <p>{step.result.summary}</p>}</li>)}</ol></section>;
}

async function importLegacyHistoryOnce(projectId: string): Promise<void> {
  const marker = `dimbuilder:project-query-history-imported:${projectId}`;
  if (localStorage.getItem(marker) === "1") return;
  try {
    const raw = localStorage.getItem("dimbuilder:query-sessions") ?? sessionStorage.getItem("dimbuilder:query-sessions");
    if (!raw) {
      localStorage.setItem(marker, "1");
      return;
    }
    const all = JSON.parse(raw) as Record<string, unknown>;
    const sessions = Array.isArray(all[projectId]) ? all[projectId] : [];
    if (sessions.length > 0) {
      await importProjectQueryHistory(projectId, sessions);
      delete all[projectId];
      const next = JSON.stringify(all);
      localStorage.setItem("dimbuilder:query-sessions", next);
      sessionStorage.setItem("dimbuilder:query-sessions", next);
    }
    localStorage.setItem(marker, "1");
  } catch {
    // Preserve the browser history until a server import succeeds.
  }
}

function QueryEntry({ question, result, onNavigateTarget, onFollowUp, onRunAgain }: { question: string; result: ProjectQueryResult; onNavigateTarget?: (target: ProjectQueryTarget) => void; onFollowUp: (question: string) => void; onRunAgain: (question: string) => void }) {
  const [copied, setCopied] = useState(false);
  const copyText = [result.summary, ...result.evidence.map((item) => `${item.label}: ${item.value}`)].join("\n");
  async function copy() {
    await navigator.clipboard?.writeText(copyText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return (
    <article className="project-query-entry">
      <div className="project-query-command"><span className="query-command-label">Command</span><span>{question}</span></div>
      <div className={`project-query-result ${result.status}`}>
        <div className="project-query-result-heading"><span className="query-status-badge">{result.intentLabel}</span>{result.dataAsOf && <span className="query-as-of">Data as of {new Date(result.dataAsOf).toLocaleString()}</span>}<button type="button" className="query-copy-button" onClick={() => onRunAgain(question)}><RotateCcw size={13} /> Run again</button><button type="button" className="query-copy-button" onClick={() => void copy()}>{copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}</button></div>
        <h3>{result.summary}</h3>
        {result.metrics.length > 0 && <div className="project-query-metrics">{result.metrics.map((metric) => <div key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></div>)}</div>}
        {result.findings.length > 0 && <div className="project-query-findings"><h4>Findings</h4>{result.findings.map((finding, index) => <div key={`${finding.message}-${index}`} className={`query-finding ${finding.severity}`}><span>{finding.severity}</span><p>{finding.message}</p></div>)}</div>}
        {result.evidence.length > 0 && <details className="project-query-evidence"><summary>Evidence ({result.evidence.length})</summary><ul>{result.evidence.map((item) => <li key={`${item.label}-${item.value}`}><strong>{item.label}</strong>{item.value}</li>)}</ul></details>}
        {result.table && <details className="project-query-table"><summary>Results ({result.table.totalRows})</summary><div className="project-query-table-scroll"><table><thead><tr>{result.table.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{result.table.rows.slice(0, result.table.limit).map((row, index) => <tr key={String(row.id ?? index)}>{result.table!.columns.map((column) => <td key={column.key}>{String(row[column.key] ?? "-")}</td>)}</tr>)}</tbody></table></div>{result.table.truncated && <small>Showing {Math.min(result.table.rows.length, result.table.limit)} of {result.table.totalRows}. More results are available through filters or export.</small>}</details>}
        {result.targets.length > 0 && <div className="project-query-targets"><h4>Open in workbench</h4>{result.targets.map((target, index) => <button key={`${target.kind}-${index}`} type="button" onClick={() => onNavigateTarget?.(target)}>{target.kind === "member" ? target.memberKey : target.kind === "dimension" ? "Open dimension" : `Open ${target.surface}`} <ExternalLink size={12} /></button>)}</div>}
        {result.followUps.length > 0 && <div className="project-query-followups"><span>Next query</span>{result.followUps.slice(0, 4).map((followUp) => <button key={followUp} type="button" onClick={() => onFollowUp(followUp)}>{followUp} <ChevronRight size={13} aria-hidden="true" /></button>)}</div>}
      </div>
    </article>
  );
}
