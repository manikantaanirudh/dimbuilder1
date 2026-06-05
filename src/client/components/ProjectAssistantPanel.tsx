import { useEffect, useState } from "react";
import { Copy, MessageSquareText, Send } from "lucide-react";
import { fetchAssistantSuggestions, queryProjectAssistant } from "../api/client";
import type { AssistantAnswer } from "../../shared/projectAssistant";
import { ActionButton, Panel, StatusBadge } from "./ui";

interface Entry {
  question: string;
  answer: AssistantAnswer;
}

/**
 * Evidence-based Project Assistant (TASK-14). Answers are generated from current project metadata
 * and validation results. No external LLM is used by default.
 */
export function ProjectAssistantPanel({ projectId }: { projectId: string }) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [status, setStatus] = useState("Ready");

  useEffect(() => {
    void fetchAssistantSuggestions(projectId).then((r) => setSuggestions(r.suggestions)).catch(() => setSuggestions([]));
    setEntries([]);
  }, [projectId]);

  async function ask(q: string) {
    const text = q.trim();
    if (!text) return;
    setStatus("Thinking...");
    try {
      const result = await queryProjectAssistant(projectId, text);
      setEntries((prev) => [{ question: result.question, answer: result.answer }, ...prev]);
      setQuestion("");
      setStatus("Ready");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Query failed");
    }
  }

  function copyAnswer(entry: Entry) {
    const text = [
      entry.answer.summary,
      "",
      "Evidence:",
      ...entry.answer.evidence.map((e) => `- ${e}`),
      "",
      "Next actions:",
      ...entry.answer.nextActions.map((a) => `- ${a}`)
    ].join("\n");
    void navigator.clipboard?.writeText(text);
    setStatus("Answer copied");
  }

  return (
    <Panel className="project-assistant-panel">
      <div className="grid-toolbar">
        <div className="grid-toolbar-title">
          <strong><MessageSquareText size={16} /> Project Assistant</strong>
          <span>Answers are generated from current project metadata and validation results.</span>
        </div>
        <StatusBadge tone={status.toLowerCase().includes("fail") ? "danger" : "neutral"}>{status}</StatusBadge>
      </div>

      <div className="assistant-suggestions" style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0" }}>
        {suggestions.map((s) => (
          <button key={s} className="chip" style={{ fontSize: "0.78rem", padding: "3px 10px", borderRadius: 14, cursor: "pointer" }} onClick={() => void ask(s)}>
            {s}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
        <input
          style={{ flex: 1 }}
          placeholder="Ask about readiness, blockers, changes, risks, or impact..."
          value={question}
          onChange={(e) => setQuestion(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void ask(question); }}
        />
        <ActionButton variant="primary" onClick={() => void ask(question)}><Send size={14} /> Ask</ActionButton>
      </div>

      <div className="assistant-entries">
        {entries.map((entry, i) => (
          <div key={i} className="assistant-entry" style={{ borderTop: "1px solid var(--border, #ddd)", padding: "10px 0" }}>
            <div style={{ fontWeight: 600 }}>{entry.question}</div>
            <p style={{ margin: "6px 0" }}>{entry.answer.summary}</p>
            {entry.answer.evidence.length > 0 && (
              <details>
                <summary style={{ fontSize: "0.82rem" }}>Evidence ({entry.answer.evidence.length})</summary>
                <ul style={{ fontSize: "0.8rem", margin: "4px 0" }}>
                  {entry.answer.evidence.map((e, j) => <li key={j}><code>{e}</code></li>)}
                </ul>
              </details>
            )}
            {entry.answer.nextActions.length > 0 && (
              <div style={{ fontSize: "0.82rem", marginTop: 4 }}>
                <strong>Next actions:</strong>
                <ul style={{ margin: "4px 0" }}>
                  {entry.answer.nextActions.map((a, j) => <li key={j}>{a}</li>)}
                </ul>
              </div>
            )}
            <ActionButton onClick={() => copyAnswer(entry)}><Copy size={13} /> Copy answer</ActionButton>
          </div>
        ))}
      </div>
    </Panel>
  );
}
