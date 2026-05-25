# Enhancement Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 7 enhancements: Chatbot page, Validation drill-down, Project Overview navigation, Admin export rules, UI fixes (hierarchy filter, workflow empty state, XML button), dimbuilder.yaml cleanup, warning message improvement.

**Architecture:** All changes are UI-layer except one backend enhancement (new `check_exists` intent in query parser). The chatbot page uses the existing `/projects/:id/ai/query` API. Navigation wiring uses existing AppShell state callbacks.

**Tech Stack:** React 18, TypeScript, custom CSS, Lucide icons, existing Express API

---

### Task 1: Add `check_exists` Intent to Query Parser

**Files:**
- Modify: `src/server/ai/naturalLanguage/queryParser.ts`
- Modify: `src/server/ai/naturalLanguage/responseGenerator.ts`

- [ ] **Step 1: Add check_exists to ParsedIntent type**

In `queryParser.ts`, update the `ParsedIntent` type union:
```typescript
type: 'find' | 'count' | 'children' | 'missing_property' | 'property_filter' | 'orphans' | 'check_exists' | 'unknown';
```

- [ ] **Step 2: Add pattern matching for existence queries**

In `parseIntent()`, add BEFORE the generic `find` match:
```typescript
// "Is there a member called X" / "Does X exist" / "Check if X exists"
const existsMatch = q.match(/(?:is there|does|do we have|check if|can you (?:find|check))\s+(?:a\s+)?(?:member\s+)?(?:called|named|with name)?\s*['"]?([^'"?]+?)['"]?\s*(?:exist|in the)?\s*\??$/i);
if (existsMatch) {
  return { type: 'check_exists', params: { memberKey: existsMatch[1].trim() } };
}
```

- [ ] **Step 3: Implement check_exists execution**

In `executeIntent()`, add a case:
```typescript
case 'check_exists': {
  const searchKey = intent.params.memberKey.toLowerCase();
  const found = members.filter(m => m.memberKey.toLowerCase() === searchKey);
  if (found.length === 0) {
    // Fuzzy fallback
    const partial = members.filter(m => m.memberKey.toLowerCase().includes(searchKey));
    if (partial.length > 0) {
      return {
        answer: `No exact match for "${intent.params.memberKey}", but found ${partial.length} similar member(s): ${partial.slice(0, 5).map(m => m.memberKey).join(', ')}${partial.length > 5 ? '...' : ''}`,
        matchedMembers: partial.slice(0, 10).map(m => m.memberKey),
        confidence: 0.6
      };
    }
    return {
      answer: `No member called "${intent.params.memberKey}" exists in this project.`,
      matchedMembers: [],
      confidence: 1.0
    };
  }
  const member = found[0];
  const dim = dimensions.find(d => d.id === member.dimensionId);
  const parentRels = relationships.filter(r => r.childKey === member.memberKey);
  const parents = parentRels.map(r => r.parentKey).join(', ') || 'None (root)';
  const propCount = Object.keys(member.properties).length;
  return {
    answer: `Yes! Member "${member.memberKey}" exists.\n• Dimension: ${dim?.dimensionType ?? 'Unknown'} (${dim?.dimensionName ?? ''})\n• Description: ${member.description || '(none)'}\n• Parent(s): ${parents}\n• Properties: ${propCount} defined\n• Active: ${member.isActive ? 'Yes' : 'No'}`,
    matchedMembers: found.map(m => m.memberKey),
    confidence: 1.0
  };
}
```

- [ ] **Step 4: Verify the server starts without errors**

Run: `curl http://127.0.0.1:8787/api/health` — should return `{"ok":true}`

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/naturalLanguage/queryParser.ts
git commit -m "feat(ai): add check_exists intent for member existence queries"
```

---

### Task 2: Create ChatPanel Component

**Files:**
- Create: `src/client/components/ChatPanel.tsx`
- Modify: `src/client/styles.css` (add chat styles)

- [ ] **Step 1: Create ChatPanel.tsx**

```tsx
import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Search, MessageSquare } from "lucide-react";
import { useProjectStore } from "../store";

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

