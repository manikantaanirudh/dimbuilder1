# UX Professional Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 critical accessibility issues, 7 high-priority performance/layout problems, and add 7 medium-priority polish enhancements to transform the app from functional to professionally polished.

**Architecture:** Infrastructure-first approach — build reusable hooks and components (focus trap, skeleton, toast, confirm dialog) first, then apply them across the app. CSS fixes are batched into a single early task since they're independent.

**Tech Stack:** React 18, TypeScript, Vite, custom CSS (no Tailwind), Lucide React icons, Vitest

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/client/hooks/useFocusTrap.ts` | Focus trap hook for modals (Tab cycling, restore focus) |
| `src/client/components/Skeleton.tsx` | Skeleton loading placeholders (circle, bar, text, table, card variants) |
| `src/client/components/Toast.tsx` | Toast notification provider + hook + rendering |
| `src/client/components/ConfirmDialog.tsx` | Reusable confirmation modal for destructive actions |
| `src/client/components/KPICards.tsx` | Dashboard KPI card strip (4 metrics) |
| `src/client/components/ScoreRing.tsx` | Animated SVG score ring (replaces CSS border circle) |
| `index.html` | Skip link, preconnect hints, noscript fallback |
| `src/client/styles.css` | Contrast fixes, skeleton animation, toast styles, card hovers, touch targets |
| `src/client/components/AppShell.tsx` | Toast provider, skip target id, nav aria-label |
| `src/client/components/ImportExportModals.tsx` | Focus trap + Escape key on all modals |
| `src/client/components/Dashboard.tsx` | KPI cards integration |
| `src/client/components/ReportingDashboard.tsx` | Skeleton + ScoreRing |
| `src/client/components/QualityScoresPanel.tsx` | Skeleton + ScoreRing |
| `src/client/components/AIInsightsPanel.tsx` | Skeleton loader |
| `src/client/components/AuditLogViewer.tsx` | Skeleton loader |
| `src/client/components/EditableGrid.tsx` | Optimized search |
| `src/client/components/HierarchyTree.tsx` | Paginated loading |
| `src/client/components/IssuePanel.tsx` | Windowed rendering |
| `src/client/components/ImpactAnalysisPanel.tsx` | Replace Tailwind with CSS |
| `src/client/components/ConnectorPanel.tsx` | Fix props + confirm dialog |
| `src/client/components/EnvironmentPanel.tsx` | Fix props + confirm dialog |
| `src/client/components/WorkflowPanel.tsx` | Confirm dialog on reject |

---

## Task 1: CSS Foundation — Contrast, Touch Targets, Animations

**Files:**
- Modify: `src/client/styles.css`
- Modify: `index.html`

- [ ] **Step 1: Fix placeholder contrast**

In `src/client/styles.css`, find and replace:
```css
input::placeholder {
  color: #a4a097;
}
```
Replace with:
```css
input::placeholder {
  color: #6b7280;
}
```

- [ ] **Step 2: Fix muted text contrast**

Find `:root` variable:
```css
--muted: #5a6a80;
```
Replace with:
```css
--muted: #4b5c6f;
```

- [ ] **Step 3: Fix tree node touch targets**

Add after the existing tree styles (search for `.tree-node` or hierarchy-related styles):
```css
/* Tree touch targets - WCAG 2.5.5 */
.hierarchy-tree button,
.hierarchy-tree [role="treeitem"] {
  min-height: 44px;
  padding: 10px 8px;
}
```

- [ ] **Step 4: Fix icon button touch targets**

Find `.icon-button` rule and update:
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

- [ ] **Step 5: Add skeleton animation keyframe**

Add to end of `src/client/styles.css`:
```css
/* Skeleton Loading Animation */
@keyframes skeleton-pulse {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.skeleton {
  background: linear-gradient(90deg, var(--surface-muted) 25%, var(--surface-subtle) 50%, var(--surface-muted) 75%);
  background-size: 200% 100%;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
  border-radius: var(--radius-sm);
}

.skeleton-circle { border-radius: 50%; }
.skeleton-text { height: 14px; margin-bottom: 8px; }
.skeleton-text:last-child { width: 60%; }
```

- [ ] **Step 6: Add toast styles**

```css
/* Toast Notifications */
.toast-container {
  position: fixed;
  top: 80px;
  right: 16px;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 360px;
}

.toast {
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  font-weight: 500;
  animation: toast-slide-in 200ms ease-out;
  cursor: pointer;
}

.toast.success { background: var(--success-soft); color: var(--success); border: 1px solid var(--success); }
.toast.error { background: var(--danger-soft); color: var(--danger); border: 1px solid var(--danger); }
.toast.info { background: var(--info-soft); color: var(--info); border: 1px solid var(--info); }
.toast.warning { background: var(--warning-soft); color: #793400; border: 1px solid var(--warning); }

@keyframes toast-slide-in {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .toast { animation: none; }
}
```

- [ ] **Step 7: Add card hover elevation**

```css
/* Card Hover Elevation */
.coverage-card,
.quality-dimension-card,
.duplicate-group,
.optimization-card {
  cursor: pointer;
  transition: transform var(--transition-base), box-shadow var(--transition-base);
}

.coverage-card:hover,
.quality-dimension-card:hover,
.duplicate-group:hover,
.optimization-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

@media (prefers-reduced-motion: reduce) {
  .coverage-card:hover,
  .quality-dimension-card:hover,
  .duplicate-group:hover,
  .optimization-card:hover {
    transform: none;
  }
}
```

- [ ] **Step 8: Add skip-link styles**

```css
/* Skip to Content */
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
  text-decoration: none;
  transition: top var(--transition-fast);
}
.skip-link:focus { top: 8px; }
```

- [ ] **Step 9: Update index.html**

Add preconnect hints, skip link, and noscript. In `index.html`, add before the Google Fonts link:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
```

Add as first child of `<body>`:
```html
<a href="#main-content" class="skip-link">Skip to main content</a>
```

Add inside `<body>` after `<div id="root">`:
```html
<noscript>
  <div style="padding: 2rem; text-align: center; font-family: sans-serif;">
    <h1>JavaScript Required</h1>
    <p>This application requires JavaScript to be enabled.</p>
  </div>
</noscript>
```

- [ ] **Step 10: Commit**

```bash
git add src/client/styles.css index.html
git commit -m "fix(ux): CSS foundation — contrast, touch targets, animations, skip link"
```

---

## Task 2: Focus Trap Hook

**Files:**
- Create: `src/client/hooks/useFocusTrap.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(containerRef: React.RefObject<HTMLElement | null>, isActive: boolean): void {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

    const container = containerRef.current;
    const focusableElements = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

    // Focus first focusable element
    const elements = focusableElements();
    if (elements.length > 0) elements[0].focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;

      const els = focusableElements();
      if (els.length === 0) return;

      const first = els[0];
      const last = els[els.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      if (previousFocusRef.current && previousFocusRef.current.focus) {
        previousFocusRef.current.focus();
      }
    };
  }, [isActive, containerRef]);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/hooks/useFocusTrap.ts
git commit -m "feat(ux): add useFocusTrap hook for modal accessibility"
```

---

## Task 3: Skeleton Component

**Files:**
- Create: `src/client/components/Skeleton.tsx`

- [ ] **Step 1: Create the component**

```tsx
export function Skeleton({ variant = "text", width, height, lines = 3, rows = 5, cols = 4, count = 3, size }: {
  variant?: "text" | "circle" | "bar" | "table" | "card";
  width?: string;
  height?: string;
  lines?: number;
  rows?: number;
  cols?: number;
  count?: number;
  size?: number;
}) {
  if (variant === "circle") {
    const s = size ?? 120;
    return <div className="skeleton skeleton-circle" style={{ width: s, height: s }} />;
  }

  if (variant === "bar") {
    return <div className="skeleton" style={{ width: width ?? "80%", height: height ?? "8px" }} />;
  }

  if (variant === "text") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: width ?? "100%" }}>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="skeleton skeleton-text" style={{ width: i === lines - 1 ? "60%" : "100%" }} />
        ))}
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%" }}>
        <div className="skeleton" style={{ height: "32px", width: "100%" }} />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ display: "flex", gap: "8px" }}>
            {Array.from({ length: cols }).map((_, j) => (
              <div key={j} className="skeleton" style={{ height: "28px", flex: 1 }} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(250px, 1fr))`, gap: "1rem" }}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: "120px", borderRadius: "var(--radius-sm)" }} />
        ))}
      </div>
    );
  }

  return null;
}

