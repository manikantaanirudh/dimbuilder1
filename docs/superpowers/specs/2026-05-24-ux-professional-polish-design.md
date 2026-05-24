# UX Professional Polish — Design Spec

**Project:** OneStream Dim Builder  
**Date:** 2026-05-24  
**Approach:** B — Professional Polish (22 items)  
**Status:** Approved

---

## Overview

This spec addresses 22 UX issues identified through a deep audit of the frontend application using the UI UX Pro Max design intelligence skill. The enhancements span accessibility compliance, performance optimization, and interaction polish to transform the app from functional to professionally polished.

---

## 1. CRITICAL: Accessibility Fixes

### 1.1 Skip-to-Content Link

**File:** `index.html`, `src/client/styles.css`

Add a visually-hidden anchor as the first focusable element in the document. It becomes visible when focused via keyboard Tab.

```html
<a href="#main-content" class="skip-link">Skip to main content</a>
```

```css
.skip-link {
  position: absolute;
  top: -100%;
  left: 16px;
  padding: 8px 16px;
  background: var(--primary);
  color: #fff;
  border-radius: var(--radius-sm);
  z-index: 100;
  font-size: 0.85rem;
  font-weight: 600;
  transition: top var(--transition-fast);
}
.skip-link:focus {
  top: 8px;
}
```

**Target:** `<main>` element in `AppShell.tsx` gets `id="main-content"`.

---

### 1.2 Placeholder Contrast Fix

**File:** `src/client/styles.css`

**Before:** `input::placeholder { color: #a4a097; }` (~2.6:1 ratio)  
**After:** `input::placeholder { color: #6b7280; }` (~4.6:1 ratio, WCAG AA compliant)

---

### 1.3 Muted Text Contrast Fix

**File:** `src/client/styles.css`

**Before:** `--muted: #5a6a80;` (~3.9:1 on `#f8f9fb`)  
**After:** `--muted: #4b5c6f;` (~4.8:1, passes WCAG AA for all text sizes)

---

### 1.4 Tree Node Touch Targets

**File:** `src/client/styles.css`

Tree node buttons currently have `min-height: 24px`. Fix:

```css
.tree-node button,
.tree-node [role="treeitem"] {
  min-height: 44px;
  padding: 10px 8px;
}
```

---

### 1.5 Modal Focus Trap

**New file:** `src/client/hooks/useFocusTrap.ts`

A React hook that:
1. On mount: finds all focusable elements within a ref
2. Traps Tab / Shift+Tab to cycle within those elements
3. Focuses the first focusable element on mount
4. Returns focus to the previously focused element on unmount

```typescript
export function useFocusTrap(ref: RefObject<HTMLElement>, isActive: boolean): void
```

Applied to all 5 modals in `ImportExportModals.tsx`.

---

### 1.6 Modal Escape Key

**File:** `src/client/components/ImportExportModals.tsx`

Add to each modal backdrop:
```tsx
onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
```

---

### 1.7 ImpactAnalysisPanel — Replace Tailwind Classes

**File:** `src/client/components/ImpactAnalysisPanel.tsx`

Replace all Tailwind utility classes (`text-sm`, `grid grid-cols-2`, `space-y-3`, `gap-4`, etc.) with proper CSS classes following existing patterns (`.panel`, `.panel-heading`, inline `style` objects, or new dedicated CSS).

---

### 1.8 ConnectorPanel/EnvironmentPanel — Fix Props

**Files:** `src/client/components/ConnectorPanel.tsx`, `EnvironmentPanel.tsx`

Remove unsupported props passed to `<Panel>` and `<ActionButton>`:
- `<Panel title="...">` → `<Panel><div className="panel-heading"><h3>...</h3></div>...</Panel>`
- `<ActionButton icon={...}>` → `<ActionButton><Icon size={14} /> text</ActionButton>`

---

## 2. HIGH: Performance & Layout Fixes

### 2.1 Google Fonts Preconnect

**File:** `index.html`

Add before the Google Fonts `<link>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
```

---

### 2.2 IssuePanel Windowed Rendering

**File:** `src/client/components/IssuePanel.tsx`

Replace `visibleIssues.slice(0, 500).map(...)` with a simple virtual scroll:
- Container has fixed height with `overflow-y: auto`
- Only render items in viewport + 10-item buffer above/below
- Use `onScroll` to calculate visible range
- Total height maintained via spacer `<div>` for scroll stability

---

### 2.3 HierarchyTree Paginated Loading

**File:** `src/client/components/HierarchyTree.tsx`

