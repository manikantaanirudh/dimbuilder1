# XML-Derived Dynamic Property Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-scoped, XML-derived dynamic property defaults so property-light CSV/XLSX metadata imports can still export complete OneStream XML while allowing users to edit defaults and row-level overrides.

**Architecture:** Learn default property templates from a OneStream metadata XML extract, persist them per project, and resolve effective values at UI/export/validation time. Defaults are grouped by dimension type, not dimension name, and member/relationship row values override defaults. Clearing a row cell removes the override and returns to the active default.

**Tech Stack:** TypeScript, React, Express, SQLite/better-sqlite3 repositories, Vitest, existing OneStream XML import/export/property dictionary modules.

---

## Current Repo Anchors

- XML import/export already exists in `src/shared/xmlImport.ts` and `src/shared/xmlExport.ts`.
- OneStream property naming/dictionary support already exists in `src/shared/oneStreamPropertyDictionary.ts`.
- CSV metadata import already exists in `src/shared/metadataCsvImport.ts`, `src/server/metadataCsvCommit.ts`, and `/api/import/csv/*`.
- Member and relationship rows store properties in JSON and are editable through `src/client/components/EditableGrid.tsx`.
- Dimension workspace tabs are defined by `getWorkspaceTabs()` in `src/client/ui/viewModel.ts` and rendered in `src/client/components/DimensionWorkspace.tsx`.
- The provided XML `Dev_Metadata_20260519_181236Z.xml` contains 18 dimensions and rich property coverage for Scenario, Account, Entity, Flow, and UD1-UD8.

## Key Product Decisions

- [ ] Use **dynamic defaults**, not materialized defaults: defaults are stored separately and applied at read/export/validation time.
- [ ] Use **dimension type scope**: one Account default set, one Entity default set, one UD1 default set, etc.
- [ ] Choose default values by **most common non-blank value** per dimension type/property.
- [ ] Keep sample/confidence metadata so users can identify low-confidence defaults.
- [ ] Treat clearing a member/relationship cell as “remove override and inherit default.”
- [ ] Include dimension, member, and relationship target levels; relationship defaults matter especially for Entity ownership/consolidation properties.

---

## Task 1: Shared Default Analysis Module

**Files:**
- Create: `src/shared/propertyDefaults.ts`
- Test: `src/test/propertyDefaults.test.ts`

- [ ] Define types:
  - `PropertyDefaultTargetLevel = "dimension" | "member" | "relationship"`
  - `PropertyDefaultProfile`
  - `PropertyDefaultValue`
  - `PropertyDefaultAnalysisInput`
  - `PropertyDefaultAnalysisResult`
- [ ] Add `analyzeXmlPropertyDefaults(xmlContent, options)` that parses OneStream metadata XML and returns type-scoped defaults.
- [ ] Use existing XML/property dictionary naming rules where possible:
  - normalize XML `property name="AccountType"` to the app/dictionary property name
  - preserve source XML name for display/export traceability
  - include XML attributes such as member `alias`, `description`, and relationship `aggregationWeight`
- [ ] Implement default selection:
  - ignore blank values when choosing the most common value
  - if all values are blank, default value is `""`
  - confidence is `winningValueCount / nonBlankCount`
  - store `sampleCount`, `nonBlankCount`, `distinctCount`, and `sourceDimensionNames`
- [ ] Add tests for Account, Entity, Scenario, Flow, and UD defaults using a small fixture derived from `Dev_Metadata_20260519_181236Z.xml`.

