import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Search, MessageSquare } from "lucide-react";

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  matchedMembers?: string[];
  timestamp: string;
}

const QUICK_QUERIES = [
  "Find member Actual",
  "Show orphan members",
  "How many members in Account?",
  "List children of Root",
  "Does NetIncome exist?",
];

export function ChatPanel({ projectId, onNavigateMember }: {
  projectId: string | null;
  onNavigateMember?: (memberKey: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(query?: string) {
    const text = query || input.trim();
    if (!text || !projectId) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/ai/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text })
      });
      const data = await res.json();
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.answer || "I couldn't process that query.",
        matchedMembers: data.matchedMembers,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "Failed to process query. Please try again.",
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <MessageSquare size={18} />
        <h3>Project Assistant</h3>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <Bot size={32} />
            <h4>Ask me about your project</h4>
            <p>I can find members, show hierarchies, count data, and check properties across all dimensions.</p>
            <div className="chat-suggestions">
              {QUICK_QUERIES.map(q => (
                <button key={q} className="chip" onClick={() => handleSend(q)}>{q}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`chat-bubble chat-${msg.role}`}>
            <div className="chat-bubble-icon">
              {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
            </div>
            <div className="chat-bubble-content">
              <pre className="chat-text">{msg.content}</pre>
              {msg.matchedMembers && msg.matchedMembers.length > 0 && msg.matchedMembers.length <= 20 && (
                <div className="chat-members">
                  {msg.matchedMembers.map(key => (
                    <button key={key} className="chip chip-sm" onClick={() => onNavigateMember?.(key)}>
                      <Search size={10} /> {key}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-bubble chat-assistant">
            <div className="chat-bubble-icon"><Bot size={14} /></div>
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
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Ask about members, dimensions, properties..."
          disabled={loading || !projectId}
        />
        <button onClick={() => handleSend()} disabled={loading || !input.trim()} aria-label="Send message">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
