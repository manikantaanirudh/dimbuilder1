# Current State Baseline

This baseline describes the application state as of 2026-05-19.

## Implemented

- Product identity is SR Onestream Dim Builder.
- Central YAML config drives app identity, feature flags, paths, validation severities, export modes, UI controls, and dimension blueprints.
- Blank metadata projects can be created from blueprints.
- Blueprint-created projects seed dimensions, root members, optional members, optional relationships, and relationship defaults.
- XLSX import is an optional seed workflow.
- Metadata reference XML can align imported dimensions and add metadata-only dimensions.
- Members and relationships can be edited in the workbench.
- A versioned OneStream property dictionary describes supported dimension, member, and relationship properties for UI labels, validation, API schema output, and XML property mapping.
- Validation detects common metadata and hierarchy issues.
- Validation warns on unknown dictionary properties and errors on invalid dictionary enum or typed values.
- XML preview and export work from persisted records.
- XML export preserves unknown properties and uses dictionary aliases/XML names before fallback conversion.
- XLSX, CSV, JSON, and snapshots are available when enabled.
- Audit logs record major actions.
- Tests cover config, parsing, validation, exports, repositories, routes, project blueprints, and UI view models.

## Intentionally Local-First

- The app uses SQLite.
- User identity is fixed to `local-admin`.
- The server defaults to localhost.
- Uploads and exports are local directories.

## Known Gaps

- No authentication.
- No authorization.
- No database migrations.
- No snapshot restore.
- No server-side validation export blocking.
- No background export job lifecycle.
- Limited operational monitoring.
- No formal release process.

## Documentation Baseline

The maintained docs pack lives in `docs/`. The maintenance mechanism is:

- `.codex/skills/docs-maintainer/SKILL.md`
- `npm.cmd run docs:check`

Use both whenever source changes affect behavior or project operation.
