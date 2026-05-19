# SR Onestream Dim Builder Documentation

This folder is the maintained knowledge base for SR Onestream Dim Builder. It describes the current application, the code paths that implement each behavior, and the operational rules for keeping documentation current as the system changes.

## Start Here

- [Application Summary](application-summary.md): Product purpose, core users, and main workflows.
- [Developer Quickstart](developer-quickstart.md): Install, run, test, and build commands.
- [Architecture](architecture.md): Client, server, shared logic, persistence, and data flow.
- [Implementation Map](implementation-map.md): Source-file map by feature area.
- [Current State Baseline](current-state-baseline.md): What is implemented today and what remains intentionally limited.
- [Application Summary Checklist](application-summary-checklist.md): Quick review checklist for keeping the app narrative accurate.

## Functional Guides

- [Configuration Guide](configuration-guide.md): `config/dimbuilder.yaml`, defaults, validation, and environment overrides.
- [Dimension Blueprints](dimension-blueprints.md): How generic dimensions, root members, defaults, and seeded members are configured.
- [Feature Catalog](feature-catalog.md): User-facing capabilities and the source files behind them.
- [Import Seeding Guide](import-seeding-guide.md): Optional XLSX project seeding and metadata reference alignment.
- [Validation Rules](validation-rules.md): Validation engine behavior, severity controls, and export blocking.
- [Export Modes](export-modes.md): XML, XLSX, CSV, JSON, and snapshot exports.
- [XML Generation Guide](xml-generation-guide.md): OneStream XML rendering rules and field mapping.
- [Metadata Diff Guide](metadata-diff-guide.md): Baseline creation, comparison rules, persisted diff items, and current limits.
- [Change Set Guide](change-set-guide.md): Change set lifecycle, approval gating, package contents, and current release package limits.
- [Bulk Update Guide](bulk-update-guide.md): Preview-first member and relationship property updates, audit logging, and rollback data.

## Technical References

- [API Reference](api-reference.md): HTTP endpoints exposed by the Express server.
- [Database Architecture](database-architecture.md): SQLite schema, repository layer, and data ownership.
- [Audit And Reliability](audit-reliability.md): Audit logs, snapshots, transactions, and reliability boundaries.
- [Security Model](security-model.md): Current local-first security posture and hardening needs.
- [Testing Strategy](testing-strategy.md): Unit, integration, markup, and browser verification approach.
- [System Integration Test Report](system-integration-test-report.md): Latest end-to-end SIT execution results.
- [Deployment Guide](deployment-guide.md): Build output, runtime configuration, and deployment notes.
- [Production Readiness Checklist](production-readiness-checklist.md): Checklist before production or shared use.

## Planning And Governance

- [Decisions](decisions.md): Architecture decisions and rationale.
- [Enhancement Roadmap Prompts](enhancement-roadmap-prompts.md): Future-work prompts grouped by area.

## Keeping Docs Current

Use the repo-local Codex skill at `.codex/skills/docs-maintainer/SKILL.md` whenever changing source files that affect behavior, configuration, APIs, persistence, validation, exports, or user workflows.

Run the documentation checker before handoff:

```powershell
npm.cmd run docs:check
```

The checker verifies that this documentation pack exists, that this index links to every required document, and that source changes are paired with documentation or docs-maintenance changes.