export function SkeletonReportDashboard() {
  return (
    <section style={{ padding: "1.5rem 2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <Skeleton variant="text" lines={2} width="200px" />
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Skeleton variant="bar" width="60px" height="32px" />
          <Skeleton variant="bar" width="60px" height="32px" />
          <Skeleton variant="bar" width="60px" height="32px" />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "2rem", padding: "1.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius)", marginBottom: "2rem" }}>
        <Skeleton variant="circle" size={120} />
        <Skeleton variant="text" lines={2} width="300px" />
      </div>
      <Skeleton variant="table" rows={3} cols={6} />
    </section>
  );
}

export function SkeletonAuditLog() {
  return (
    <section style={{ padding: "1.5rem 2rem" }}>
      <Skeleton variant="text" lines={1} width="200px" />
      <div style={{ marginTop: "1rem" }}><Skeleton variant="bar" width="100%" height="36px" /></div>
      <div style={{ marginTop: "1rem" }}><Skeleton variant="table" rows={8} cols={5} /></div>
    </section>
  );
}

export function SkeletonAIInsights() {
  return (
    <section style={{ padding: "1.5rem 2rem" }}>
      <Skeleton variant="text" lines={1} width="250px" />
      <div style={{ display: "flex", gap: "1rem", marginTop: "1rem", marginBottom: "1rem" }}>
        <Skeleton variant="bar" width="80px" height="32px" />
        <Skeleton variant="bar" width="80px" height="32px" />
        <Skeleton variant="bar" width="80px" height="32px" />
      </div>
      <Skeleton variant="card" count={3} />
    </section>
  );
}

