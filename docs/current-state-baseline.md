# Current State Baseline

This baseline was refreshed on 2026-08-09 against the `main` worktree. It distinguishes code present in the repository from capabilities enabled by the committed local configuration.

## Runtime Availability

The committed `config/dimbuilder.yaml` uses the local app profile, disables optional platform modules, and disables AI. Core project, import, validation, export, reporting, workflow, audit, and Project Query routes are mounted by default. Platform-extra, environment-management, legacy assistant, Tier-3, and Tier-4 routes remain gated by `modules` flags. Vitest deliberately enables all modules for route coverage unless `operations.respectModuleGating` is set.

## Implemented Core

- Central YAML configuration drives app identity, paths, feature flags, validation severities, export modes, UI controls, and dimension blueprints.
- Blank metadata projects can be created from blueprints. Blueprint Studio validates drafts, generates YAML fragments, and derives drafts without automatically writing the config file.
- Optional XLSX seeding, XML import with unknown-field preservation, and simple parent/child CSV import are available.
- Members, relationships, varying properties, property defaults, baselines, diffs, change sets, release packages, bulk updates, snapshots, and hierarchy analytics are implemented in the workbench and server routes.
- Validation includes generic metadata checks and a OneStream design-quality profile. Stored catalog-defined blocking issues are enforced by export routes, with optional audited bypass disabled by default. The Project Overview and shared navigation show only those blockers; advisory and informational counts remain in Validation and Reports.
- XML, XLSX, member CSV, relationship CSV, JSON backup, and snapshot exports are implemented when enabled by configuration.
- Reporting, audit logging, workflow status, project ACL support, and impact analysis are implemented in the core route set.
- JWT authentication supports local credentials and OIDC, with system roles `admin`, `author`, `reviewer`, and `viewer`; authentication is disabled by default in the local profile.

## Optional Platform Modules

The following capabilities are implemented in the repository but are not default local-runtime capabilities:

| Module | Implemented areas | Gate |
|---|---|---|
| Platform extras | Cross-dimension mapping, templates, VCS, extensibility, migration, risk heatmap, pattern profiler, config-editor navigation | `modules.platformExtras` |
| Environment management | Environments, connectors, mappings, sync jobs/runs, source registries | `modules.environmentManagement` |
| Project Query | Deterministic project query surface and private query history | Core route; independent of `modules.chatAssistant` and `ai.enabled` |
| Tier 3 / API platform | Excel/add-in, scheduler, quality, API-platform, and offline-sync routes | `modules.offlineSync` or `modules.apiPlatform` |
| Tier 4 | Tenant/platform routes | `modules.multiTenancy` |

Natural-language query code covers project summary, issue health, export readiness, coverage, dimensions, members, hierarchy, properties, relationships, and existence queries. The client hides the assistant unless both module and AI gates are enabled.

## Local-First Boundaries

- SQLite is the default database through Node's built-in `node:sqlite`; PostgreSQL is selected with `DATABASE_URL`.
- The server defaults to `127.0.0.1:8787`; Vite uses `127.0.0.1:5173` in development.
- Uploads and exports use local directories by default.
- Presence is in-memory and scheduled jobs run in-process; no external job runner or WebSocket service is required by the default profile.
- Shared and production app modes apply startup safety checks and force experimental modules off unless explicitly overridden.

## Known Gaps

- Deployment-specific migration rollout, rollback, backup, and compatibility procedures are not fully documented for every environment, although named SQLite and PostgreSQL migrations are implemented.
- Blueprint Studio returns YAML fragments only; visual nested editing and automatic config writes are not implemented.
- XML import supports the current app export shape and common property nodes, not every possible OneStream XML variant.
- Varying-property XML uses a conservative explicit context shape pending exact OneStream-specific confirmation for every property.
- Bulk-update rollback data is stored, but the rollback endpoint is not yet exposed.
- CSV-driven bulk-update mapping is not yet implemented.
- Release package XML is currently full current metadata for every package mode; mode-specific XML subsets and rollback XML are not yet generated.
- Workbook parser tests require a fixture Excel file not in the repository.
- OIDC interoperability and the operational approval of optional platform modules still require external evidence.

## Documentation Baseline

The maintained docs pack lives in `docs/`. The maintenance mechanism is:

- `.codex/skills/docs-maintainer/SKILL.md`
- `npm.cmd run docs:check`
- [Source Map](SOURCE-MAP.md)
- [Gaps And Questions](GAPS-AND-QUESTIONS.md)