## Task 2: Persistence and Repository Methods

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/db/migrations.ts`
- Modify: `src/server/db/repositories.ts`
- Test: `src/test/database.test.ts`

- [ ] Add tables:
  - `property_default_profiles`
  - `property_default_values`
- [ ] Store profiles by `project_id`, `name`, `source_file_name`, `source_xml_hash`, `is_active`, `created_by`, `created_at`, `updated_at`.
- [ ] Store values by `profile_id`, `dimension_type`, `target_level`, `property_name`, `xml_name`, `default_value`, `enabled`, `confidence`, `sample_count`, `non_blank_count`, `distinct_count`, `source_dimension_names_json`, `updated_at`.
- [ ] Ensure only one active profile per project by deactivating previous profiles transactionally before activating a new one.
- [ ] Add repository methods:
  - create profile with values
  - get active profile by project
  - list values by project/dimension type
  - update one default value/enabled flag
  - get effective defaults map for export/validation
- [ ] Add migration tests for new tables and active-profile behavior.

## Task 3: API Routes

**Files:**
- Create: `src/server/routes/propertyDefaults.ts`
- Modify: `src/server/registerApiRoutes.ts`
- Modify: `src/client/api/client.ts`
- Test: `src/test/propertyDefaultsRoutes.test.ts`

- [ ] Add `POST /api/projects/:projectId/property-defaults/analyze-xml`.
  - Accept XML upload.
  - Analyze XML.
  - Persist a new active profile for the project.
  - Return profile summary and defaults grouped by dimension type/target level.
- [ ] Add `GET /api/projects/:projectId/property-defaults`.
  - Return active profile and values.
  - Support optional `dimensionType` query filter.
- [ ] Add `PATCH /api/projects/:projectId/property-defaults/:defaultId`.
  - Allow changing `defaultValue` and `enabled`.
  - Record audit action `propertyDefaults.update`.
- [ ] Add `POST /api/projects/:projectId/property-defaults/apply-active-profile`.
  - Recompute validation using effective defaults.
  - Do not write defaults into every member row.
- [ ] Add client helpers for each endpoint.
- [ ] Tests must verify upload, persistence, update, active profile replacement, and validation trigger behavior.

## Task 4: Effective Property Resolution

**Files:**
- Create or extend: `src/shared/effectiveProperties.ts`
- Modify: `src/shared/xmlExport.ts`
- Modify: `src/shared/validationEngine.ts` or validation orchestration helpers
- Test: `src/test/xmlExport.test.ts`
- Test: `src/test/validationEngine.test.ts`

- [ ] Add `resolveEffectiveProperties(recordProperties, defaults, options)`.
  - explicit row property wins
  - missing/undefined/null row property inherits enabled default
  - empty string means inherit default when used by grid clear behavior
- [ ] Update XML export input to accept active property defaults.
- [ ] During export, merge effective properties before rendering property nodes.
- [ ] Preserve existing unknown XML behavior and dictionary XML-name mapping.
- [ ] Update validation so required-property checks use effective defaults when available.
- [ ] Tests:
  - default value appears in exported XML for CSV-imported member with no property
  - explicit override wins
  - disabled default does not export
  - validation does not flag missing Account Type when active Account default exists

## Task 5: Property Defaults Tab

**Files:**
- Create: `src/client/components/PropertyDefaultsPanel.tsx`
- Modify: `src/client/components/DimensionWorkspace.tsx`
- Modify: `src/client/ui/viewModel.ts`
- Modify: `src/client/styles.css`
- Test: `src/test/clientComponentsMarkup.test.ts`

- [ ] Add a new workspace tab named `Property Defaults`.
- [ ] Render defaults for the active dimension’s `dimensionType`.
- [ ] Group rows by target level: Dimension, Member, Relationship.
- [ ] Show columns:
  - enabled
  - property name
  - XML name
  - default value
  - confidence
  - sample count
  - distinct count
  - source dimension names
- [ ] Allow inline editing of default value and enabled flag.
- [ ] Show a low-confidence visual warning when confidence is below `0.75`.
- [ ] Add upload action to analyze XML into a new active profile.
- [ ] Keep UI copy clear: this creates default property behavior, not OneStream deployment.

## Task 6: Grid Default Display, Overrides, and Filters

**Files:**
- Modify: `src/client/components/EditableGrid.tsx`
- Modify: `src/server/routes/dimensions.ts`
- Modify: `src/server/db/repositories.ts`
- Test: `src/test/clientUiViewModel.test.ts`
- Test: `src/test/projectRoutes.test.ts`

- [ ] Extend member/relationship grid columns to include active default properties for the dimension type.
- [ ] Display inherited default values with an indicator such as `Inherited`.
- [ ] Editing an inherited cell writes an explicit row override through the existing PATCH route.
- [ ] Clearing a cell removes the property key from `properties_json`, so the default is inherited again.
- [ ] Add per-column filter inputs in the grid header.
- [ ] For large dimensions, support server-side filters on members/relationships APIs:
  - property name
  - operator `contains` for text
  - exact match for booleans/numbers
  - inherited/default values included in filter matching
- [ ] Keep existing global search, issue filters, pagination, virtualization, and column visibility working.
- [ ] Tests must cover filtering explicit values and inherited defaults.

## Task 7: Import/Export Integration

**Files:**
- Modify: `src/server/routes/export.ts`
- Modify: `src/server/metadataCsvCommit.ts`
- Modify: `src/shared/workbookParser.ts` only if needed
- Test: `src/test/metadataCsvImport.test.ts`
- Test: `src/test/xmlExport.test.ts`

- [ ] CSV import remains property-light and does not need to materialize defaults.
- [ ] XLSX import remains compatible; property defaults apply to missing properties after import.
- [ ] Export routes load active property defaults and pass them into XML export.
- [ ] Existing JSON/CSV/XLSX exports should not silently change unless explicitly designed; XML is the primary target for default completion.
- [ ] Add regression test: import member/parent CSV, activate defaults, export XML, and verify expected property nodes are present.

## Task 8: Documentation

**Files:**
- Modify: `docs/import-seeding-guide.md`
- Modify: `docs/xml-generation-guide.md`
- Modify: `docs/feature-catalog.md`
- Modify: `docs/database-architecture.md`
- Modify: `docs/decisions.md`
- Modify: `docs/api-reference.md`

- [ ] Explain property-light CSV/XLSX import plus XML-derived dynamic defaults.
- [ ] Document the `Property Defaults` tab and default-vs-override behavior.
- [ ] Document new API endpoints and payload summaries.
- [ ] Document database tables and active-profile behavior.
- [ ] Add a decision entry: dynamic defaults are separate from member overrides so defaults can change without rewriting every member row.
- [ ] Run `npm.cmd run docs:check`.

---

## Acceptance Criteria

- [ ] User can upload `Dev_Metadata_20260519_181236Z.xml` into a project and generate an active property default profile.
- [ ] Every dimension workspace has a `Property Defaults` tab showing defaults for that dimension type.
- [ ] Defaults are editable and dynamically affect non-overridden members/relationships.
- [ ] Member/relationship grid can show defaulted properties and row-level overrides.
- [ ] Clearing an override reverts the cell to the active default.
- [ ] Grid supports per-column filtering for explicit and inherited/default values.
- [ ] CSV/XLSX-imported metadata with only member/parent data can export XML containing configured default property nodes.
- [ ] Explicit row-level property values always win over defaults.
- [ ] Existing XML import/export unknown-property preservation remains intact.
- [ ] Tests, build, and docs checks pass.

## Verification Commands

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run docs:check
```

## Known Non-Goals for V1

- Do not directly deploy metadata to OneStream.
- Do not generate separate defaults for each dimension name; v1 uses dimension type only.
- Do not materialize defaults into every member row.
- Do not support an explicit blank override; clearing a value means inherit default.
- Do not replace the existing CSV import implementation.
