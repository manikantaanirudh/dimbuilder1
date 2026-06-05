# PRODUCT.md — OneStream Dimension Builder

## Register

product

## Users

- **OneStream XF implementation consultants**: Technical users building and governing dimension structures for clients. They work across multiple projects, manage 8+ dimensions with thousands of members, and need speed, accuracy, and efficient handoff workflows. Primary power users of every surface.
- **Finance/CPM team leads**: Business-side stakeholders who review and approve dimension changes. Less technical; they need clear visibility into what changed, validation results they can trust, and an approval workflow that doesn't require understanding XML.
- **Technical architects and delivery managers**: Oversee metadata governance across environments (dev, staging, prod). Own deployment readiness, compliance audit trails, environment synchronization, and integration with external systems (ERP connectors, SPCS deployment). Also responsible for platform configuration and OIDC/auth administration.

## Product Purpose

A full-lifecycle OneStream XF implementation platform. Enables importing, validating, editing, diffing, versioning, and deploying dimension hierarchies with governance workflows, AI-assisted insights, multi-environment orchestration, and handoff tooling for consulting delivery.

This is not a simple metadata editor. The scope spans the complete OneStream project lifecycle: from initial dimension import and iterative member editing through validation, approval, release packaging, environment promotion, and SOX-grade audit evidence generation. The platform supports ACM and EPMware handoff, ERP data source connectivity, XML round-trip certification, and natural language querying of metadata via AI.

Success means an OneStream consultant can run a full implementation engagement entirely within this tool, from first import to production deployment.

## Brand & Tone

Technical and authoritative. The interface is a precision instrument at platform scale. Confident without being loud. Dense without being chaotic. Expert-facing without being hostile.

The product has grown from a workbench to a platform. The design language reflects that: consistent system-level patterns, clear information hierarchy, and interactions that feel built by and for practitioners.

Reference points:
- **Vercel**: Clarity of information presentation, clear status communication, density that never collapses into clutter.
- **Linear**: Information density done right. A power-user tool that respects expertise without overwhelming.
- **Supabase**: Developer-friendliness in a technical domain. Precision without coldness.
- **GitHub**: VCS, diff, and audit trail interactions. Familiar, trustworthy patterns for version-controlled metadata.
- **Raycast**: AI-integrated interaction model that enhances the tool without rebranding it as "an AI product."

### Voice Principles

- **Direct**: State facts. Skip hedging and filler.
- **Precise**: Use domain-correct terminology (member, hierarchy, dimension, rollup, POV, XD). Never dumb it down.
- **Calm**: Even errors and warnings are informative, not alarming.
- **Efficient**: Labels and messages are as short as possible without losing meaning.
- **Expert-to-expert**: The interface speaks to practitioners who know the domain. No tutorials or hand-holding by default.

## Theme

Both light and dark themes supported via user toggle. Neither is "default"; both are first-class. Dark for extended metadata editing sessions. Light for review, approval, and collaboration contexts.

## Anti-References

- **Playful SaaS**: No confetti, no emoji-heavy UI, no rounded bubbly cards, no startup energy.
- **Legacy enterprise**: No gray-on-gray density, no tiny fonts, no 2005-era tab bars, no overwhelming form grids.
- **Ultra-minimal**: No excessive whitespace that wastes screen space. Users work with large datasets; structured density is the goal.
- **Neon/cyberpunk**: No glowing accents, no decorative gradients, no dark-mode-as-aesthetic. Dark theme serves function.
- **Generic template**: No Bootstrap defaults, no Material cookie-cutter components, no "looks like every other admin panel."
- **Chatbot UI**: The AI chat panel must not look like ChatGPT, Claude, or any consumer LLM product. No floating bubbles styled like SMS/iMessage, no suggestion chips that prompt "try asking about...", no AI-washing with robot icons or animated typing rings. The chat surface is a command interface, not a companion experience.
- **Consumer collaboration**: Presence indicators and real-time features must not evoke Slack, Google Docs, or Notion. No animated typing indicators, no overlapping avatar pileups, no "so-and-so is editing this" banners. Collaboration is ambient, not social.

## Technology Stack

- React 18 + TypeScript + Vite 6
- Vanilla CSS (single stylesheet, OKLCH color space)
- Lucide React icons
- @tanstack/react-virtual for large list virtualization
- Express 4 backend with SQLite
- JWT + bcrypt + OpenID Connect (OIDC) auth
- Zod request validation, Pino structured logging
- ExcelJS (XLSX), multer (file uploads), YAML config
- Vitest + Playwright test suite
- Docker (Node 22 Alpine, multi-stage) + Snowflake SPCS deployment

## Key Surfaces

| Surface | Purpose | Density |
|---------|---------|---------|
| Dashboard | Project overview, KPIs, dimension list | Medium |
| Dimension Workspace | Grid editing, hierarchy tree, metadata | High |
| Validation Dashboard | Issues, drill-down, bulk actions | High |
| Metadata Diff Panel | Side-by-side baseline comparison | High |
| Workflow Panel | Change sets, approval pipeline | Medium |
| AI Insights Panel | Anomaly detection, named suggestions | Medium |
| Chat Assistant | Natural language metadata querying | Medium |
| Import/Export | File upload, format selection, progress | Low-Medium |
| Environment Panel | Multi-environment management, sync status | Medium |
| Blueprint Studio | Dimension blueprint authoring | Medium-High |
| Migration Cockpit | Legacy system dimension migration | High |
| VCS Panel | Commit history, version tracking | Medium |
| Snapshot Manager | Point-in-time restore management | Low-Medium |
| Artifact Scanner | OneStream cross-artifact impact analysis | High |
| POV Simulator | Effective POV preview and simulation | Medium |
| XD X-Ray | Extensible dimensionality analysis | High |
| Risk Heatmap | Metadata risk visualization | Medium-High |
| Pattern Profiler | Client implementation benchmarking | Medium |
| Reporting Dashboard | Analytics, quality scores, audit evidence | Medium |
| Connector Panel | OneStream + ERP data source management | Low-Medium |
| Scheduler | Cron job management | Low-Medium |
| Admin/Config | User management, YAML config editor, OIDC | Low |
| Audit Log | Full audit trail viewer | Medium |

## Design Priorities

1. **Information density done right**: Pack information without creating visual noise. Structured whitespace, clear grouping, consistent alignment.
2. **Speed of interaction**: Keyboard shortcuts, fast navigation, minimal clicks for common tasks.
3. **Trust through clarity**: Users must trust validation results, diffs, exports, and AI suggestions. Visual precision builds that trust.
4. **Progressive disclosure**: Simple by default, powerful when needed. Don't front-load complexity.
5. **Consistency at platform scale**: With 20+ surfaces, every pattern must be predictable. Once a user learns one panel, they can predict the next.
6. **AI that doesn't feel like AI**: The AI-assisted features (suggestions, anomaly detection, chat) integrate into the tool's visual language. They are part of the instrument, not additions to it.

## Accessibility & Inclusion

- WCAG 2.1 AA target across all surfaces
- Both light and dark themes at AA contrast ratios
- `prefers-reduced-motion` respected for all animations (ScoreRing, transitions)
- Full keyboard navigation with documented shortcuts
- `aria-live` on all async status updates
- Focus management in modals and panels via `useFocusTrap`
