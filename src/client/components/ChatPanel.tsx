import { useState, useRef, useEffect, useMemo } from "react";
import { Send, Search, User, HelpCircle, Trash2, Copy, Check, Zap, Layers, AlertTriangle, ListTree, History, Plus, MessageSquare } from "lucide-react";
import { queryNaturalLanguage } from "../api/client";
import type { NLQueryResult } from "../../shared/aiTypes";
import type { DimensionRecord } from "../../shared/types";
import { PROJECT_QUERY_SAMPLES } from "../../shared/projectQueries";
import { useQueryHistory } from "../hooks/useQueryHistory";

const CATEGORIZED_QUERIES = [
  {
    id: "health",
    label: "Overview & Health",
    icon: Zap,
    queries: [
      "Summarize my project",
      "What is wrong with my project?",
      "Is my project ready to export?",
      "What is the metadata coverage?"
    ]
  },
  {
    id: "members",
    label: "Hierarchy & Members",
    icon: ListTree,
    queries: [
      "How many members in Account?",
      "How many leaf members in Account?",
      "What is the max hierarchy depth in Account?",
      "Show shared members in Account"
    ]
  },
  {
    id: "issues",
    label: "Validation & Structure",
    icon: AlertTriangle,
    queries: [
      "Which dimensions are empty?",
      "Show orphan members",
      "What dimensions exist in this project?"
    ]
  },
  {
    id: "search",
    label: "Search & Details",
    icon: Layers,
    queries: [
      "Find Revenue",
      "Tell me about member Revenue",
      "Show members under Revenue",
      "List all members in Scenario"
    ]
  }
];