Change from loading 1000 relationships upfront to:
- Initial load: 200 relationships
- Show "Load more relationships (X remaining)" button at bottom
- Load next 200 on click
- Tree expands incrementally

---

### 2.4 EditableGrid Search Optimization

**File:** `src/client/components/EditableGrid.tsx`

Replace:
```typescript
records.filter((record) => JSON.stringify(record).toLowerCase().includes(needle))
```

With targeted field search:
```typescript
records.filter((record) => 
  record.memberKey?.toLowerCase().includes(needle) ||
  record.description?.toLowerCase().includes(needle) ||
  record.parentKey?.toLowerCase().includes(needle) ||
  record.childKey?.toLowerCase().includes(needle)
)
```

---

### 2.5 Noscript Tag

**File:** `index.html`

```html
<noscript>
  <div style="padding: 2rem; text-align: center; font-family: sans-serif;">
    <h1>JavaScript Required</h1>
    <p>This application requires JavaScript to be enabled in your browser.</p>
  </div>
</noscript>
```

---

### 2.6 IconButton Touch Targets

**File:** `src/client/styles.css`

```css
.icon-button {
  min-height: 36px;
  min-width: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 1024px) {
  .icon-button {
    min-height: 44px;
    min-width: 44px;
  }
}
```

---

### 2.7 Secondary Nav Aria Label

**File:** `src/client/components/AppShell.tsx`

```tsx
<nav className="secondary-nav" aria-label="Feature navigation">
```

---

## 3. MEDIUM: Polish Enhancements

### 3.1 Skeleton Loading Component

**New file:** `src/client/components/Skeleton.tsx`

A reusable skeleton component with variants:

```tsx
// Usage
<Skeleton variant="circle" size={120} />       // Score circle placeholder
<Skeleton variant="bar" width="80%" />          // Score bar placeholder
<Skeleton variant="text" lines={3} />           // Text block placeholder
<Skeleton variant="table" rows={5} cols={6} />  // Table placeholder
<Skeleton variant="card" count={3} />           // Card grid placeholder
```

CSS: Uses `@keyframes skeleton-pulse` with `background: linear-gradient(90deg, var(--surface-muted) 25%, var(--surface-subtle) 50%, var(--surface-muted) 75%)` and `background-size: 200% 100%` animated.

Applied to: `ReportingDashboard`, `QualityScoresPanel`, `AIInsightsPanel`, `AuditLogViewer`.

---

### 3.2 Toast Notification System

**New file:** `src/client/components/Toast.tsx`

Architecture:
- `ToastProvider` wraps the app (context + state)
- `useToast()` hook returns `{ toast(message, type, duration?) }`
- Types: `success | error | info | warning`
- Toasts render in a fixed container (top-right, `z-index: 60`)
- Auto-dismiss after 4000ms (configurable)
- Slide-in animation from right
- Max 3 visible at once (oldest dismissed first)
- Respects `prefers-reduced-motion` (no slide, instant appear/disappear)

Replaces: Inline `{status && <div className="banner">...}` in AppShell.

---

### 3.3 Confirmation Dialog

**New file:** `src/client/components/ConfirmDialog.tsx`

```tsx
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;   // default "Delete"
  confirmVariant?: 'danger' | 'primary';  // default "danger"
  onConfirm: () => void;
  onCancel: () => void;
}
```

Uses the `useFocusTrap` hook. Applied to:
- EditableGrid: delete row
- ConnectorPanel: delete connector
- EnvironmentPanel: delete environment
- WorkflowPanel: reject workflow

---

### 3.4 Consistent Error Display

**Pattern:** All error messages use `role="alert"` or `aria-live="assertive"` for screen readers.

Three tiers:
1. **Page-level errors:** `.banner.error` div with role="alert" (unrecoverable — API down, auth failed)
2. **Action-level errors:** Toast notification with type "error" (operation failed but page still works)
3. **Field-level errors:** Inline red text below input with `aria-describedby` linkage

Standardize across all components to use these 3 patterns consistently.

---

### 3.5 KPI Cards on Project Overview

**New file:** `src/client/components/KPICards.tsx`

A 4-card horizontal strip displayed above the dimension list on the Dashboard:

| Card | Data Source | Visual |
|------|-------------|--------|
| Quality Score | `GET /api/projects/:id/quality/scores` → overallScore | Mini score circle (80px) with color |
| Total Members | Existing `summary.totalMembers` | Large number + trend arrow |
| Validation Issues | Existing `issueSummary.total` | Number with danger/success badge |
| Coverage | `POST /api/reports/generate/coverage` → overallCoverage | Percentage + progress bar |

