# Current State Baseline

This baseline describes the application state as of 2026-05-19.

## Implemented

- Product identity is SR Onestream Dim Builder.
- Central YAML config drives app identity, feature flags, paths, validation severities, export modes, UI controls, and dimension blueprints.
- Blank metadata projects can be created from blueprints.
- Blueprint-created projects seed dimensions, root members, optional members, optional relationships, and relationship defaults.
- Blueprint Studio can validate blueprint drafts, generate YAML fragments, and derive drafts from existing project dimensions without automatically writing config files.
- XLSX import is an optional seed workflow.
- OneStream metadata XML can be imported directly as an editable project.
- Metadata reference XML can align imported dimensions and add metadata-only dimensions.
- Members and relationships can be edited in the workbench.
- A versioned OneStream property dictionary describes supported dimension, member, and relationship properties for UI labels, validation, API schema output, and XML property mapping.
- Varying property values can be stored for dimensions, members, and relationships with cube type, scenario type, and time member context.
- Metadata baselines can be created from the current project snapshot and compared against the current project.
- Diff runs persist structured member, relationship, property, move/copy, and warning items.
- Change sets can be created from diff runs, validated, approved or rejected, and exported as release package directories with notes, reports, XML, rollback notes, and a manifest.
- Member and relationship properties can be bulk-updated through a preview-first workflow with filters, dictionary/type warnings, transactional apply, audit logs, and rollback JSON.
- Hierarchies can be analyzed per dimension with cycle-safe paths, levelized rows, leaf/parent classification, shared member detection, orphan detection, depth stats, and deterministic CSV exports.
- Saved project snapshots can be listed, restored into the current project with an automatic safety snapshot, or branched into a new project.
- Validation detects common metadata and hierarchy issues.
- Validation warns on unknown dictionary properties and errors on invalid dictionary enum or typed values.
- Validation detects duplicate varying property contexts, missing varying targets, unknown varying properties, non-varying overrides, and invalid varying values.
- XML preview and export work from persisted records.
- XML export preserves unknown properties and uses dictionary aliases/XML names before fallback conversion.
- XML export re-emits XML-imported unknown attributes, unknown property nodes, and unsupported child elements when known edited values have not replaced them.
- XML export appends deterministic contextual property nodes for varying property values without changing base flat property output.
- XLSX, CSV, JSON, and snapshots are available when enabled.
- Export routes block server-side when stored validation issues match `validation.exportBlockedBySeverities`, with optional audited bypass disabled by default.
- Audit logs record major actions.
- Tests cover config, parsing, validation, exports, repositories, routes, project blueprints, Blueprint Studio helpers/endpoints, and UI view models.

## Intentionally Local-First

- The app uses SQLite.
- User identity is fixed to `local-admin`.
- The server defaults to localhost.
- Uploads and exports are local directories.

## Known Gaps

- No authentication.
- No authorization.
- No database migrations.
- Blueprint Studio returns YAML fragments only; visual nested editing and automatic config writes are intentionally not implemented.
- XML import supports the current app export shape and common property nodes, not every possible OneStream XML variant.
- Varying property XML uses a conservative explicit context shape pending exact OneStream-specific confirmation for every property.
- Bulk update rollback data is stored, but the rollback endpoint is not yet exposed.
- CSV-driven bulk update mapping is not yet implemented.
- Baseline import from multipart XML upload is not yet exposed; XML baseline support currently accepts XML text through the project baseline endpoint.
- Release package XML is currently full current metadata for every package mode; mode-specific XML subsets and rollback XML are not yet generated.
- No background export job lifecycle.
- Limited operational monitoring.
- No formal release process.

## Documentation Baseline

The maintained docs pack lives in `docs/`. The maintenance mechanism is:

- `.codex/skills/docs-maintainer/SKILL.md`
- `npm.cmd run docs:check`

Use both whenever source changes affect behavior or project operation.
