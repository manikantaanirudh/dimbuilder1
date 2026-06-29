import { useState, useRef, useEffect } from "react";
import { Send, Search, User, HelpCircle, Trash2 } from "lucide-react";
import { queryNaturalLanguage } from "../api/client";
import type { NLQueryResult } from "../../shared/aiTypes";
import { PROJECT_QUERY_SAMPLES } from "../../shared/projectQueries";
import { useQueryHistory } from "../hooks/useQueryHistory";

const QUICK_QUERIES = PROJECT_QUERY_SAMPLES.slice(0, 8);

function AnswerCard({ result, onNavigateMember, onFollowUp }: {
  result: NLQueryResult;
  onNavigateMember?: (memberKey: string) => void;
  onFollowUp: (query: string) => void;
}) {
  const lines = result.answer.split("\n").filter(Boolean);

  return (
    <div className="query-answer-card">
      {result.intentLabel && (
        <span className="query-intent-badge">{result.intentLabel}</span>
      )}
      <div className="query-answer-body">
        {lines.map((line, index) => (
          <p key={index} className={line.startsWith("•") || line.startsWith("  ") ? "query-answer-detail" : "query-answer-line"}>
            {line}
          </p>
        ))}
      </div>
      {result.evidence && result.evidence.length > 0 && (
        <div className="query-evidence">
          <span className="query-evidence-label">Evidence</span>
          <div className="query-evidence-chips">
            {result.evidence.map(item => (
              <span key={item} className="chip chip-sm chip-muted">{item}</span>
            ))}
          </div>
        </div>
      )}
      {result.matchedMembers && result.matchedMembers.length > 0 && result.matchedMembers.length <= 20 && (
        <div className="query-members">
          {result.matchedMembers.map(key => (
            <button key={key} className="chip chip-sm" onClick={() => onNavigateMember?.(key)}>
              <Search size={10} /> {key}
            </button>
          ))}
        </div>
      )}
      {result.followUps && result.followUps.length > 0 && (
        <div className="query-followups">
          <span className="query-followups-label">Try next</span>
          <div className="query-followups-chips">
            {result.followUps.map(query => (
              <button key={query} className="chip chip-sm" onClick={() => onFollowUp(query)}>{query}</button>
            ))}
          </div>
        </div>
      )}
      {result.confidence < 0.5 && (
        <p className="query-confidence-hint">Low confidence match — try a suggested question below.</p>
      )}
    </div>
  );
}

export function ChatPanel({ projectId, onNavigateMember }: {
  projectId: string | null;
  onNavigateMember?: (memberKey: string) => void;
}) {
  const { messages, setMessages, clearHistory } = useQueryHistory(projectId);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(query?: string) {
    const text = query || input.trim();
    if (!text || !projectId) return;

    const userMsg = { id: Date.now().toString(), role: "user" as const, content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const data = await queryNaturalLanguage(projectId, text);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.answer || "No answer returned.",
        result: data,
        timestamp: new Date().toISOString()
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: err instanceof Error ? err.message : "Failed to run project query. Please try again.",
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-panel query-panel">
      <div className="chat-header">
        <HelpCircle size={18} />
        <div className="query-header-copy">
          <h3>Project queries</h3>
          <p className="query-header-subtitle">Deterministic answers from live project data — no AI required</p>
        </div>
        {messages.length > 0 && (
          <button type="button" className="query-clear-btn" onClick={clearHistory} aria-label="Clear query history">
            <Trash2 size={14} />
            Clear
          </button>
        )}
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-welcome query-welcome">
            <Search size={32} />
            <h4>Ask about your project</h4>
            <p>Search members, inspect hierarchy health, check validation issues, export readiness, and metadata coverage across all dimensions.</p>
            <div className="chat-suggestions">
              {QUICK_QUERIES.map(q => (
                <button key={q} className="chip" onClick={() => void handleSend(q)}>{q}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`chat-bubble chat-${msg.role}`}>
            <div className="chat-bubble-icon">
              {msg.role === "user" ? <User size={14} /> : <Search size={14} />}
            </div>
            <div className="chat-bubble-content">
              {msg.role === "assistant" && msg.result ? (
                <AnswerCard result={msg.result} onNavigateMember={onNavigateMember} onFollowUp={(q) => void handleSend(q)} />
              ) : (
                <p className="query-user-text">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-bubble chat-assistant">
            <div className="chat-bubble-icon"><Search size={14} /></div>
            <div className="chat-typing"><span /><span /><span /></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-bar">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
          placeholder="e.g. How many leaf members in Account?"
          disabled={loading || !projectId}
        />
        <button onClick={() => void handleSend()} disabled={loading || !input.trim()} aria-label="Run query">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