export function ChatPanel({ onNavigateMember }: { onNavigateMember?: (memberKey: string, dimensionId: string) => void }) {
  const { currentProject, dimensions, members } = useProjectStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(query?: string) {
    const text = query || input.trim();
    if (!text || !currentProject) return;
    
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`/api/projects/${currentProject.id}/ai/query`, {
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
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: "Failed to process query. Please try again.", timestamp: new Date().toISOString() }]);
    } finally {
      setLoading(false);
    }
  }

  function handleMemberClick(memberKey: string) {
    const member = members.find(m => m.memberKey === memberKey);
    if (member && onNavigateMember) {
      onNavigateMember(memberKey, member.dimensionId);
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <MessageSquare size={18} />
        <h3>Project Assistant</h3>
        <span className="chat-subtitle">{currentProject?.name ?? "No project"}</span>
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
                    <button key={key} className="chip chip-sm" onClick={() => handleMemberClick(key)}>
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
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Ask about members, dimensions, properties..."
          disabled={loading || !currentProject}
        />
        <button onClick={() => handleSend()} disabled={loading || !input.trim()} aria-label="Send">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add chat CSS styles to styles.css**

Add at end of `src/client/styles.css`:
```css
/* Chat Panel */
.chat-panel { display: flex; flex-direction: column; height: 100%; max-height: calc(100vh - 140px); }
.chat-header { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
.chat-header h3 { margin: 0; font-size: 1rem; font-weight: 600; }
.chat-subtitle { color: var(--muted); font-size: 0.8rem; margin-left: auto; }
.chat-messages { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
.chat-welcome { text-align: center; padding: 3rem 1rem; color: var(--muted); }
.chat-welcome h4 { margin: 0.75rem 0 0.25rem; color: var(--fg); }
.chat-welcome p { margin-bottom: 1rem; font-size: 0.85rem; }
.chat-suggestions { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; }
.chat-bubble { display: flex; gap: 0.5rem; max-width: 85%; }
.chat-bubble.chat-user { align-self: flex-end; flex-direction: row-reverse; }
.chat-bubble.chat-assistant { align-self: flex-start; }
.chat-bubble-icon { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: var(--bg-alt); }
.chat-bubble-content { background: var(--bg-alt); border-radius: var(--radius-sm); padding: 0.5rem 0.75rem; }
.chat-user .chat-bubble-content { background: var(--accent); color: white; }
.chat-text { margin: 0; white-space: pre-wrap; font-family: inherit; font-size: 0.85rem; line-height: 1.5; }
.chat-members { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.5rem; }
.chip-sm { font-size: 0.7rem; padding: 2px 6px; }
.chat-typing { display: flex; gap: 4px; padding: 0.5rem; }
.chat-typing span { width: 6px; height: 6px; background: var(--muted); border-radius: 50%; animation: typing-dot 1.2s infinite; }
.chat-typing span:nth-child(2) { animation-delay: 0.2s; }
.chat-typing span:nth-child(3) { animation-delay: 0.4s; }
@keyframes typing-dot { 0%, 60% { opacity: 0.3; } 30% { opacity: 1; } }
.chat-input-bar { display: flex; gap: 0.5rem; padding: 0.75rem 1rem; border-top: 1px solid var(--border); }
.chat-input-bar input { flex: 1; padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.85rem; }
.chat-input-bar button { padding: 0.5rem; border-radius: var(--radius-sm); background: var(--accent); color: white; border: none; cursor: pointer; display: flex; align-items: center; }
.chat-input-bar button:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 3: Wire ChatPanel into AppShell**

In `AppShell.tsx`:
- Add import: `import { ChatPanel } from "./ChatPanel";`
- Add nav button: `__chat__` with MessageSquare icon
- Add rendering case in the main content area

- [ ] **Step 4: Commit**

```bash
git add src/client/components/ChatPanel.tsx src/client/styles.css src/client/components/AppShell.tsx
git commit -m "feat: add Chat page with natural language project queries"
```

---

### Task 3: Validation Dashboard Drill-Down

**Files:**
- Modify: `src/client/components/ValidationDashboard.tsx`
- Modify: `src/client/components/AppShell.tsx` (pass navigation callbacks)

- [ ] **Step 1: Make severity cards clickable with filter state**

Add `activeSeverityFilter` state. When a tile is clicked, filter the dimension table. Add `cursor: pointer` and hover styles to the cards.

- [ ] **Step 2: Make issue codes navigable**

When user clicks a row in "Most Frequent Issues" table, call `onNavigateDimension(firstDimensionWithIssue, { tab: 'Issues', filterCode: code })`.

- [ ] **Step 3: Wire navigation context through AppShell**

Pass filter context so DimensionWorkspace opens on Issues tab with filter pre-applied. Extend `onOpenDimension` to accept optional `{ tab, filter }` params.

- [ ] **Step 4: Commit**

```bash
git add src/client/components/ValidationDashboard.tsx src/client/components/AppShell.tsx
git commit -m "feat: add drill-down navigation from validation dashboard tiles"
```

---

### Task 4: Project Overview Clickable Tiles

**Files:**
- Modify: `src/client/components/Dashboard.tsx`
- Modify: `src/client/components/KPICards.tsx`

- [ ] **Step 1: Add navigation callbacks to FactStrip items and KPI cards**

Accept `onNavigate(target: string)` prop. Wire:
- Errors/Warnings → `__validation_dashboard__`
- Quality Score → `__quality__`
- Coverage → `__reporting__`
- Members count → first dimension ID

- [ ] **Step 2: Add pointer cursor and hover styles**

```css
.fact-strip-item:hover, .kpi-card:hover { cursor: pointer; box-shadow: var(--shadow-md); transform: translateY(-1px); }
```

- [ ] **Step 3: Commit**

```bash
git add src/client/components/Dashboard.tsx src/client/components/KPICards.tsx src/client/styles.css
git commit -m "feat: make project overview tiles clickable with navigation"
```

---

### Task 5: Admin Export Validation Rules

**Files:**
- Modify: `src/client/components/AdminPanel.tsx`

- [ ] **Step 1: Add export function**

```typescript
function exportRulesAsCsv() {
  const rules = buildValidationRuleList(appConfig);
  const header = "Rule Code,Description,Category,Severity,Active,Blocks Export";
  const rows = rules.map(r => `"${r.code}","${r.description}","${r.category}","${r.severity}","${r.active}","${r.blocksExport}"`);
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `validation-rules-${currentProject?.name ?? 'export'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Add Export button in header**

Add Download icon button beside "Save Overrides" button.

- [ ] **Step 3: Commit**

```bash
git add src/client/components/AdminPanel.tsx
git commit -m "feat(admin): add export validation rules as CSV"
```

---

### Task 6: UI Fixes

**Files:**
- Modify: `src/client/components/HierarchyTree.tsx` (filter fix)
- Modify: `src/client/components/WorkflowPanel.tsx` (empty state)
- Modify: `src/client/components/DimensionWorkspace.tsx` (XML button placement)

- [ ] **Step 1: Fix hierarchy search to actually filter tree**

Change search behavior: when `search` has content, filter the tree to only show nodes (and their ancestor paths) that match. Use a recursive `filterTree` function.

- [ ] **Step 2: Add empty state to WorkflowPanel**

When no workflow instances exist and no changeSetId is provided, show:
```tsx
<div className="empty-state">
  <Clock size={32} />
  <h4>No workflow in progress</h4>
  <p>Start a review workflow from the Change Sets tab to begin the approval process.</p>
</div>
```

- [ ] **Step 3: Move Download XML button**

In `DimensionWorkspace.tsx` header area: remove the "Download XML" button from beside the Ready/Needs Review badge. Ensure it stays ONLY inside the XML tab content area.

- [ ] **Step 4: Commit**

```bash
git add src/client/components/HierarchyTree.tsx src/client/components/WorkflowPanel.tsx src/client/components/DimensionWorkspace.tsx
git commit -m "fix: hierarchy filter, workflow empty state, XML button placement"
```

---

### Task 7: Config Cleanup & Warning Message

**Files:**
- Modify: `config/dimbuilder.yaml` (if needed)
- Modify: `src/shared/oneStreamValidation.ts` (improve warning message)

- [ ] **Step 1: Review and clean dimbuilder.yaml**

The config is already generic — no Excel file paths are hardcoded. Verify `application.title` is generic. If any specific client references exist, remove them. The config uses dynamic dimension names from imported data.

- [ ] **Step 2: Improve PARENT_MEMBER_ALLOW_INPUT_WARNING message**

Update the message to provide more context:
```typescript
message: `Parent member '${parent.memberKey}' has AllowInput enabled while acting as a hierarchy parent. This is normal for accounts accepting manual adjustments, but may indicate unintended configuration for consolidation-only parents.`
```

- [ ] **Step 3: Commit**

```bash
git add config/dimbuilder.yaml src/shared/oneStreamValidation.ts
git commit -m "fix: improve AllowInput warning message, verify config is generic"
```

---

### Task 8: End-to-End Verification

- [ ] **Step 1: Run TypeScript check**
```bash
npx tsc --noEmit
```

- [ ] **Step 2: Run Vite build**
```bash
npx vite build
```

- [ ] **Step 3: Run tests**
```bash
npx vitest run
```

- [ ] **Step 4: Start dev server and test each enhancement manually**

Test:
1. Chat page — type queries, verify responses
2. Validation drill-down — click tiles, verify navigation
3. Project overview — click KPIs, verify navigation
4. Admin export — click export, verify CSV download
5. Hierarchy filter — type in search, verify tree filters
6. Workflow empty state — verify message shows
7. Download XML — verify button is in XML tab only