export function SkeletonQualityScores() {
  return (
    <section style={{ padding: "1.5rem 2rem" }}>
      <Skeleton variant="text" lines={1} width="200px" />
      <div style={{ display: "flex", alignItems: "flex-start", gap: "2rem", marginTop: "1.5rem" }}>
        <Skeleton variant="circle" size={140} />
        <Skeleton variant="text" lines={4} width="300px" />
      </div>
      <div style={{ marginTop: "2rem" }}><Skeleton variant="card" count={4} /></div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/components/Skeleton.tsx
git commit -m "feat(ux): add Skeleton loading component with page-specific variants"
```

---

## Task 4: Toast Notification System

**Files:**
- Create: `src/client/components/Toast.tsx`
- Modify: `src/client/components/AppShell.tsx`

- [ ] **Step 1: Create Toast component**

```tsx
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = "info", duration = 4000) => {
    const id = ++toastId;
    setToasts(prev => [...prev.slice(-2), { id, message, type }]); // max 3
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const icons = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-container" aria-live="polite" aria-atomic="false">
        {toasts.map(t => {
          const Icon = icons[t.type];
          return (
            <div key={t.id} className={`toast ${t.type}`} role="alert" onClick={() => dismiss(t.id)}>
              <Icon size={16} />
              <span>{t.message}</span>
              <X size={14} style={{ marginLeft: "auto", opacity: 0.6 }} />
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
```

- [ ] **Step 2: Wrap AppShell with ToastProvider**

In `AppShell.tsx`, import `ToastProvider` from `"./Toast"` and wrap the root `<div className="app-shell ...">` inside `<ToastProvider>...</ToastProvider>`.

Also add `id="main-content"` to the `<main>` element and `aria-label="Feature navigation"` to the secondary `<nav>`.

- [ ] **Step 3: Commit**

```bash
git add src/client/components/Toast.tsx src/client/components/AppShell.tsx
git commit -m "feat(ux): add toast notification system with auto-dismiss"
```

---

## Task 5: Confirm Dialog

**Files:**
- Create: `src/client/components/ConfirmDialog.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { ActionButton } from "./ui";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel = "Delete", confirmVariant = "danger", onConfirm, onCancel }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel} onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
      <div ref={dialogRef} className="modal confirm-dialog" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <div className="confirm-icon"><AlertTriangle size={24} /></div>
        <h3 id="confirm-title">{title}</h3>
        <p id="confirm-message">{message}</p>
        <div className="confirm-actions">
          <ActionButton onClick={onCancel}>Cancel</ActionButton>
          <ActionButton variant={confirmVariant} onClick={onConfirm}>{confirmLabel}</ActionButton>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add confirm dialog CSS to styles.css**

```css
/* Confirm Dialog */
.confirm-dialog { text-align: center; max-width: 400px; }
.confirm-icon { color: var(--warning); margin-bottom: 12px; }
.confirm-dialog h3 { margin: 0 0 8px; font-size: 1.1rem; }
.confirm-dialog p { margin: 0 0 20px; color: var(--muted); font-size: 0.9rem; }
.confirm-actions { display: flex; gap: 8px; justify-content: center; }
```

- [ ] **Step 3: Commit**

```bash
git add src/client/components/ConfirmDialog.tsx src/client/styles.css
git commit -m "feat(ux): add ConfirmDialog for destructive action confirmation"
```

---

## Task 6: ScoreRing SVG Component

**Files:**
- Create: `src/client/components/ScoreRing.tsx`

- [ ] **Step 1: Create animated SVG score ring**

```tsx
import { useEffect, useRef, useState } from "react";

function scoreTone(score: number): string {
  if (score >= 80) return "var(--success)";
  if (score >= 50) return "var(--warning)";
  return "var(--danger)";
}

export function ScoreRing({ score, size = 120, label = "Overall" }: { score: number; size?: number; label?: string }) {
  const [displayScore, setDisplayScore] = useState(0);
  const animRef = useRef<number>(0);
  const radius = (size / 2) - 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (displayScore / 100) * circumference;
  const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reducedMotion) { setDisplayScore(score); return; }

    const start = performance.now();
    const duration = 800;

    function animate(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setDisplayScore(Math.round(eased * score));
      if (progress < 1) animRef.current = requestAnimationFrame(animate);
    }

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [score, reducedMotion]);

  return (
    <div className="score-ring-wrapper" style={{ width: size, height: size, position: "relative" }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={scoreTone(score)} strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: reducedMotion ? "none" : "stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: size > 100 ? "2rem" : "1.5rem", fontWeight: 700, lineHeight: 1 }}>{displayScore}</span>
        <span style={{ fontSize: "0.7rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 4 }}>{label}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/components/ScoreRing.tsx
git commit -m "feat(ux): add animated ScoreRing SVG component"
```

---

## Task 7: KPI Cards Component

**Files:**
- Create: `src/client/components/KPICards.tsx`
- Modify: `src/client/styles.css`

- [ ] **Step 1: Create KPICards component**

```tsx
import { useEffect, useState } from "react";
import { TrendingUp, AlertTriangle, Users, BarChart3 } from "lucide-react";
import { fetchQualityScores, fetchCoverageReport } from "../api/client";
import { ScoreRing } from "./ScoreRing";
import type { DashboardSummary, ValidationIssue } from "../../shared/types";
import { buildIssueSummary } from "../ui/viewModel";

export function KPICards({ projectId, summary, issues, blockedSeverities }: {
  projectId: string;
  summary: DashboardSummary | null;
  issues: ValidationIssue[];
  blockedSeverities: string[];
}) {
  const [qualityScore, setQualityScore] = useState<number | null>(null);
  const [coverage, setCoverage] = useState<number | null>(null);
  const issueSummary = buildIssueSummary(issues, blockedSeverities);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [q, c] = await Promise.all([
          fetchQualityScores(projectId).catch(() => null),
          fetchCoverageReport(projectId).catch(() => null)
        ]);
        if (!cancelled) {
          setQualityScore(q?.overallScore ?? null);
          setCoverage(c?.overallCoverage ?? null);
        }
      } catch { /* ignore */ }
    }
    void load();
    return () => { cancelled = true; };
  }, [projectId]);

  return (
    <div className="kpi-cards">
      <div className="kpi-card">
        <div className="kpi-icon"><BarChart3 size={20} /></div>
        <div className="kpi-content">
          <span className="kpi-label">Quality Score</span>
          {qualityScore !== null ? (
            <ScoreRing score={qualityScore} size={64} label="" />
          ) : (
            <span className="kpi-value">—</span>
          )}
        </div>
      </div>

      <div className="kpi-card">
        <div className="kpi-icon"><Users size={20} /></div>
        <div className="kpi-content">
          <span className="kpi-label">Total Members</span>
          <span className="kpi-value">{summary?.totalMembers ?? 0}</span>
        </div>
      </div>

      <div className="kpi-card">
        <div className="kpi-icon"><AlertTriangle size={20} /></div>
        <div className="kpi-content">
          <span className="kpi-label">Issues</span>
          <span className={`kpi-value ${issueSummary.total > 0 ? "kpi-danger" : "kpi-success"}`}>
            {issueSummary.total}
          </span>
        </div>
      </div>

      <div className="kpi-card">
        <div className="kpi-icon"><TrendingUp size={20} /></div>
        <div className="kpi-content">
          <span className="kpi-label">Coverage</span>
          <span className="kpi-value">{coverage !== null ? `${coverage}%` : "—"}</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add KPI card CSS**

```css
/* KPI Cards */
.kpi-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
.kpi-card { display: flex; align-items: center; gap: 12px; padding: 16px 20px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); box-shadow: var(--shadow-sm); transition: box-shadow var(--transition-base), transform var(--transition-base); cursor: pointer; }
.kpi-card:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
.kpi-icon { color: var(--primary); opacity: 0.7; }
.kpi-content { display: flex; flex-direction: column; gap: 4px; }
.kpi-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--muted); font-weight: 600; }
.kpi-value { font-size: 1.5rem; font-weight: 700; line-height: 1; }
.kpi-danger { color: var(--danger); }
.kpi-success { color: var(--success); }

@media (max-width: 1024px) { .kpi-cards { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) { .kpi-cards { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .kpi-card:hover { transform: none; } }
```

- [ ] **Step 3: Integrate into Dashboard.tsx**

In `src/client/components/Dashboard.tsx`, import `KPICards` and render it after the `<FactStrip>` section (inside `<div className="overview-document">`), only when `project` exists:

```tsx
{project && store.selectedProjectId && (
  <KPICards
    projectId={store.selectedProjectId}
    summary={summary}
    issues={issues}
    blockedSeverities={appConfig.validation.exportBlockedBySeverities}
  />
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/client/components/KPICards.tsx src/client/components/ScoreRing.tsx src/client/styles.css src/client/components/Dashboard.tsx
git commit -m "feat(ux): add KPI cards to project overview dashboard"
```

---

## Task 8: Apply Skeleton Loaders to Panels

**Files:**
- Modify: `src/client/components/ReportingDashboard.tsx`
- Modify: `src/client/components/QualityScoresPanel.tsx`
- Modify: `src/client/components/AIInsightsPanel.tsx`
- Modify: `src/client/components/AuditLogViewer.tsx`

- [ ] **Step 1: Replace loading text in ReportingDashboard**

Replace:
```tsx
if (loading) return <div className="empty-state">Loading reports...</div>;
```
With:
```tsx
import { SkeletonReportDashboard } from "./Skeleton";
// ...
if (loading) return <SkeletonReportDashboard />;
```

Also replace the score circle div with `<ScoreRing>`:
```tsx
import { ScoreRing } from "./ScoreRing";
// Replace <div className={`score-circle ...`}>...</div> with:
<ScoreRing score={health.overallScore} size={120} />
```

- [ ] **Step 2: Replace loading in QualityScoresPanel**

Replace:
```tsx
if (loading) return <div className="empty-state">Calculating quality scores...</div>;
```
With:
```tsx
import { SkeletonQualityScores } from "./Skeleton";
if (loading) return <SkeletonQualityScores />;
```

Replace the large score circle with `<ScoreRing score={overallScore} size={140} label="Overall Quality" />`.

- [ ] **Step 3: Replace loading in AIInsightsPanel**

Replace:
```tsx
if (loading) return <div className="empty-state">Analyzing metadata with AI...</div>;
```
With:
```tsx
import { SkeletonAIInsights } from "./Skeleton";
if (loading) return <SkeletonAIInsights />;
```

- [ ] **Step 4: Replace loading in AuditLogViewer**

Replace:
```tsx
if (loading) return <div className="empty-state">Loading audit log...</div>;
```
With:
```tsx
import { SkeletonAuditLog } from "./Skeleton";
if (loading) return <SkeletonAuditLog />;
```

- [ ] **Step 5: Commit**

```bash
git add src/client/components/ReportingDashboard.tsx src/client/components/QualityScoresPanel.tsx src/client/components/AIInsightsPanel.tsx src/client/components/AuditLogViewer.tsx
git commit -m "feat(ux): replace loading text with skeleton loaders and ScoreRing"
```

---

## Task 9: Modal Focus Trap + Escape Key

**Files:**
- Modify: `src/client/components/ImportExportModals.tsx`

- [ ] **Step 1: Add focus trap and Escape to all modals**

At the top of `ImportExportModals.tsx`, add:
```tsx
import { useRef } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
```

For each modal component (CreateProjectModal, OpenProjectModal, ImportModal, ExportModal, SaveAsModal):
1. Add `const modalRef = useRef<HTMLDivElement>(null);`
2. Add `useFocusTrap(modalRef, open);`
3. On the `.modal-backdrop` div, add: `onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}`
4. On the `.modal` div, add: `ref={modalRef}`

- [ ] **Step 2: Commit**

```bash
git add src/client/components/ImportExportModals.tsx
git commit -m "fix(a11y): add focus trap and Escape key to all modals"
```

---

## Task 10: Fix ImpactAnalysisPanel (Tailwind → CSS)

**Files:**
- Modify: `src/client/components/ImpactAnalysisPanel.tsx`
- Modify: `src/client/styles.css`

- [ ] **Step 1: Replace Tailwind classes with CSS**

Replace all Tailwind utility classes in ImpactAnalysisPanel with equivalent inline styles or CSS classes matching existing patterns. Key replacements:
- `text-sm` → `style={{ fontSize: "0.85rem" }}`
- `grid grid-cols-2 gap-4` → `style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}`
- `space-y-3` → `style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}`
- `font-medium` → `style={{ fontWeight: 500 }}`

Use `<Panel>` wrapper and `.panel-heading` pattern for consistency.

- [ ] **Step 2: Commit**

```bash
git add src/client/components/ImpactAnalysisPanel.tsx src/client/styles.css
git commit -m "fix(ux): replace broken Tailwind classes in ImpactAnalysisPanel with CSS"
```

---

## Task 11: Fix ConnectorPanel/EnvironmentPanel Props + Add Confirmations

**Files:**
- Modify: `src/client/components/ConnectorPanel.tsx`
- Modify: `src/client/components/EnvironmentPanel.tsx`

- [ ] **Step 1: Fix ConnectorPanel**

Replace `<Panel title="...">` with:
```tsx
<Panel>
  <div className="panel-heading"><div><h3>Connectors</h3></div></div>
  ...
</Panel>
```

Add `ConfirmDialog` for delete actions. Import and use:
```tsx
import { ConfirmDialog } from "./ConfirmDialog";
// Add state: const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
// Replace direct delete calls with: setConfirmDelete(id)
// Render: <ConfirmDialog open={!!confirmDelete} title="Delete Connector" message="..." onConfirm={...} onCancel={...} />
```

- [ ] **Step 2: Fix EnvironmentPanel (same pattern)**

Same approach as ConnectorPanel.

- [ ] **Step 3: Commit**

```bash
git add src/client/components/ConnectorPanel.tsx src/client/components/EnvironmentPanel.tsx
git commit -m "fix(ux): fix Panel/Button props, add delete confirmations"
```

---

## Task 12: Performance — Grid Search, Tree Pagination, Issue Windowing

**Files:**
- Modify: `src/client/components/EditableGrid.tsx`
- Modify: `src/client/components/HierarchyTree.tsx`
- Modify: `src/client/components/IssuePanel.tsx`

- [ ] **Step 1: Optimize EditableGrid search**

Find the filter function using `JSON.stringify` and replace with field-specific search:
```tsx
const filtered = needle
  ? records.filter(r =>
      (r.memberKey ?? r.parentKey ?? "").toLowerCase().includes(needle) ||
      (r.description ?? r.childKey ?? "").toLowerCase().includes(needle)
    )
  : records;
```

- [ ] **Step 2: Add pagination to HierarchyTree**

Change the relationship fetch from `limit: 1000` to `limit: 200`. Add state:
```tsx
const [loadedCount, setLoadedCount] = useState(200);
const [hasMore, setHasMore] = useState(true);
```

Add "Load more" button at bottom of tree when `hasMore`:
```tsx
{hasMore && <button className="action-button secondary" onClick={loadMore}>Load more relationships</button>}
```

- [ ] **Step 3: Add basic windowing to IssuePanel**

Replace the flat `slice(0, 500).map(...)` with a scrollable container that only renders visible items:
```tsx
const ITEM_HEIGHT = 72;
const VISIBLE_COUNT = 12;
const [scrollTop, setScrollTop] = useState(0);
const startIndex = Math.floor(scrollTop / ITEM_HEIGHT);
const visibleItems = visibleIssues.slice(startIndex, startIndex + VISIBLE_COUNT + 2);
const totalHeight = visibleIssues.length * ITEM_HEIGHT;
```

Wrap in a container with `overflow-y: auto; max-height: 864px` and a spacer div for total height.

- [ ] **Step 4: Commit**

```bash
git add src/client/components/EditableGrid.tsx src/client/components/HierarchyTree.tsx src/client/components/IssuePanel.tsx
git commit -m "perf(ux): optimize grid search, tree pagination, issue windowing"
```

---

## Task 13: Final Verification

- [ ] **Step 1: Run build**

```bash
npx vite build
```
Expected: `✓ built in Xs` with no errors.

- [ ] **Step 2: Run tests**

```bash
npx vitest run --exclude "src/test/workbookParser.test.ts"
```
Expected: 549+ tests pass, 0 failures.

- [ ] **Step 3: Manual pre-delivery checklist**

Tab through app and verify:
- Skip link appears on first Tab
- Modals trap focus
- Escape closes modals
- Score rings animate
- Skeleton loaders show during data fetch
- Toast notifications appear
- Cards lift on hover
- Tree nodes are tappable (44px)
- No horizontal scroll at 375px

- [ ] **Step 4: Commit all remaining changes**

```bash
git add -A
git commit -m "feat(ux): complete professional polish — 22 enhancements applied

Accessibility: skip link, contrast fixes, focus trap, Escape key, touch targets, aria labels
Performance: grid search optimization, tree pagination, issue windowing, font preconnect
Polish: skeleton loaders, toast notifications, confirm dialogs, KPI cards, score animations, card hovers

.... Generated with [Cortex Code](https://docs.snowflake.com/en/user-guide/cortex-code/cortex-code)

Co-Authored-By: Cortex Code <noreply@snowflake.com>"
```
