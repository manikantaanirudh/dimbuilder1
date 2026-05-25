# Enhancement Batch Design Spec (2026-05-25)

## 7 Enhancements

### 1. Chatbot Page (Hybrid AI)

**Goal:** New "Chat" page in secondary nav. Users type natural language questions about their project data and get structured answers with clickable results.

**Backend:** Already exists — `POST /projects/:id/ai/query` calls `parseAndExecuteQuery()` in `src/server/ai/naturalLanguage/queryParser.ts`. Supports intents: find, count, children, missing_property, property_filter, orphans. Fallback to keyword search. If AI provider configured, can use LLM via `/projects/:id/ai/chat`.

**Frontend:** New `ChatPanel.tsx` component:
- Message thread with user/assistant bubbles
- Input bar with send button (Enter to send)
- Suggested quick-query chips above input: "Find member...", "Show orphans", "Count members in Account", "List children of Root"
- Results show member names as clickable links → navigate to that member's dimension
- Conversation history maintained in local state (optionally persisted via `/ai/chat` endpoint)
- Loading state with typing indicator during queries
- Empty state: welcome message explaining capabilities + example queries

**Query enhancement:** Add a new `check_exists` intent to the parser that specifically handles "is there a member called X" / "does X exist" patterns — returns member details (dimension, properties, parent) if found, or "not found" message.

### 2. Validation Dashboard Drill-Down

**Goal:** Summary tiles are clickable. Clicking a count navigates to filtered detail view.

**Changes to `ValidationDashboard.tsx`:**
- Error/Warning/Info count cards become clickable buttons with `cursor: pointer` and hover state
- Clicking a severity tile filters the "Issues by Dimension" table to that severity only
- Dimension rows in the table are already clickable (existing `onNavigateDimension`)
- Add: clicking a specific issue code in "Most Frequent Issues" navigates to the dimension with the Issues tab active and that code pre-filtered
- Wire `onNavigateDimension` to pass filter context (severity or code) so DimensionWorkspace opens on Issues tab with filter pre-applied

### 3. Project Overview Clickable Tiles

**Goal:** FactStrip items and KPI cards link to relevant views.

**Changes to `Dashboard.tsx` / `KPICards.tsx`:**
- "Dimensions" count → no change (already shows dimension list below)
- "Members" count → navigate to first dimension's Members tab
- "Errors" / "Warnings" → navigate to Validation Dashboard (already a nav tab)
- Quality score ring → navigate to Quality page
- Coverage tile → navigate to Reports page
- All tiles get `cursor: pointer`, hover elevation, `onClick` handlers
- Pass `onNavigate(target)` callback from AppShell to Dashboard/KPICards

### 4. Admin: Export Validation Rules

**Goal:** "Export Rules" button in AdminPanel that downloads rules as CSV/JSON.

**Changes to `AdminPanel.tsx`:**
- Add "Export Rules" button (Download icon) in header beside "Save Overrides"
- On click: generates CSV with columns: Rule Code, Description, Category, Severity, Active, Blocks Export
- Uses `buildValidationRuleList()` data already available
- Downloads as `validation-rules-{project-name}.csv` via browser blob download
- No new API endpoint needed — all data is client-side from config

### 5. UI Fixes

**5a. Hierarchy search not filtering:**
- Current: search highlights matches but doesn't filter/hide non-matches
- Fix: Add a filter mode — when search text is entered, only show tree branches that contain matches (collapse non-matching branches, show full path to matched nodes)

**5b. Workflow tab empty:**
- Current: Shows nothing because no changeSetId is passed from DimensionWorkspace
- Fix: Show an informational state: "No workflow in progress for this dimension. Start a review workflow from the Change Sets tab." with a link/button to Change Sets tab

**5c. Download XML button placement:**
- Current: "Download XML" button appears beside the "Ready/Needs review" badge at top-right of dimension header
- Fix: Remove from header position. Keep it ONLY inside the XML tab (beside "Copy" and "Preview ready" buttons)

### 6. dimbuilder.yaml Cleanup

**Goal:** Make config generic for any OneStream application.

**Changes:**
- Remove any Excel template-specific references in config code paths
- Verify `import.workbook` section is generic (it already is — just says "merge duplicate sheets" etc.)
- The config is already generic — the actual dimension names come from imported project data
- Check `metadataReference` section — if it references specific file paths, make generic
- Ensure `application.title` and descriptions don't reference a specific client

### 7. Warning Legitimacy

**`PARENT_MEMBER_ALLOW_INPUT_WARNING`** IS a legitimate OneStream validation rule.

In OneStream, parent members typically aggregate data from children (via consolidation). When a parent also has `AllowInput = true`, it accepts direct data entry which can conflict with consolidation. The 957 warnings on the Account dimension likely mean most parent accounts allow input — which is valid for some configurations (e.g., manual adjustments at parent level) but worth flagging.

**Action:** Keep as `warning` severity by default but add a dismissibility note in the issue message: "This is normal for accounts that accept manual adjustments." The user can change severity to `info` in Admin panel.
