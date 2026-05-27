# PRODUCT.md — OneStream Dimension Builder

## Product Purpose

A metadata management workbench for OneStream XF dimensions. Enables importing, validating, editing, diffing, and exporting dimension hierarchies with governance workflows, AI-assisted insights, and multi-environment deployment.

## Register

product

## Users

- **OneStream XF implementation consultants**: Technical users building dimension structures for clients. They work across multiple projects, need speed and accuracy, and often juggle 8+ dimensions with thousands of members.
- **Finance/CPM team leads**: Business-side users who review and approve dimension changes. Less technical, need clear visibility into what changed and why.
- **Technical architects**: Oversee metadata governance across environments (dev, staging, prod). Care about auditability, compliance, and deployment safety.

## Brand & Tone

Technical and modern. Confident without being flashy. The interface should feel like a precision instrument: every element earns its place, interactions are fast and predictable, and the system communicates clearly without over-explaining.

Think Vercel's clarity, Supabase's developer-friendliness, and Linear's density-without-chaos. The tool respects that users are experts in their domain; it doesn't patronize.

### Voice principles

- **Direct**: State facts. Skip hedging and filler.
- **Precise**: Use domain-correct terminology (member, hierarchy, dimension, rollup). Never dumb it down.
- **Calm**: Even errors and warnings should be informative, not alarming.
- **Efficient**: Labels and messages should be as short as possible without losing meaning.

## Theme

Both light and dark themes supported via user toggle. Neither is "default"; both are first-class. Dark for extended metadata editing sessions. Light for review and collaboration contexts.

## Anti-References (what we are NOT)

- **Playful SaaS**: No confetti, no emoji-heavy UI, no rounded bubbly cards, no startup energy. This is a professional tool for serious work.
- **Legacy enterprise**: No gray-on-gray density, no tiny fonts, no 2005-era tab bars, no overwhelming form fields. Modern despite the enterprise context.
- **Ultra-minimal**: No excessive whitespace that wastes screen space. Users work with large data sets; density matters, but it must be structured density.
- **Neon/cyberpunk**: No glowing accents, no gradients-for-gradients-sake, no dark-mode-as-aesthetic. Dark theme serves function, not style.
- **Generic template**: No Bootstrap defaults, no Material cookie-cutter components, no "looks like every other admin panel." The tool should have its own quiet identity.

## Technology Stack

- React 18 + TypeScript + Vite
- Vanilla CSS (single stylesheet)
- Lucide React icons
- @tanstack/react-virtual for large lists
- Express backend with SQLite

## Key Surfaces

| Surface | Purpose | Density |
|---------|---------|---------|
| Project Overview | Dashboard, KPIs, dimension list | Medium |
| Dimension Workspace | Grid editing, hierarchy tree, metadata | High |
| Validation Dashboard | Issues, drill-down, bulk actions | High |
| AI Insights | Suggestions, anomaly detection | Medium |
| Diff Panel | Side-by-side metadata comparison | High |
| Workflow Panel | Change sets, approval pipeline | Medium |
| Import/Export | File upload, format selection, progress | Low-Medium |
| Admin/Config | User management, settings | Low |

## Design Priorities

1. **Information density done right**: Pack information without creating visual noise. Structured whitespace, clear grouping, consistent alignment.
2. **Speed of interaction**: Keyboard shortcuts, fast navigation, minimal clicks for common tasks.
3. **Trust through clarity**: Users must trust validation results, diffs, and exports. Visual precision builds that trust.
4. **Progressive disclosure**: Simple by default, powerful when needed. Don't front-load complexity.
5. **Consistency**: Same patterns everywhere. Once a user learns one surface, they can predict the next.