Cards have:
- `box-shadow: var(--shadow-sm)` → `var(--shadow-md)` on hover
- `cursor: pointer` — clicking navigates to the relevant tab
- Count-up animation on numbers (0 → value over 600ms)
- Respects `prefers-reduced-motion`

---

### 3.6 Score Circle SVG Animation

**File:** `src/client/styles.css`, `ReportingDashboard.tsx`, `QualityScoresPanel.tsx`

Replace the current CSS-border-based circle with an SVG circle using `stroke-dasharray`:

```tsx
<svg viewBox="0 0 120 120" className="score-ring">
  <circle cx="60" cy="60" r="54" className="score-ring-bg" />
  <circle cx="60" cy="60" r="54" className="score-ring-fill" 
    style={{ strokeDashoffset: offset }} />
</svg>
```

Animation: `stroke-dashoffset` transitions from full circumference to calculated offset over 800ms ease-out. Number counts up simultaneously.

`@media (prefers-reduced-motion: reduce)` — Skip animation, show final state immediately.

---

### 3.7 Card Hover Elevation

**File:** `src/client/styles.css`

Apply to all interactive cards:

```css
.coverage-card,
.quality-dimension-card,
.duplicate-group,
.optimization-card,
.dimension-row {
  cursor: pointer;
  transition: transform var(--transition-base), box-shadow var(--transition-base);
}

.coverage-card:hover,
.quality-dimension-card:hover,
.duplicate-group:hover,
.optimization-card:hover,
.dimension-row:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

@media (prefers-reduced-motion: reduce) {
  .coverage-card:hover,
  .quality-dimension-card:hover,
  .duplicate-group:hover,
  .optimization-card:hover,
  .dimension-row:hover {
    transform: none;
  }
}
```

---

## 4. Verification Plan

After implementation, run this checklist:

### Automated
- [ ] `npx vite build` passes without errors
- [ ] `npx vitest run` — all 549 tests pass

### Manual (Pre-Delivery Checklist from UI UX Pro Max)
- [ ] Tab through entire app — focus visible on every interactive element
- [ ] Skip link appears on first Tab press, navigates to main content
- [ ] All modals trap focus (Tab cycles within modal)
- [ ] Escape closes all modals
- [ ] Placeholder text readable (contrast check)
- [ ] Muted labels readable at small sizes
- [ ] Score circles animate on page load
- [ ] Cards lift on hover
- [ ] Skeleton loaders show during data fetch
- [ ] Toast appears on save/export/error actions
- [ ] Confirm dialog appears before delete actions
- [ ] Tree nodes tappable on touch devices (44px target)
- [ ] No horizontal scroll at 375px viewport
- [ ] `prefers-reduced-motion` disables all animations (test in DevTools)
- [ ] Secondary nav scrolls horizontally on narrow viewports

---

## 5. Files Summary

| Action | File |
|--------|------|
| CREATE | `src/client/hooks/useFocusTrap.ts` |
| CREATE | `src/client/components/Skeleton.tsx` |
| CREATE | `src/client/components/Toast.tsx` |
| CREATE | `src/client/components/ConfirmDialog.tsx` |
| CREATE | `src/client/components/KPICards.tsx` |
| MODIFY | `index.html` |
| MODIFY | `src/client/styles.css` |
| MODIFY | `src/client/components/AppShell.tsx` |
| MODIFY | `src/client/components/ImportExportModals.tsx` |
| MODIFY | `src/client/components/ImpactAnalysisPanel.tsx` |
| MODIFY | `src/client/components/ConnectorPanel.tsx` |
| MODIFY | `src/client/components/EnvironmentPanel.tsx` |
| MODIFY | `src/client/components/Dashboard.tsx` |
| MODIFY | `src/client/components/ReportingDashboard.tsx` |
| MODIFY | `src/client/components/QualityScoresPanel.tsx` |
| MODIFY | `src/client/components/AIInsightsPanel.tsx` |
| MODIFY | `src/client/components/AuditLogViewer.tsx` |
| MODIFY | `src/client/components/EditableGrid.tsx` |
| MODIFY | `src/client/components/HierarchyTree.tsx` |
| MODIFY | `src/client/components/IssuePanel.tsx` |
| MODIFY | `src/client/components/WorkflowPanel.tsx` |

---

## 6. Anti-Patterns to Avoid (from UI UX Pro Max)

- No emojis as icons — all icons via Lucide React SVG
- No layout-shifting hovers — use `transform` not `scale` on containers
- No ornate design — keep data-dense dashboard style
- No hidden filters — all filter controls visible and labeled
- No instant state changes — minimum 150ms transition on all interactions
- No `outline: none` without replacement — always pair with `box-shadow` focus ring