function parseMarkdownSections(text: string) {
  const rawSections = text.split(/(?=^##\s+)/m).filter(Boolean);
  if (rawSections.length === 0 || !text.includes("## ")) {
    return null;
  }

  return rawSections.map((sec) => {
    const lines = sec.trim().split("\n").filter(Boolean);
    const headerMatch = lines[0]?.match(/^##\s+(.+)$/);
    if (headerMatch) {
      return {
        title: headerMatch[1].trim(),
        lines: lines.slice(1)
      };
    }
    return {
      title: "Overview",
      lines
    };
  });
}

function AnswerCard({ result, onNavigateMember, onFollowUp }: {
  result: NLQueryResult;
  onNavigateMember?: (memberKey: string) => void;
  onFollowUp: (query: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const structuredSections = parseMarkdownSections(result.answer);

  function handleCopy() {
    void navigator.clipboard.writeText(result.answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="query-answer-card">
      <div className="query-answer-header">
        {result.intentLabel && (
          <span className="query-intent-badge">{result.intentLabel}</span>
        )}
        <span className="query-engine-badge" title="Deterministic SQL execution over live database — 100% accurate, zero AI fees or internet needed">
          <Zap size={11} /> SR OneStream Engine
        </span>
        <button
          type="button"
          className="query-copy-btn"
          onClick={handleCopy}
          title="Copy answer to clipboard"
          aria-label="Copy answer"
        >
          {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>

      {structuredSections ? (
        <div className="query-structured-sections">
          {structuredSections.map((section, sIdx) => {
            const lowerTitle = section.title.toLowerCase();
            const isMetrics = lowerTitle.includes("metrics");
            const isFindings = lowerTitle.includes("findings");
            const isImpact = lowerTitle.includes("impact");
            const isRecs = lowerTitle.includes("recommendations");
            const isFollowUps = lowerTitle.includes("follow-up") || lowerTitle.includes("suggested");

            if (isFollowUps) {
              return (
                <div key={sIdx} className="query-structured-section query-section-followups">
                  <h5 className="query-section-title">Suggested Follow-up Questions</h5>
                  <div className="query-followups-chips">
                    {section.lines.map((line, lIdx) => {
                      const qText = line.replace(/^[•\-\d.\s]+/, "").trim();
                      if (!qText) return null;
                      return (
                        <button key={lIdx} className="chip chip-sm chip-suggest" onClick={() => onFollowUp(qText)}>
                          {qText}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={sIdx}
                className={`query-structured-section ${
                  isMetrics ? "query-section-metrics" :
                  isFindings ? "query-section-findings" :
                  isImpact ? "query-section-impact" :
                  isRecs ? "query-section-recs" : ""
                }`}
              >
                <h5 className="query-section-title">{section.title}</h5>

                {isMetrics ? (
                  <div className="query-metrics-grid">
                    {section.lines.map((line, lIdx) => {
                      const cleaned = line.replace(/^[•\-\s]+/, "");
                      const parts = cleaned.split(":");
                      if (parts.length >= 2) {
                        const label = parts[0].replace(/\*\*/g, "").trim();
                        const val = parts.slice(1).join(":").trim();
                        return (
                          <div key={lIdx} className="query-metric-badge">
                            <span className="query-metric-label">{label}</span>
                            <span className="query-metric-val">{val}</span>
                          </div>
                        );
                      }
                      return <p key={lIdx} className="query-answer-line">{line}</p>;
                    })}
                  </div>
                ) : isFindings ? (
                  <ul className="query-findings-list">
                    {section.lines.map((line, lIdx) => {
                      const isCritical = line.includes("[Critical]");
                      const isWarning = line.includes("[Warning]");
                      const isInfo = line.includes("[Information]");
                      const badgeClass = isCritical ? "badge-critical" : isWarning ? "badge-warning" : "badge-info";
                      const badgeLabel = isCritical ? "Critical" : isWarning ? "Warning" : "Info";
                      const textOnly = line.replace(/•\s*\*\*\[(Critical|Warning|Information)\]\*\*\s*/i, "").replace(/^[•\-\s]+/, "");

                      return (
                        <li key={lIdx} className="query-finding-item">
                          <span className={`query-finding-badge ${badgeClass}`}>{badgeLabel}</span>
                          <span>{textOnly}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="query-section-body">
                    {section.lines.map((line, lIdx) => {
                      const isBullet = line.startsWith("•") || line.startsWith("-") || /^\d+\./.test(line);
                      return (
                        <p key={lIdx} className={isBullet ? "query-answer-detail" : "query-answer-line"}>
                          {line}
                        </p>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="query-answer-body">
          {result.answer.split("\n").filter(Boolean).map((line, index) => {
            const isBullet = line.startsWith("•") || line.startsWith("  ") || line.startsWith("-");
            return (
              <p key={index} className={isBullet ? "query-answer-detail" : "query-answer-line"}>
                {line}
              </p>
            );
          })}
        </div>
      )}

      {result.evidence && result.evidence.length > 0 && (
        <div className="query-evidence">
          <span className="query-evidence-label">Evidence Data</span>
          <div className="query-evidence-chips">
            {result.evidence.map(item => (
              <span key={item} className="chip chip-sm chip-muted">{item}</span>
            ))}
          </div>
        </div>
      )}

      {result.matchedMembers && result.matchedMembers.length > 0 && result.matchedMembers.length <= 20 && (
        <div className="query-members">
          <span className="query-evidence-label">Matched Members ({result.matchedMembers.length})</span>
          <div className="query-members-chips">
            {result.matchedMembers.map(key => (
              <button key={key} className="chip chip-sm chip-interactive" onClick={() => onNavigateMember?.(key)}>
                <Search size={10} /> {key}
              </button>
            ))}
          </div>
        </div>
      )}

      {!structuredSections && result.followUps && result.followUps.length > 0 && (
        <div className="query-followups">
          <span className="query-followups-label">Recommended Next Queries</span>
          <div className="query-followups-chips">
            {result.followUps.map(query => (
              <button key={query} className="chip chip-sm chip-suggest" onClick={() => onFollowUp(query)}>{query}</button>
            ))}
          </div>
        </div>
      )}

      {result.confidence < 0.5 && (
        <p className="query-confidence-hint">Fuzzy match — select a suggested question below for exact insights.</p>
      )}
    </div>
  );
}

export function ChatPanel({ projectId, dimensions = [], onNavigateMember }: {
  projectId: string | null;
  dimensions?: DimensionRecord[];
  onNavigateMember?: (memberKey: string) => void;
}) {
  const {
    sessions,
    activeSessionId,
    messages,
    setMessages,
    createNewSession,
    selectSession,
    deleteSession
  } = useQueryHistory(projectId);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("health");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [historyOpen, setHistoryOpen] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);

  // Scope auto-scroll exclusively to the messages container element.
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [messages, loading]);

  // Compute dynamic autocomplete suggestions
  const autocompleteSuggestions = useMemo(() => {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) return [];

    const matches: string[] = [];

    // Static sample queries matching
    for (const q of PROJECT_QUERY_SAMPLES) {
      if (q.toLowerCase().includes(trimmed)) {
        matches.push(q);
      }
    }

    // Dynamic dimension queries
    for (const dim of dimensions) {
      const name = dim.dimensionName;
      const type = dim.dimensionType;
      const candidates = [
        `How many members in ${name}?`,
        `How many leaf members in ${name}?`,
        `What is the max hierarchy depth in ${name}?`,
        `List all members in ${name}`,
        `Show shared members in ${name}`,
        `How many relationships in ${name}?`
      ];
      for (const cand of candidates) {
        if (cand.toLowerCase().includes(trimmed) && !matches.includes(cand)) {
          matches.push(cand);
        }
      }
      if (type !== name) {
        const typeCandidates = [
          `How many members in ${type}?`,
          `How many leaf members in ${type}?`
        ];
        for (const cand of typeCandidates) {
          if (cand.toLowerCase().includes(trimmed) && !matches.includes(cand)) {
            matches.push(cand);
          }
        }
      }
    }

    return matches.slice(0, 7);
  }, [input, dimensions]);

  async function handleSend(queryText?: string) {
    const text = queryText || input.trim();
    if (!text || !projectId) return;

    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);

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

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (showSuggestions && autocompleteSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSuggestionIndex(prev => (prev + 1) % autocompleteSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSuggestionIndex(prev => (prev - 1 + autocompleteSuggestions.length) % autocompleteSuggestions.length);
        return;
      }
      if (e.key === "Escape") {
        setShowSuggestions(false);
        return;
      }
      if (e.key === "Enter" && selectedSuggestionIndex >= 0) {
        e.preventDefault();
        void handleSend(autocompleteSuggestions[selectedSuggestionIndex]);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  const currentCategory = CATEGORIZED_QUERIES.find(c => c.id === activeCategory) || CATEGORIZED_QUERIES[0];

  return (
    <div className="chat-panel query-panel">
      <div className="chat-header">
        <HelpCircle size={18} />
        <div className="query-header-copy">
          <h3>SR OneStream Project Assistant</h3>
          <p className="query-header-subtitle">
            Deterministic live-data engine — 100% accurate insights from project database (no AI required)
          </p>
        </div>

        <div className="chat-header-actions">
          <button
            type="button"
            className={`query-history-btn ${historyOpen ? "active" : ""}`}
            onClick={() => setHistoryOpen(!historyOpen)}
            title="Chat Sessions History"
          >
            <History size={14} />
            <span>History ({sessions.length})</span>
          </button>

          <button
            type="button"
            className="query-clear-btn"
            onClick={() => {
              createNewSession();
              setHistoryOpen(false);
            }}
            title="Start New Chat Session"
          >
            <Plus size={14} />
            <span>New Chat</span>
          </button>
        </div>
      </div>

      {historyOpen && (
        <div className="chat-history-drawer">
          <div className="chat-history-header">
            <h4><History size={14} /> Chat Sessions History ({sessions.length})</h4>
            <button className="chat-history-close" onClick={() => setHistoryOpen(false)}>✕</button>
          </div>
          <div className="chat-history-list">
            {sessions.length === 0 ? (
              <p className="chat-history-empty">No chat sessions found.</p>
            ) : (
              sessions.map((sess) => (
                <div
                  key={sess.id}
                  className={`chat-history-item ${sess.id === activeSessionId ? "active" : ""}`}
                  onClick={() => {
                    selectSession(sess.id);
                    setHistoryOpen(false);
                  }}
                >
                  <MessageSquare size={13} />
                  <div className="chat-history-item-info">
                    <span className="chat-history-query" title={sess.title}>{sess.title}</span>
                    <div className="chat-history-meta">
                      <span className="chat-history-count">{sess.messages.length} msgs</span>
                      <span className="chat-history-time">{new Date(sess.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                  {sessions.length > 1 && (
                    <button
                      type="button"
                      className="chat-history-delete-btn"
                      title="Delete this chat session"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(sess.id);
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className="chat-messages" ref={messagesContainerRef}>
        {messages.length === 0 && (
          <div className="chat-welcome query-welcome">
            <Search size={32} />
            <h4>Ask SR OneStream Project Assistant</h4>
            <p>Inspect hierarchy health, check validation issues, evaluate export readiness, and query dimension metadata with zero latency.</p>

            <div className="chat-category-tabs">
              {CATEGORIZED_QUERIES.map(cat => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    className={`chat-category-tab ${activeCategory === cat.id ? "active" : ""}`}
                    onClick={() => setActiveCategory(cat.id)}
                  >
                    <Icon size={14} />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="chat-suggestions">
              {currentCategory.queries.map(q => (
                <button key={q} className="chip chip-query-item" onClick={() => void handleSend(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`chat-bubble chat-${msg.role}`}>
            <div className="chat-bubble-icon">
              {msg.role === "user" ? <User size={14} /> : <Zap size={14} className="text-accent" />}
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
            <div className="chat-bubble-icon"><Zap size={14} className="text-accent" /></div>
            <div className="chat-typing"><span /><span /><span /></div>
          </div>
        )}
      </div>

      <div className="chat-input-wrapper">
        {showSuggestions && autocompleteSuggestions.length > 0 && (
          <div className="chat-autocomplete-dropdown">
            <div className="chat-autocomplete-header">Matching Queries</div>
            {autocompleteSuggestions.map((sug, idx) => (
              <button
                key={sug}
                className={`chat-autocomplete-item ${selectedSuggestionIndex === idx ? "active" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  void handleSend(sug);
                }}
                onMouseEnter={() => setSelectedSuggestionIndex(idx)}
              >
                <Search size={12} />
                <span>{sug}</span>
              </button>
            ))}
          </div>
        )}

        <div className="chat-input-bar">
          <input
            type="text"
            value={input}
            onChange={e => {
              setInput(e.target.value);
              setShowSuggestions(true);
              setSelectedSuggestionIndex(-1);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. How many members in Account? or What is wrong with my project?"
            disabled={loading || !projectId}
          />
          <button onClick={() => void handleSend()} disabled={loading || !input.trim()} aria-label="Run query">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
