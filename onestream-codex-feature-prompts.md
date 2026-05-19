# SR Onestream Dim Builder - Codex Feature Prompt Pack

This file contains a single Markdown prompt pack you can give to Codex. It is designed for SR Onestream Dim Builder, a local-first TypeScript/React/Express/SQLite workbench for building, validating, previewing, and exporting OneStream dimension metadata.

## How to use this file

Use the **Master Context Prompt** first. Then give Codex one feature prompt at a time.

Recommended approach:

1. Paste the Master Context Prompt into Codex.
2. Paste one feature prompt.
3. Ask Codex to implement that feature completely.
4. Require tests, build, and docs verification before moving to the next feature.
5. Commit after each successful feature.

Do not ask Codex to implement all features at once unless you are intentionally starting a long-lived branch. These prompts are detailed enough that each feature can be a meaningful engineering task by itself.

---

# Master Context Prompt

````text
You are working on SR Onestream Dim Builder, a local-first TypeScript/React/Express/SQLite application for building, validating, previewing, and exporting OneStream dimension metadata.

Before changing code, study the repo documentation and source anchors:
- docs/application-summary.md
- docs/current-state-baseline.md
- docs/api-reference.md
- docs/database-architecture.md
- docs/implementation-map.md
- docs/configuration-guide.md
- docs/dimension-blueprints.md
- docs/validation-rules.md
- docs/export-modes.md
- docs/xml-generation-guide.md
- docs/security-model.md
- docs/testing-strategy.md
- docs/production-readiness-checklist.md
- docs/decisions.md

Important existing architecture:
- Express routes live under src/server/routes.
- Shared domain logic lives under src/shared.
- React UI components live under src/client/components.
- Client API helpers live in src/client/api/client.ts.
- Client state lives in src/client/state/useProjectStore.ts.
- SQLite schema lives in src/server/db/schema.ts.
- Repository access belongs in src/server/db/repositories.ts.
- Do not put SQL directly in route handlers.
- Use repository methods and synchronous repos.transaction().
- Export renderers belong in src/shared, not directly inside route handlers.
- Validation logic belongs in src/shared/validationEngine.ts and related shared helpers.
- Hierarchy analysis belongs in src/shared/hierarchy.ts.
- Config contracts belong in src/shared/appConfigTypes.ts.
- Config defaults and validation belong in src/shared/appConfigDefaults.ts and src/shared/appConfigValidation.ts.
- Tests live in src/test and use Vitest.
- Update docs whenever behavior, APIs, database, config, validation, exports, or workflows change.
- Use .codex/skills/docs-maintainer/SKILL.md for docs maintenance if present.
- Run npm.cmd test, npm.cmd run build, and npm.cmd run docs:check before final handoff.

Product context:
- The app is intentionally generic.
- Blank metadata projects are created from central dimension blueprints in config/dimbuilder.yaml.
- XLSX import is optional seeding, not the core product narrative.
- XML export reads persisted records and renders OneStream metadata XML.
- The current app supports projects, dimensions, members, relationships, validation issues, snapshots, exports, and audit logs.
- The current known gaps include no authentication, no authorization, no database migrations, no snapshot restore, no server-side validation export blocking, no background export lifecycle, limited operational monitoring, and no formal release process.

Development principles:
1. Preserve the current local-first workflow.
2. Do not break blank project creation from config/dimbuilder.yaml.
3. Keep XLSX import optional, not the product center.
4. Maintain backward compatibility with existing project data where possible.
5. Prefer small, typed shared modules over route-local logic.
6. Add or update tests for every important behavior.
7. Update API client types, server routes, repositories, shared types, docs, and tests together.
8. If a feature requires schema changes and migrations do not exist yet, implement safe schema evolution in the existing schema initialization style or introduce a minimal migration pattern only if the specific task asks for it.
9. Never assume a direct OneStream server connection unless the feature explicitly asks for one. This app should generate safe metadata artifacts, reports, and packages for review/import.
10. After implementation, summarize changed files, test results, and any limitations.

Now implement the feature described in the next prompt.
````

---

# Feature 01 - Server-side export blocking

````text
Feature: Enforce validation-based export blocking on the server.

Goal:
Move export blocking from client-only behavior to server-enforced behavior. If stored validation issues contain severities listed in validation.exportBlockedBySeverities, export endpoints must refuse to produce export files unless an explicit, audited bypass is allowed by config.

Current behavior:
The UI disables exports when blocking validation severities exist, but server export routes do not enforce this. Fix that.

Current anchors:
- src/server/routes/export.ts
- src/server/routes/validation.ts
- src/shared/validationEngine.ts
- src/client/ui/viewModel.ts
- src/client/components/ImportExportModals.tsx
- src/shared/appConfigTypes.ts
- src/shared/appConfigDefaults.ts
- src/shared/appConfigValidation.ts
- src/server/db/repositories.ts
- docs/export-modes.md
- docs/validation-rules.md
- docs/security-model.md
- docs/production-readiness-checklist.md

Implement:
1. Config:
   Add optional export blocking config:
   - validation.exportBlockedBySeverities already exists.
   Add if useful:
   - export.allowValidationBypass: boolean default false
   - export.validationBypassRequiresReason: boolean default true
   - export.requireValidationBeforeExport: boolean default false for backward compatibility
   Validate all config changes.

2. Repository:
   Add helpers:
   - listValidationIssuesForProject(projectId)
   - hasBlockingValidationIssues(projectId, blockedSeverities)
   Keep SQL in repositories.ts.

3. Server guard:
   Create src/server/exportGuards.ts or similar.
   Function:
   - assertProjectCanExport(projectId, config, repos, options)
   Behavior:
   - Load stored validation issues.
   - If matching blocked severities exist and bypass is not allowed or not requested, throw HTTP 409 with JSON:
     {
       "error": "Export blocked by validation issues",
       "blocked": true,
       "blockedSeverities": [...],
       "issueCounts": {...}
     }
   - If bypass is allowed and requested, require a reason if configured.
   - Record an audit log for any bypass.
   - If no validation run exists and export.requireValidationBeforeExport is true, block with HTTP 409.

4. Routes:
   Apply guard to every export route:
   - GET /api/export/:projectId/xml
   - GET /api/export/:projectId/json
   - GET /api/export/:projectId/members.csv
   - GET /api/export/:projectId/relationships.csv
   - GET /api/export/:projectId/xlsx
   - POST /api/export/:projectId/snapshot

5. Client:
   - Keep existing UI-side disabling.
   - If server returns 409, show a clear error with issue counts.
   - Add bypass UI only if config exposes allowValidationBypass true.

6. Tests:
   - Export route succeeds when no blocking issues.
   - Export route returns 409 when error issue exists and errors block export.
   - Warning issues do not block if config only blocks errors.
   - Snapshot endpoint also blocks.
   - Bypass is disabled by default.
   - Config validation tests cover new config fields.
   - Client view model test if UI behavior changes.

7. Docs:
   - Update docs/export-modes.md.
   - Update docs/validation-rules.md.
   - Update docs/security-model.md.
   - Update docs/production-readiness-checklist.md.
   - Update docs/api-reference.md for HTTP 409 response and optional bypass behavior.
   - Update docs/configuration-guide.md for new config if added.

Acceptance criteria:
- Export endpoints are protected server-side.
- Error shape is clear and test-covered.
- Existing UI behavior still works.
- No export format is forgotten.
- npm.cmd test passes.
- npm.cmd run build passes.
- npm.cmd run docs:check passes.
````

---

# Feature 02 - OneStream property dictionary

````text
Feature: Add a versioned OneStream metadata property dictionary.

Goal:
Make SR Onestream Dim Builder OneStream-aware at the property level. Today the app can store member and relationship data, but many properties live as generic JSON. Add a typed metadata dictionary that describes supported OneStream dimension properties by dimension type and target level so the UI, validation, import, export, diff, and future bulk update tools can reason about properties consistently.

Context:
The app currently supports these dimension types:
- Scenario
- Entity
- Account
- Flow
- UD1 through UD8

Current source anchors:
- src/shared/types.ts
- src/shared/dimensionSchemas.ts
- src/shared/relationshipDefaults.ts
- src/shared/xmlExport.ts
- src/shared/workbookParser.ts
- src/shared/validationEngine.ts
- src/server/db/schema.ts
- src/server/db/repositories.ts
- src/client/components/DimensionWorkspace.tsx
- src/client/components/EditableGrid.tsx
- config/dimbuilder.yaml
- docs/configuration-guide.md
- docs/dimension-blueprints.md
- docs/xml-generation-guide.md
- docs/api-reference.md

Implement:
1. Create a shared property dictionary module:
   - src/shared/oneStreamPropertyDictionary.ts
   - Define property metadata for dimensions, members, and relationships.
   - Include fields:
     - propertyKey
     - displayName
     - xmlName
     - aliases
     - targetLevel: "dimension" | "member" | "relationship"
     - dimensionTypes: array of supported dimension types or "all"
     - valueType: "string" | "boolean" | "number" | "decimal" | "enum" | "memberRef" | "formula" | "securityGroup" | "currency" | "timeMember"
     - enumValues optional
     - required optional
     - defaultValue optional
     - supportsVarying optional
     - appliesToExportFormats optional: xml, xlsx, csv, json, acm
     - helpText optional
     - oneStreamVersionIntroduced optional
     - oneStreamVersionDeprecated optional

2. Seed a practical initial dictionary:
   - Common member properties:
     - Name / member key
     - Alias
     - Description
     - Display Group
     - Read Data Group
     - Read Security Group
     - Text1 through Text8
   - Common relationship properties:
     - Aggregation Weight
     - Percent Consol
     - Percent Ownership
     - Ownership Type
   - Account-specific starter properties:
     - Account Type
     - Formula Type
     - Allow Input
     - Is Consolidated
   - Entity-specific starter properties:
     - Currency
     - Allow Input
     - Use Cube FX Settings
     - Percent Consol
     - Percent Ownership
     - Ownership Type
   - Flow-specific starter properties:
     - Flow Type
     - Switch Sign
     - Switch Type
   - Scenario-specific starter properties:
     - Scenario Type
     - Workflow Tracking Frequency
   - UD1-UD8 starter properties:
     - Allow Input
     - Text1 through Text8
     - related dimension / attribute style placeholder fields if the current app schema already has equivalents

3. Add helper functions:
   - getPropertyDefinitionsForDimension(dimensionType, targetLevel)
   - getPropertyDefinitionByName(dimensionType, targetLevel, fieldName)
   - normalizePropertyName(dimensionType, targetLevel, fieldName)
   - toOneStreamXmlPropertyNameFromDictionary(...)
   - isKnownProperty(...)
   - getUnknownProperties(record, dictionary)

4. Wire dictionary into XML export:
   - Prefer dictionary xmlName mapping before fallback conversion.
   - Preserve current explicit mapping behavior.
   - Keep backward compatibility with unknown fields.

5. Wire dictionary into validation:
   - Add warnings for unknown properties by target level and dimension type.
   - Do not block export by default for unknown properties.
   - Add INVALID_ENUM_VALUE for enum fields where applicable.
   - Add INVALID_PROPERTY_TYPE for boolean/number fields based on dictionary.
   - Reuse existing issue shape.

6. Expose dictionary through API:
   - GET /api/schema/onestream
   - GET /api/schema/onestream/:version
   - Return client-safe dictionary grouped by dimension type and target level.
   - Add client API helper in src/client/api/client.ts.

7. UI:
   - Use dictionary definitions to show field labels/help text where practical.
   - Add a small property info affordance in member/relationship grid if simple.
   - Do not overbuild UI. Minimum: make dictionary available to client and use it in at least one visible place, such as a field tooltip or property metadata panel.

8. Tests:
   - Add unit tests for dictionary lookup and alias normalization.
   - Add XML export tests proving dictionary xmlName mapping wins.
   - Add validation tests for invalid enum/type and unknown property warnings.
   - Add API route test for /api/schema/onestream.

9. Docs:
   - Update docs/api-reference.md for new endpoint.
   - Update docs/configuration-guide.md if config changes are introduced.
   - Update docs/xml-generation-guide.md for dictionary-based property mapping.
   - Update docs/validation-rules.md for new issue codes.
   - Update docs/implementation-map.md.
   - Add a decision to docs/decisions.md explaining why OneStream property dictionary is now shared domain logic.

Acceptance criteria:
- Existing tests still pass.
- npm.cmd test passes.
- npm.cmd run build passes.
- npm.cmd run docs:check passes.
- Existing exports remain backward compatible.
- Unknown properties are not dropped.
- The dictionary can be extended without touching route handlers.
````

---

# Feature 03 - Stronger OneStream-specific validation profile

````text
Feature: Add OneStream-specific validation profile.

Goal:
Expand validation beyond generic metadata integrity into OneStream metadata design quality. Add configurable rules for naming, aliases, Root/None conventions, sort order, property typing, shared members, relationship properties, and high-risk design patterns.

Current anchors:
- src/shared/validationEngine.ts
- src/shared/hierarchy.ts
- src/shared/dimensionSchemas.ts
- src/shared/oneStreamPropertyDictionary.ts if implemented
- src/shared/appConfigTypes.ts
- src/shared/appConfigDefaults.ts
- src/shared/appConfigValidation.ts
- src/server/routes/validation.ts
- src/client/components/IssuePanel.tsx
- docs/validation-rules.md
- config/dimbuilder.yaml

Implement:
1. Config:
   Add validation.oneStreamProfile:
   - enabled: boolean default true
   - memberNameMaxLength: number default 250
   - warnOnMemberNameSpaces: boolean default true
   - warnOnMemberNamePeriods: boolean default true
   - reservedWords: string[] default ["Root", "None"]
   - restrictedCharacters: string[] default based on XML/control safety and common OneStream restrictions
   - duplicateAliasSeverity: "error" | "warning" | "info" default warning
   - invalidSortOrderSeverity default warning
   - sharedMemberSeverity default info
   - parentInputWarningSeverity default warning
   - unknownPropertySeverity default warning
   - invalidEnumSeverity default error
   - invalidPropertyTypeSeverity default error
   - udAttributeCountWarningThreshold default 2000
   - exportBlockingSeverities remains existing config

2. Validation rules:
   Add issue codes:
   - MEMBER_NAME_TOO_LONG
   - MEMBER_NAME_CONTAINS_SPACE
   - MEMBER_NAME_CONTAINS_PERIOD
   - MEMBER_NAME_RESTRICTED_CHARACTER
   - RESERVED_MEMBER_NAME_CASE_MISMATCH
   - DUPLICATE_ALIAS
   - ALIAS_DUPLICATES_MEMBER_NAME
   - SORT_ORDER_ZERO
   - SORT_ORDER_DUPLICATE
   - UNKNOWN_PROPERTY
   - INVALID_ENUM_VALUE
   - INVALID_PROPERTY_TYPE
   - SHARED_MEMBER_DETECTED
   - MULTIPLE_PARENT_NOT_ALLOWED
   - PARENT_MEMBER_ALLOW_INPUT_WARNING
   - ACCOUNT_TYPE_MISSING
   - ENTITY_CURRENCY_MISSING
   - RELATIONSHIP_WEIGHT_MISSING
   - ENTITY_OWNERSHIP_VALUE_INVALID
   - VARYING_PROPERTY_DUPLICATE if varying properties exist

3. Rule behavior:
   - Names:
     - Check length.
     - Warn on spaces/periods if configured.
     - Check restricted characters.
   - Aliases:
     - Duplicate alias within same dimension type/name warns/errors.
     - Alias equal to existing member key warns/errors.
   - Root/None:
     - Detect incorrect casing or unexpected duplicates.
   - Sort order:
     - row_order/source sort order zero warning.
     - duplicate sibling row order warning.
   - Shared members:
     - If same child has multiple parents and blueprint/config says allowMultipleParents false, error.
     - If true, emit info or warning depending on config.
   - Dimension-specific:
     - Account: warn for missing Account Type on non-root member.
     - Entity: warn for missing Currency where applicable.
     - Flow: validate switch sign/type booleans/enums if present.
     - UD: warn for suspicious attribute-member patterns if dictionary flags exist.

4. Validation profile design:
   Keep generic validation separate from OneStream profile rules where possible:
   - src/shared/validationEngine.ts orchestrates.
   - Add src/shared/oneStreamValidation.ts for domain-specific rules.
   Export pure functions that are easy to test.

5. API:
   Extend POST /api/validation/:projectId/run body:
   - { duplicateSeverity, profile?: "default" | "onestream", options?: {...} }
   Default to current behavior plus OneStream profile if config enabled.

6. UI:
   - IssuePanel should display new issue codes naturally.
   - Add filter by severity/code if not too heavy.
   - Show profile name in validation summary.

7. Tests:
   - Unit tests for every new important rule.
   - Config validation tests for oneStreamProfile.
   - API test for validation profile selection.
   - UI/view model test for issue summary counts if changed.

8. Docs:
   - Update docs/validation-rules.md with new profile and issue codes.
   - Update docs/configuration-guide.md.
   - Update docs/feature-catalog.md.
   - Update docs/production-readiness-checklist.md.

Acceptance criteria:
- Existing validation tests still pass.
- New OneStream profile rules are configurable and tested.
- No hard-coded route-level validation logic.
- Users see meaningful OneStream design warnings before export.
- npm.cmd test passes.
- npm.cmd run build passes.
- npm.cmd run docs:check passes.
````

---

# Feature 04 - XML import as editable project with unknown-property preservation

````text
Feature: Import OneStream XML as an editable project and preserve unknown XML fields.

Goal:
Allow users to import a OneStream metadata XML file directly into SR Onestream Dim Builder as an editable project. Preserve unknown attributes/properties so users trust the app for round-trip editing.

Context:
The app currently:
- Can export OneStream metadata XML from persisted project records.
- Can use metadata XML reference data during XLSX import.
- Can import XLSX as optional seed workflow.
- Stores unknown-ish data in metadata_json and properties_json.

Current anchors:
- src/shared/xmlExport.ts
- src/server/metadataReference.ts
- src/server/routes/import.ts
- src/shared/workbookParser.ts
- src/server/db/repositories.ts
- src/server/db/schema.ts
- src/shared/types.ts
- src/client/components/ImportExportModals.tsx
- src/client/api/client.ts
- docs/import-seeding-guide.md
- docs/xml-generation-guide.md

Implement:
1. Shared XML parser:
   Create src/shared/xmlImport.ts.
   It should parse the app's expected OneStream metadata XML shape:
   - project metadata
   - dimensions
   - dimension attributes
   - members
   - member attributes
   - member property elements
   - relationships
   - relationship attributes
   - relationship property elements

2. Unknown preservation:
   Define an UnknownXmlData shape:
   - unknownAttributes
   - unknownElements
   - originalXmlPath or sourcePath
   - sourceOrder
   Store unknown dimension/member/relationship XML data in metadata_json or properties_json, or add dedicated fields only if necessary.
   Do not discard unknown fields.
   During export, re-emit preserved unknown fields when they were not overwritten by known mapped values.

3. API:
   Add:
   - POST /api/import/xml
   Multipart fields:
   - file: required XML file
   - projectName: optional
   Response:
   - project
   - importSummary with counts, warnings, errors, unknown field counts
   Add client helper.

4. Import flow:
   - Save file under uploads directory.
   - Parse XML.
   - Create project.
   - Insert dimensions, members, and relationships.
   - Run validation.
   - Replace project issues.
   - Record audit log action project.importXml.
   - Return project and summary.

5. UI:
   Extend Import modal:
   - Existing XLSX seeding remains.
   - Add "Import XML" option.
   - Clearly label XML import as editable OneStream metadata XML import.
   - Show import summary/warnings after upload.
   Do not remove XLSX workflow.

6. Export round-trip:
   - Update xmlExport to use preserved unknown attributes/properties.
   - If a known field has been edited, edited known value wins.
   - If unknown field was untouched, preserve it.
   - Deterministic ordering: known attributes/properties first, then preserved unknowns sorted/source ordered.

7. Validation:
   Add informational/warning issues:
   - XML_UNKNOWN_DIMENSION_ATTRIBUTE
   - XML_UNKNOWN_MEMBER_ATTRIBUTE
   - XML_UNKNOWN_RELATIONSHIP_ATTRIBUTE
   - XML_UNSUPPORTED_ELEMENT_PRESERVED
   These should not block export by default.

8. Tests:
   - Unit parse test for simple XML with one dimension, members, relationships.
   - Round-trip test proving unknown attributes/properties survive.
   - Import API test for XML upload.
   - Validation test for unknown preserved field issues.
   - Export test proving edited known field overrides original while unknown remains.

9. Docs:
   - Update docs/api-reference.md.
   - Update docs/import-seeding-guide.md.
   - Update docs/xml-generation-guide.md.
   - Update docs/feature-catalog.md.
   - Update docs/database-architecture.md if persistence changes.
   - Update docs/testing-strategy.md if new test style added.

Acceptance criteria:
- Users can import XML without workbook.
- Imported XML produces editable dimensions/members/relationships.
- Unknown fields are visible in summary and preserved on export.
- Existing XLSX import still works.
- Existing XML export still works for blueprint-created projects.
- npm.cmd test passes.
- npm.cmd run build passes.
- npm.cmd run docs:check passes.
````

---

# Feature 05 - Snapshot restore, branching, and rollback

````text
Feature: Add snapshot restore, restore-as-new-project, and project branching.

Goal:
Make project snapshots useful for rollback and branching. Users should be able to restore a snapshot into the current project or create a new project from a snapshot.

Current anchors:
- src/server/routes/export.ts
- src/server/db/schema.ts
- src/server/db/repositories.ts
- src/shared/csvJsonExport.ts
- src/server/routes/projects.ts
- src/client/components/ImportExportModals.tsx
- src/client/components/Dashboard.tsx
- src/client/api/client.ts
- docs/export-modes.md
- docs/database-architecture.md
- docs/current-state-baseline.md

Implement:
1. Snapshot shape audit:
   Inspect current project_snapshots data and JSON backup shape.
   Ensure a snapshot contains enough information to restore:
   - project
   - dimensions
   - members
   - relationships
   - validation issues if available
   - metadata_json/properties_json
   - future varying properties if table exists

2. Repository:
   Add methods:
   - listProjectSnapshots(projectId)
   - getProjectSnapshot(projectId, snapshotId)
   - restoreSnapshotIntoProject(projectId, snapshotId, options)
   - createProjectFromSnapshot(snapshotId, newProjectName, options)
   - compareSnapshotToCurrent(projectId, snapshotId) optional if diff exists
   Restore must run inside repos.transaction().

3. Restore behavior:
   Options:
   - mode: "replaceCurrent" | "newProject"
   - preserveProjectIdentity boolean
   - restoreValidationIssues boolean default false

   For replaceCurrent:
   - Create a safety snapshot before restore if possible.
   - Delete existing dimensions/members/relationships for the project.
   - Insert snapshot state.
   - Update project updated_at.
   - Record audit log snapshot.restore.

   For newProject:
   - Insert new project.
   - Insert snapshot dimensions/members/relationships.
   - Record audit log snapshot.branch.

4. API:
   Add:
   - GET /api/projects/:projectId/snapshots
   - GET /api/projects/:projectId/snapshots/:snapshotId
   - POST /api/projects/:projectId/snapshots/:snapshotId/restore
   - POST /api/projects/:projectId/snapshots/:snapshotId/branch
   Response should include project or restored summary.

5. UI:
   Add Snapshot Manager:
   - List snapshots.
   - Show created date/name.
   - Restore current project with confirmation.
   - Create new project from snapshot.
   - Show warning that restore replaces current metadata.
   - After restore/branch, refresh project store.

6. Validation:
   After restore, optionally run validation or show "Run validation" action.
   Do not assume restored validation issues are current unless restoreValidationIssues true.

7. Tests:
   - Repository test restoring snapshot into current project.
   - Repository test branch from snapshot.
   - API tests for list/restore/branch.
   - Test safety snapshot creation if implemented.
   - UI markup test for Snapshot Manager.

8. Docs:
   - Update docs/api-reference.md.
   - Update docs/export-modes.md.
   - Update docs/database-architecture.md.
   - Update docs/audit-reliability.md if present.
   - Update docs/current-state-baseline.md to remove no snapshot restore gap.
   - Update docs/production-readiness-checklist.md.

Acceptance criteria:
- User can restore a snapshot into current project.
- User can create a new project from snapshot.
- Restore is transactional.
- Audit logs record restore/branch.
- Existing snapshot export still works.
- npm.cmd test passes.
- npm.cmd run build passes.
- npm.cmd run docs:check passes.
````

---

# Feature 06 - Baseline compare/diff engine

````text
Feature: Add metadata baseline compare/diff engine.

Goal:
Let users compare the current project metadata against a baseline metadata snapshot/XML/project state and produce a structured diff of members, relationships, properties, hierarchy movement, deletes, and warnings.

Product intent:
This app should help OneStream implementation teams understand what changed before exporting XML or release packages. The diff engine should be reusable by future change sets, release packages, break/build exports, and rollback workflows.

Current anchors:
- src/shared/types.ts
- src/shared/hierarchy.ts
- src/shared/validationEngine.ts
- src/shared/csvJsonExport.ts
- src/shared/xmlImport.ts if implemented
- src/server/db/schema.ts
- src/server/db/repositories.ts
- src/server/routes/projects.ts
- src/client/components/DimensionWorkspace.tsx
- src/client/components/Dashboard.tsx
- src/client/api/client.ts
- docs/api-reference.md
- docs/database-architecture.md

Implement:
1. Data model:
   Add tables:
   - project_baselines
     - id
     - project_id
     - name
     - source_type: "xml" | "snapshot" | "json" | "manual"
     - source_file_name
     - baseline_json
     - created_by
     - created_at
   - metadata_diff_runs
     - id
     - project_id
     - baseline_id
     - status
     - summary_json
     - created_by
     - created_at
   - metadata_diff_items
     - id
     - diff_run_id
     - dimension_type
     - dimension_name
     - target_type: "dimension" | "member" | "relationship" | "property"
     - change_type: "add" | "update" | "delete" | "move" | "copy" | "unchanged" | "warning"
     - severity: "info" | "warning" | "error"
     - object_key
     - parent_key nullable
     - child_key nullable
     - property_name nullable
     - old_value nullable
     - new_value nullable
     - details_json nullable

2. Shared diff module:
   Create src/shared/metadataDiff.ts.
   Implement pure functions:
   - createComparableProjectState(projectState)
   - diffProjectMetadata(baselineState, targetState, options)
   - diffMembers(...)
   - diffRelationships(...)
   - diffProperties(...)
   - summarizeDiff(...)

   Matching rules:
   - Members match by dimension type + dimension name + member key.
   - Relationships match by dimension + parent + child.
   - Relationship move detection: same child has old parent removed and new parent added.
   - Copy detection: same child gains extra parent without losing old parent.
   - Property updates compare normalized scalar values.
   - Unknown/preserved XML properties should still compare by property name if available.

3. API:
   Add:
   - POST /api/projects/:projectId/baselines
     Supports baseline JSON body first; optionally support XML upload if xmlImport exists.
   - GET /api/projects/:projectId/baselines
   - GET /api/projects/:projectId/baselines/:baselineId
   - POST /api/projects/:projectId/diff
     Body: { baselineId, options }
   - GET /api/projects/:projectId/diff/:diffRunId
   - GET /api/projects/:projectId/diff/:diffRunId/items

4. Baseline creation:
   - Allow baseline from current project snapshot.
   - If XML import exists, allow baseline from XML file.
   - Store normalized baseline JSON so future comparisons are stable.

5. UI:
   Add a "Compare" or "Diff" tab/panel:
   - Select baseline.
   - Create baseline from current project.
   - Run comparison.
   - Show summary counts:
     - member adds/updates/deletes
     - relationship adds/deletes/moves/copies
     - property updates
     - warnings/errors
   - Show a filterable table of diff items.
   - Add basic CSV download of diff items if easy.

6. Validation integration:
   - Diff engine should not replace validation.
   - If current validation has blocking errors, show warning in diff UI but allow diff.
   - Add warnings for high-risk changes:
     - delete member
     - relationship delete
     - move branch
     - change account type
     - change entity ownership/consolidation properties

7. Tests:
   - Unit tests for member add/update/delete.
   - Unit tests for relationship add/delete/move/copy.
   - Unit tests for property changes.
   - Repository/API tests for baseline and diff run persistence.
   - UI markup/view model test for diff summary if feasible.

8. Docs:
   - Update docs/api-reference.md.
   - Update docs/database-architecture.md.
   - Update docs/feature-catalog.md.
   - Update docs/implementation-map.md.
   - Add docs/metadata-diff-guide.md if appropriate and link it from docs/README.md.
   - Update docs/production-readiness-checklist.md.

Acceptance criteria:
- User can create a baseline, run a diff, and view persisted diff items.
- Diff is deterministic and tested.
- No existing import/export/validation workflow breaks.
- Diff module is shared and reusable by future change sets.
- npm.cmd test passes.
- npm.cmd run build passes.
- npm.cmd run docs:check passes.
````

---

# Feature 07 - Relationship load modes

````text
Feature: Add OneStream relationship load modes and relationship operation planning.

Goal:
Support explicit relationship operations for export and release planning:
- additive build
- property update only
- relationship delete only
- move
- copy
- break/build
- full rebuild preview

Why:
Hierarchy changes are high risk. Users need to know whether they are adding, updating, deleting, moving, copying, or rebuilding relationships before they export XML.

Current anchors:
- src/shared/hierarchy.ts
- src/shared/xmlExport.ts
- src/shared/metadataDiff.ts if implemented
- src/server/db/schema.ts
- src/server/db/repositories.ts
- src/server/routes/export.ts
- src/shared/types.ts
- src/client/components/HierarchyTree.tsx
- src/client/components/DimensionWorkspace.tsx
- docs/export-modes.md
- docs/xml-generation-guide.md
- docs/validation-rules.md

Implement:
1. Shared types:
   Add relationship operation type:
   - "add"
   - "update"
   - "delete"
   - "move"
   - "copy"
   - "break"
   - "rebuild"
   - "unchanged"

   Add export load mode:
   - "full"
   - "additive"
   - "propertyUpdate"
   - "relationshipDelete"
   - "moveCopy"
   - "breakBuild"

2. Database:
   Add optional operation metadata support.
   Prefer a real column if simple:
   - operation TEXT nullable
   - operation_source TEXT nullable
   - operation_notes TEXT nullable
   Alternative: store operation in properties_json/details_json for planning only.

3. Shared planning module:
   Create src/shared/relationshipOperations.ts.
   Functions:
   - inferRelationshipOperationsFromDiff(diffItems)
   - planRelationshipLoadMode(projectState, baselineState, mode)
   - detectMovesAndCopies(...)
   - detectBreakBuildImpact(...)
   - summarizeRelationshipPlan(...)
   - findMembersThatBecomeOrphanedAfterRelationshipDeletes(...)

4. Validation:
   Add issue codes:
   - RELATIONSHIP_DELETE_CREATES_ORPHAN
   - BREAK_BUILD_HAS_NO_BASELINE
   - MOVE_WITHOUT_OLD_PARENT
   - COPY_CONFLICTS_WITH_SINGLE_PARENT_POLICY
   - RELATIONSHIP_OPERATION_UNSUPPORTED
   Use blueprint allowMultipleParents when available.

5. XML export:
   Extend GET /api/export/:projectId/xml to accept query:
   - mode=full|additive|propertyUpdate|relationshipDelete|moveCopy|breakBuild
   - baselineId optional
   - dimensionId optional

   Behavior:
   - full: current behavior
   - additive: include adds and updates, no relationship deletes
   - propertyUpdate: include existing members/properties, avoid hierarchy restructure where possible
   - relationshipDelete: emit relationship-delete package structure if currently supported; otherwise deterministic placeholder with clear warning in generated XML comment/report
   - moveCopy: include planned old-parent removal and new-parent add where possible
   - breakBuild: include delete relationships then rebuild target relationships for selected dimension/hierarchy

   If exact OneStream XML delete syntax is not already encoded in the app, create a safe internal representation and document the limitation rather than pretending correctness.

6. API:
   Add:
   - POST /api/projects/:projectId/relationship-plan
     Body: { baselineId, mode, dimensionId }
   - GET /api/export/:projectId/xml?mode=...
   Return summary with warnings/errors.

7. UI:
   Add export mode selector to export modal:
   - Full XML
   - Additive
   - Property update
   - Relationship delete
   - Move/copy
   - Break/build
   Show a pre-export impact summary:
   - relationships added
   - relationships deleted
   - moves
   - copies
   - potential orphans
   - blocking warnings

8. Tests:
   - Unit tests for move/copy inference.
   - Unit tests for orphan impact.
   - API test for relationship-plan endpoint.
   - Export tests for each mode producing deterministic output.
   - Validation tests for single-parent policy conflict and orphan creation.

9. Docs:
   - Update docs/api-reference.md.
   - Update docs/export-modes.md.
   - Update docs/xml-generation-guide.md.
   - Update docs/validation-rules.md.
   - Update docs/dimension-blueprints.md if allowMultipleParents is used.
   - Update docs/feature-catalog.md.

Acceptance criteria:
- User can select a relationship export mode.
- App generates a relationship impact summary before export.
- Dangerous modes produce warnings/errors.
- Existing full XML export remains backward compatible.
- npm.cmd test passes.
- npm.cmd run build passes.
- npm.cmd run docs:check passes.
````

---

# Feature 08 - Change sets and release packages

````text
Feature: Add metadata change sets and release packages.

Goal:
Create a project-ready change-control workflow where users can convert a diff into a named change set, validate it, approve it, and export a release package with XML, reports, and release notes.

Prerequisites:
This feature works best after the baseline diff engine exists. If it does not exist, implement a minimal internal diff abstraction or stop and create a clear TODO plan.

Current anchors:
- src/shared/metadataDiff.ts if implemented
- src/shared/xmlExport.ts
- src/shared/xlsxExport.ts
- src/shared/csvJsonExport.ts
- src/server/routes/export.ts
- src/server/db/schema.ts
- src/server/db/repositories.ts
- src/client/components/ImportExportModals.tsx
- src/client/components/Dashboard.tsx
- src/client/components/DimensionWorkspace.tsx
- src/client/api/client.ts
- docs/export-modes.md
- docs/api-reference.md
- docs/database-architecture.md

Implement:
1. Data model:
   Add tables:
   - change_sets
     - id
     - project_id
     - baseline_id nullable
     - diff_run_id nullable
     - name
     - description
     - status: "draft" | "validated" | "approved" | "exported" | "rejected"
     - target_environment nullable
     - created_by
     - created_at
     - updated_at
   - change_set_items
     - id
     - change_set_id
     - diff_item_id nullable
     - item_type
     - change_type
     - severity
     - dimension_type
     - object_key
     - property_name nullable
     - old_value nullable
     - new_value nullable
     - details_json nullable
   - change_set_approvals
     - id
     - change_set_id
     - action: "approve" | "reject" | "comment"
     - comment
     - created_by
     - created_at
   - release_packages
     - id
     - change_set_id
     - package_name
     - package_path
     - manifest_json
     - created_by
     - created_at

2. Shared release package builder:
   Create src/shared/releasePackage.ts.
   Functions:
   - buildChangeSetFromDiff(diffRun, selectedItemIds)
   - summarizeChangeSet(changeSet)
   - renderReleaseNotesMarkdown(changeSet)
   - renderChangeSetManifest(changeSet)
   - selectXmlExportModeForChangeSet(changeSet, mode)

3. API:
   Add:
   - GET /api/projects/:projectId/change-sets
   - POST /api/projects/:projectId/change-sets
   - GET /api/projects/:projectId/change-sets/:changeSetId
   - PATCH /api/projects/:projectId/change-sets/:changeSetId
   - POST /api/projects/:projectId/change-sets/:changeSetId/validate
   - POST /api/projects/:projectId/change-sets/:changeSetId/approve
   - POST /api/projects/:projectId/change-sets/:changeSetId/reject
   - POST /api/projects/:projectId/change-sets/:changeSetId/package
   - GET /api/projects/:projectId/change-sets/:changeSetId/package

4. Release package output:
   Create a zip or directory under exports directory containing:
   - 01-summary.md
   - 02-change-set.json
   - 03-diff-report.csv
   - 04-validation-report.csv
   - 05-metadata.xml
   - 06-rollback-notes.md if rollback XML cannot yet be generated
   - manifest.json

   If zip support is not available, create a directory and stream the manifest or main package file. Prefer adding a small zip dependency only if acceptable in the repo.

5. Validation:
   - A change set can be validated by re-running project validation and summarizing issues.
   - Do not mark approved if blocking validation errors exist unless a bypass flag is explicitly passed and recorded.
   - Record audit logs for create, validate, approve, reject, export package.

6. UI:
   Add a "Change Sets" panel:
   - List change sets by status.
   - Create change set from latest diff run.
   - View item summary.
   - Validate.
   - Approve/reject with comment.
   - Export package.
   Keep the UI simple but usable.

7. Export behavior:
   - Initial implementation can export full current XML plus reports.
   - If relationship load modes already exist, allow package mode selection:
     - full
     - additive
     - propertyUpdate
     - relationshipDelete
     - breakBuild
   - Document limitations clearly.

8. Tests:
   - Repository tests for change set persistence.
   - API tests for lifecycle.
   - Unit tests for release notes and manifest rendering.
   - Export/package tests verifying files are produced.
   - Validation gating tests.

9. Docs:
   - Update docs/api-reference.md.
   - Update docs/export-modes.md.
   - Update docs/database-architecture.md.
   - Update docs/feature-catalog.md.
   - Update docs/production-readiness-checklist.md.
   - Add docs/change-set-guide.md and link it from docs/README.md if useful.

Acceptance criteria:
- User can create, validate, approve/reject, and package a change set.
- Package contains human-readable release notes and machine-readable manifest.
- Audit logs record lifecycle actions.
- Existing export endpoints still work.
- npm.cmd test passes.
- npm.cmd run build passes.
- npm.cmd run docs:check passes.
````

---

# Feature 09 - Bulk update wizard

````text
Feature: Add safe bulk update wizard for members and relationships.

Goal:
Let users safely update many member or relationship properties at once with filters, preview, validation, audit logging, and rollback data.

Use cases:
- Set Text1-Text8 across thousands of UD members.
- Update display/read security groups.
- Fill missing descriptions.
- Replace text fragments in aliases/descriptions.
- Set aggregation weight for a filtered set of relationships.
- Copy one property into another.
- Map updates from a small CSV.

Current anchors:
- src/client/components/EditableGrid.tsx
- src/client/components/DimensionWorkspace.tsx
- src/server/routes/projects.ts
- src/server/db/repositories.ts
- src/shared/types.ts
- src/shared/validationEngine.ts
- src/client/api/client.ts
- docs/api-reference.md
- docs/feature-catalog.md

Implement:
1. Shared bulk update module:
   Create src/shared/bulkUpdate.ts.
   Define:
   - BulkUpdateTarget: "member" | "relationship"
   - BulkUpdateOperation:
     - "set"
     - "clear"
     - "replaceText"
     - "append"
     - "prepend"
     - "copyFromProperty"
     - "deriveFromParent"
     - "regexReplace"
   - BulkUpdateFilter:
     - dimensionId
     - target type
     - property filters
     - member key contains/startsWith/regex
     - parent/child filters for relationships
     - active only
   - BulkUpdatePreviewItem:
     - targetId
     - targetKey
     - propertyName
     - oldValue
     - newValue
     - warnings

2. Preview engine:
   Implement pure function:
   - previewBulkUpdate(projectState, request)
   It should not write data.
   It returns affected count, skipped count, preview items, warnings.

3. Apply engine:
   Server-side apply should:
   - Recompute preview server-side.
   - Apply changes in one repository transaction.
   - Store audit logs.
   - Store rollback JSON.

4. Database:
   Add:
   - bulk_update_jobs
     - id
     - project_id
     - target_type
     - operation
     - request_json
     - summary_json
     - rollback_json
     - status
     - created_by
     - created_at
   - bulk_update_items
     - id
     - job_id
     - target_id
     - target_key
     - property_name
     - old_value
     - new_value
     - status
     - message

5. API:
   Add:
   - POST /api/projects/:projectId/bulk-updates/preview
   - POST /api/projects/:projectId/bulk-updates/apply
   - GET /api/projects/:projectId/bulk-updates
   - GET /api/projects/:projectId/bulk-updates/:jobId
   Optional:
   - POST /api/projects/:projectId/bulk-updates/:jobId/rollback

6. CSV mapping:
   If practical in this pass, allow CSV upload for mapping:
   - key column
   - property columns
   Otherwise add a clear TODO and do not claim support in UI/docs.

7. UI:
   Add "Bulk Update" button/panel in DimensionWorkspace.
   Wizard steps:
   - Select target: members or relationships.
   - Define filters.
   - Choose operation and property.
   - Preview results.
   - Confirm apply.
   - Show job summary.
   Keep initial UI functional over beautiful.

8. Validation integration:
   After apply, optionally run validation or show "Run Validation" call-to-action.
   For preview, run lightweight dictionary/type validation on new values if dictionary exists.

9. Tests:
   - Unit preview tests for set/clear/replace/copy.
   - API preview/apply tests.
   - Repository tests for job and item persistence.
   - Transaction test proving partial failures do not partially update.
   - UI markup/view model test for wizard basics.

10. Docs:
   - Update docs/api-reference.md.
   - Update docs/database-architecture.md.
   - Update docs/feature-catalog.md.
   - Update docs/testing-strategy.md.
   - Add docs/bulk-update-guide.md if useful.

Acceptance criteria:
- Preview shows exact old/new values before applying.
- Apply is transactional.
- Audit log and rollback data are stored.
- Existing member/relationship editing still works.
- npm.cmd test passes.
- npm.cmd run build passes.
- npm.cmd run docs:check passes.
````

---

# Feature 10 - Levelized hierarchy export and hierarchy analytics

````text
Feature: Add levelized hierarchy export and hierarchy analytics.

Goal:
Give users business-friendly hierarchy outputs:
- levelized Excel/CSV export
- path export
- parent-child export
- shared member report
- orphan report
- depth analysis
- leaf/parent classification
- branch impact summaries

Current anchors:
- src/shared/hierarchy.ts
- src/client/components/HierarchyTree.tsx
- src/shared/csvJsonExport.ts
- src/shared/xlsxExport.ts
- src/server/routes/export.ts
- src/server/routes/projects.ts
- src/client/api/client.ts
- docs/export-modes.md
- docs/feature-catalog.md

Implement:
1. Shared analytics module:
   Create or extend src/shared/hierarchyAnalytics.ts.
   Functions:
   - buildHierarchyPaths(dimension, members, relationships)
   - buildLevelizedRows(...)
   - classifyMembersAsLeafOrParent(...)
   - findSharedMembers(...)
   - findOrphanMembers(...)
   - calculateHierarchyDepthStats(...)
   - buildParentChildRows(...)
   - summarizeHierarchyHealth(...)

2. Levelized output shape:
   For each leaf/path:
   - dimensionType
   - dimensionName
   - path
   - level0
   - level1
   - level2
   - dynamic extra level columns based on max hierarchy depth
   - memberKey
   - description
   - isLeaf
   - parentCount
   - aggregationWeight if applicable

3. API:
   Add:
   - GET /api/projects/:projectId/dimensions/:dimensionId/hierarchy/analytics
   - GET /api/projects/:projectId/dimensions/:dimensionId/hierarchy/levelized.csv
   - GET /api/projects/:projectId/dimensions/:dimensionId/hierarchy/paths.csv
   - GET /api/projects/:projectId/dimensions/:dimensionId/hierarchy/parent-child.csv
   Optional:
   - GET /api/export/:projectId/hierarchy-analytics.xlsx

4. UI:
   Add a hierarchy analytics panel near hierarchy tree:
   - Max depth
   - Member count
   - Relationship count
   - Orphan count
   - Shared member count
   - Leaf count
   - Parent count
   Buttons:
   - Export levelized CSV
   - Export paths CSV
   - Export parent-child CSV
   - Export shared/orphan report if simple

5. Cycle handling:
   If hierarchy has cycles, analytics must not infinite loop.
   Return warning rows/issues and stop traversal safely.

6. Tests:
   - Unit tests for levelized hierarchy rows.
   - Unit tests for shared member detection.
   - Unit tests for orphan detection.
   - Unit test for cycle-safe traversal.
   - API tests for analytics and CSV endpoints.
   - Export tests for deterministic column order.

7. Docs:
   - Update docs/api-reference.md.
   - Update docs/export-modes.md.
   - Update docs/feature-catalog.md.
   - Update docs/implementation-map.md.
   - Update docs/validation-rules.md only if new issue behavior is added.

Acceptance criteria:
- Users can export levelized hierarchy rows.
- Analytics are cycle-safe.
- Existing hierarchy visualization still works.
- CSV headers are deterministic.
- npm.cmd test passes.
- npm.cmd run build passes.
- npm.cmd run docs:check passes.
````

---

# Feature 11 - Blueprint Studio

````text
Feature: Add Blueprint Studio for visual blueprint authoring and validation.

Goal:
Let admins create, edit, validate, preview, import, and export dimension blueprints without manually editing YAML. The output should remain compatible with config/dimbuilder.yaml and the existing projectBlueprints.ts behavior.

Current anchors:
- config/dimbuilder.yaml
- src/shared/appConfigTypes.ts
- src/shared/appConfigDefaults.ts
- src/shared/appConfigValidation.ts
- src/server/projectBlueprints.ts
- src/server/routes/projects.ts
- src/client/components/ImportExportModals.tsx
- src/client/components/AppShell.tsx
- docs/dimension-blueprints.md
- docs/configuration-guide.md

Implement:
1. Shared blueprint module:
   Create src/shared/blueprintStudio.ts or extend existing config modules.
   Functions:
   - validateBlueprintDraft(dimensionType, draft)
   - normalizeBlueprintDraft(draft)
   - blueprintToYamlFragment(dimensionType, blueprint)
   - blueprintFromProjectDimension(dimension, members, relationships)
   - compareBlueprints(oldBlueprint, newBlueprint)
   Reuse existing validation logic where possible.

2. API:
   Because config/dimbuilder.yaml may be source-controlled and not always writable, implement safe endpoints:
   - GET /api/blueprints
     Returns effective current blueprints from loaded config.
   - POST /api/blueprints/validate
     Validates a draft.
   - POST /api/projects/:projectId/dimensions/:dimensionId/blueprint
     Generates blueprint draft from an existing dimension.
   - POST /api/blueprints/yaml
     Returns YAML fragment for a validated draft.

   Do not write to config/dimbuilder.yaml automatically unless config explicitly allows it.

   Optional config:
   - features.blueprintStudio.enabled default true
   - features.blueprintStudio.allowConfigWrite default false

3. UI:
   Add "Blueprint Studio" view or modal.
   Capabilities:
   - Select dimension type.
   - View current effective blueprint.
   - Edit:
     - defaultDimensionName
     - rootMembers
     - memberKeyField
     - relationshipDefaults
     - allowMultipleParents
     - seeded members
     - seeded relationships
   - Validate draft.
   - Preview YAML.
   - Copy YAML.
   - Generate from current project dimension.

   Minimum viable UI can be form + editable JSON/YAML text area with validation summary.

4. Project creation integration:
   Existing blank project creation must remain unchanged.
   Optionally allow user to create a project from a pasted/temporary blueprint set without altering config, but only if scope remains manageable.

5. Tests:
   - Unit tests for blueprint draft validation.
   - Unit tests for YAML fragment generation.
   - API tests for list/validate/generate.
   - UI markup tests for Blueprint Studio basic render.

6. Docs:
   - Update docs/api-reference.md.
   - Update docs/dimension-blueprints.md.
   - Update docs/configuration-guide.md.
   - Update docs/feature-catalog.md.
   - Update docs/decisions.md with note that YAML remains source of truth and Studio is an authoring aid.
   - Update docs/implementation-map.md.

Acceptance criteria:
- Users can view current blueprints and generate validated YAML fragments.
- App does not silently mutate config files.
- Existing config validation remains authoritative.
- Existing blank project creation remains intact.
- npm.cmd test passes.
- npm.cmd run build passes.
- npm.cmd run docs:check passes.
````

---

# Feature 12 - ACM-compatible export mode

````text
Feature: Add ACM-compatible metadata import workbook export.

Goal:
Add an export mode that produces a OneStream ACM-friendly metadata workbook with Tree and Members-style sheets, deterministic headers, source sort order, shared-member row expansion, and validation notes.

Important:
Do not replace the existing XLSX export. Add a separate ACM export mode.

Current anchors:
- src/shared/xlsxExport.ts
- src/server/routes/export.ts
- src/client/components/ImportExportModals.tsx
- src/client/api/client.ts
- src/shared/types.ts
- src/shared/hierarchy.ts
- src/shared/oneStreamPropertyDictionary.ts if implemented
- docs/export-modes.md
- docs/api-reference.md

Implement:
1. Shared ACM export module:
   Create src/shared/acmExport.ts.
   It should generate workbook buffers/files using the same XLSX library currently used by xlsxExport.ts.

2. Workbook structure:
   Add sheets:
   - README or Instructions
   - Tree
   - Members
   - Validation Report
   - Export Manifest

   Minimum columns:
   Tree:
   - Dimension Type
   - Dimension Name
   - Parent
   - Child
   - Sort Order
   - Aggregation Weight
   - Percent Consol
   - Percent Ownership
   - Ownership Type
   - Operation if relationship operations exist

   Members:
   - Dimension Type
   - Dimension Name
   - Member
   - Description
   - Alias
   - Account Type / Scenario Type / Flow Type etc. where applicable
   - Text1-Text8
   - Display Group
   - Read Group
   - other dictionary-supported properties

   Validation Report:
   - severity
   - code
   - message
   - dimension
   - member/relationship key

   Manifest:
   - project name
   - generated at
   - app name
   - OneStream fallback version
   - export options

3. Config:
   Add export.acm.enabled default true or false depending existing feature flag style.
   Add export.acm.creator if useful.

4. API:
   Add:
   - GET /api/export/:projectId/acm.xlsx
   Optional query:
   - includeValidationReport=true
   - retainSourceOrder=true
   - expandSharedMembers=true

5. Export behavior:
   - Use row_order/source_row_number for sort order where available.
   - Avoid sort order 0; warn/fill deterministic 1-based order if missing.
   - Shared members should appear as separate Tree rows.
   - Varying properties, if implemented, should expand as separate rows or add context columns:
     - Cube Type
     - Scenario Type
     - Time
   - Unknown properties should either be included in extra columns or listed in Manifest/Validation Report.

6. UI:
   Add ACM export option in export modal.
   If validation has blocking errors, respect server-side export blocking if implemented.
   Show short description:
   "Exports an ACM-oriented workbook for metadata review/import preparation."

7. Tests:
   - Unit test workbook contains required sheets.
   - Unit test Tree and Members rows for a sample project.
   - Test shared member expansion.
   - API route test streams XLSX.
   - Config validation test for export.acm.

8. Docs:
   - Update docs/api-reference.md.
   - Update docs/export-modes.md.
   - Update docs/configuration-guide.md.
   - Update docs/feature-catalog.md.
   - Update docs/production-readiness-checklist.md if this affects release process.

Acceptance criteria:
- Existing XLSX export still works unchanged.
- New ACM XLSX endpoint returns a workbook with Tree, Members, Validation Report, and Manifest sheets.
- Export is deterministic and tested.
- npm.cmd test passes.
- npm.cmd run build passes.
- npm.cmd run docs:check passes.
````

---

# Feature 13 - Varying-property engine

````text
Feature: Add first-class varying-property support for OneStream metadata.

Goal:
Add a durable model and UI/API foundation for properties that vary by cube type, scenario type, and/or time. Do not try to model every OneStream property perfectly in one pass. Build the infrastructure so future property definitions can opt into varying behavior.

Why:
OneStream projects often require properties that are not single flat values. SR Onestream Dim Builder should support default property values plus overrides by cube type, scenario type, time member, or combinations.

Current anchors:
- src/server/db/schema.ts
- src/server/db/repositories.ts
- src/shared/types.ts
- src/shared/oneStreamPropertyDictionary.ts if already implemented
- src/shared/xmlExport.ts
- src/shared/validationEngine.ts
- src/client/api/client.ts
- src/client/components/DimensionWorkspace.tsx
- src/client/components/MetadataEditor.tsx
- src/client/components/EditableGrid.tsx
- docs/database-architecture.md
- docs/xml-generation-guide.md
- docs/validation-rules.md

Implement:
1. Database:
   Add a table such as metadata_property_values or varying_property_values:
   - id
   - project_id
   - dimension_id
   - target_type: "dimension" | "member" | "relationship"
   - target_id
   - property_name
   - value
   - cube_type nullable
   - scenario_type nullable
   - time_member nullable
   - is_default integer boolean
   - source nullable
   - metadata_json nullable
   - created_at
   - updated_at

   Indexes:
   - by project_id
   - by dimension_id
   - by target_type + target_id
   - by property_name

   Add a unique-ish constraint or validation preventing duplicate same target/property/cube/scenario/time combination.

2. Shared types:
   Add VaryingPropertyValue type and request/response types.

3. Repository:
   Add methods:
   - listVaryingPropertyValues(projectId, filters)
   - listVaryingPropertyValuesForTarget(projectId, targetType, targetId)
   - upsertVaryingPropertyValue(...)
   - deleteVaryingPropertyValue(...)
   - replaceVaryingPropertyValuesForTarget(...)
   - getEffectivePropertyValue(baseValue, varyingValues, context)

   Ensure all write methods go through repositories.ts.

4. API:
   Add endpoints:
   - GET /api/projects/:projectId/varying-properties?dimensionId=&targetType=&targetId=
   - POST /api/projects/:projectId/varying-properties
   - PATCH /api/projects/:projectId/varying-properties/:valueId
   - DELETE /api/projects/:projectId/varying-properties/:valueId

   Request body should support targetType, targetId, propertyName, value, cubeType, scenarioType, timeMember, isDefault.

5. Validation:
   Add issue codes:
   - DUPLICATE_VARYING_PROPERTY
   - UNKNOWN_VARYING_PROPERTY
   - NON_VARYING_PROPERTY_OVERRIDE
   - VARYING_PROPERTY_TARGET_NOT_FOUND
   - INVALID_VARYING_PROPERTY_VALUE

   Rules:
   - target must exist.
   - property must be known if dictionary exists; unknown should be warning by default.
   - if dictionary says supportsVarying false, warn if an override exists.
   - prevent duplicates for same target/property/context combination.
   - type and enum validation should use dictionary.

6. XML export:
   - Do not break existing XML output.
   - If a property has varying values, render them in a deterministic structure compatible with the current xmlExport abstraction.
   - If exact OneStream XML shape is not fully known, implement a conservative extension:
     - keep base member/relationship property as today
     - emit varying properties as property nodes with explicit context attributes, for example cubeType, scenarioType, timeMember
   - Add TODO comments only where exact OneStream-specific mapping needs future confirmation.
   - Preserve unknown properties.

7. UI:
   Add a basic Varying Properties panel:
   - Accessible from a dimension workspace tab or side panel.
   - User can pick target type, target record, property, cube type, scenario type, time member, value.
   - Show rows in a simple grid.
   - Support add/edit/delete.
   - Show default vs override badges.
   Keep this pragmatic and testable.

8. Client API:
   Add methods to src/client/api/client.ts.
   Update state store minimally.

9. Tests:
   - Database/repository tests for CRUD and duplicate behavior.
   - API tests for list/create/update/delete.
   - Validation tests for duplicate, unknown, target-not-found, type/enum.
   - XML export snapshot/unit test for deterministic output.
   - UI markup test if a new component is added.

10. Docs:
   - Update docs/api-reference.md.
   - Update docs/database-architecture.md.
   - Update docs/xml-generation-guide.md.
   - Update docs/validation-rules.md.
   - Update docs/feature-catalog.md.
   - Update docs/implementation-map.md.
   - Update docs/production-readiness-checklist.md if relevant.

Acceptance criteria:
- Existing flat property workflows continue working.
- Varying property CRUD works through API and UI.
- Validation catches duplicate varying contexts.
- XML export remains deterministic.
- npm.cmd test passes.
- npm.cmd run build passes.
- npm.cmd run docs:check passes.
````

---

# Feature 14 - Extensible and inherited dimension support

````text
Feature: Add extensible/inherited dimension modeling support.

Goal:
Help users model OneStream inherited and extensible dimensionality by tracking inherited dimensions, multiple-parent policies, shared base members, and cube-aware dimension usage.

Current anchors:
- src/server/db/schema.ts
- dimensions.inherited_dimension column
- src/shared/types.ts
- src/shared/dimensionSchemas.ts
- src/server/projectBlueprints.ts
- config/dimbuilder.yaml
- src/client/components/MetadataEditor.tsx
- src/client/components/DimensionWorkspace.tsx
- src/shared/validationEngine.ts
- src/shared/hierarchy.ts
- docs/database-architecture.md
- docs/dimension-blueprints.md

Implement:
1. Domain model:
   Extend dimension metadata to support:
   - inheritedDimension
   - extensibilityMode: "standard" | "inherited" | "extended" | "shared"
   - parentDimensionName nullable
   - cubeName nullable or cubeUsage list in metadata_json
   - allowMultipleParents from blueprint/config

2. Database:
   Use existing inherited_dimension column where possible.
   Add fields only if necessary:
   - extensibility_mode TEXT nullable
   - cube_usage_json TEXT nullable
   Or store in metadata_json if project conventions prefer avoiding schema expansion.

3. Shared extensibility module:
   Create src/shared/extensibility.ts.
   Functions:
   - getDimensionExtensibilityInfo(dimension)
   - findInheritedDimensionLinks(dimensions)
   - validateExtensibleDimensionSetup(projectState)
   - findSharedBaseMembersAcrossDimensions(...)
   - summarizeExtensibility(...)
   - checkParentConformance(...)

4. Validation:
   Add issue codes:
   - INHERITED_DIMENSION_NOT_FOUND
   - EXTENSIBLE_PARENT_DIMENSION_MISSING
   - EXTENSIBLE_PARENT_CONFORMANCE_WARNING
   - SHARED_BASE_MEMBER_CONFLICT
   - CUBE_USAGE_MISSING
   - MULTIPLE_PARENT_POLICY_VIOLATION

   Rules:
   - inheritedDimension must reference an existing dimension name/type where applicable.
   - if extensibilityMode is inherited/extended, required metadata should exist.
   - if allowMultipleParents false, shared usage should be error/warning.
   - Warn if same base member appears in conflicting structures.

5. UI:
   Enhance MetadataEditor:
   - Show inherited dimension field clearly.
   - Add extensibility mode dropdown.
   - Add cube usage metadata field if implemented.

   Add Extensibility panel:
   - Shows linked dimensions.
   - Shows inherited/extended status.
   - Shows shared base member warnings.
   - Shows conformance summary.

6. Project creation:
   Ensure blueprint can seed inheritedDimension and extensibility metadata.
   Update blueprint validation to accept new optional fields:
   - inheritedDimension
   - extensibilityMode
   - cubeUsage
   Keep backward compatibility.

7. Export:
   Ensure inheritedDim dimension attribute continues to export correctly.
   Include new source/cube metadata only if XML export already has a supported mapping; otherwise keep in metadata_json and reports.

8. Tests:
   - Config/blueprint validation tests for new fields.
   - Validation tests for missing inherited dimension.
   - Extensibility module unit tests.
   - XML export test for inheritedDim.
   - UI/view model test for metadata editor fields if feasible.

9. Docs:
   - Update docs/dimension-blueprints.md.
   - Update docs/database-architecture.md.
   - Update docs/xml-generation-guide.md.
   - Update docs/validation-rules.md.
   - Update docs/feature-catalog.md.
   - Update docs/configuration-guide.md.

Acceptance criteria:
- Inherited dimension data is editable, validated, and exported where supported.
- Blueprint-created projects can seed extensibility metadata.
- Validation flags missing inherited dimension references.
- Existing dimensions without extensibility metadata still work.
- npm.cmd test passes.
- npm.cmd run build passes.
- npm.cmd run docs:check passes.
````

---

# Feature 15 - Project readiness dashboard

````text
Feature: Add OneStream project readiness dashboard.

Goal:
Create a dashboard that tells users whether a metadata project is ready for export, review, and OneStream load preparation.

Current anchors:
- GET /api/projects/:projectId/summary
- src/server/routes/projects.ts
- src/client/components/Dashboard.tsx
- src/client/ui/viewModel.ts
- src/shared/validationEngine.ts
- src/shared/hierarchy.ts
- src/shared/hierarchyAnalytics.ts if implemented
- docs/api-reference.md
- docs/feature-catalog.md

Implement:
1. Shared readiness module:
   Create src/shared/projectReadiness.ts.
   Compute:
   - completeness score
   - validation score
   - hierarchy health score
   - export readiness
   - change readiness if diff/change sets exist
   - production readiness hints based on config/features

   Return:
   - score 0-100
   - status: "ready" | "needs_attention" | "blocked"
   - sections with counts and messages

2. Readiness checks:
   Completeness:
   - enabled dimensions exist
   - root members exist
   - required fields populated
   - member count > 0 for configured dimensions

   Validation:
   - blocking issues count
   - warnings count

   Hierarchy:
   - cycle count
   - orphan count
   - duplicate relationship count
   - shared member count

   Export:
   - XML export enabled
   - server-side export blocking status if implemented
   - last validation run exists if required by config

   Change readiness:
   - baseline selected if diff/change sets exist
   - latest diff has unresolved high-risk items

   Operational:
   - local mode warning if shared deployment config detected
   - no auth/migration warning if still absent

3. API:
   Add or extend:
   - GET /api/projects/:projectId/readiness
   Prefer a separate endpoint to avoid breaking current summary.

4. UI:
   Update Dashboard:
   - Add readiness scorecard.
   - Show section cards:
     - Completeness
     - Validation
     - Hierarchy
     - Export
     - Change Control
     - Production Hardening
   - Each section has status, count, and call-to-action:
     - Run validation
     - View issues
     - Open hierarchy
     - Export XML
     - Create baseline
   Keep existing dashboard counts.

5. Tests:
   - Unit tests for readiness scoring.
   - API route test.
   - UI/view model test for status labels.
   - Edge cases:
     - no project data
     - blocking validation errors
     - no validation run
     - cycles/orphans

6. Docs:
   - Update docs/api-reference.md.
   - Update docs/feature-catalog.md.
   - Update docs/implementation-map.md.
   - Update docs/production-readiness-checklist.md.

Acceptance criteria:
- Project dashboard shows actionable readiness state.
- Readiness logic is shared and tested.
- Existing summary endpoint remains compatible.
- npm.cmd test passes.
- npm.cmd run build passes.
- npm.cmd run docs:check passes.
````

---

# Feature 16 - Authentication, authorization, and project ownership

````text
Feature: Add authentication, project-aware authorization, and ownership model.

Goal:
Prepare SR Onestream Dim Builder for shared deployment by replacing fixed local-admin behavior with real authenticated user identity, project ownership, and role-based permissions.

Current posture:
The app is local-first and not yet hardened as a multi-user production service. This feature should preserve local mode while adding optional shared-service security.

Current anchors:
- src/server/app.ts
- src/server/routes/*.ts
- src/server/db/schema.ts
- src/server/db/repositories.ts
- src/shared/appConfigTypes.ts
- src/shared/appConfigDefaults.ts
- src/shared/appConfigValidation.ts
- src/client/api/client.ts
- src/client/components/AppShell.tsx
- docs/security-model.md
- docs/deployment-guide.md
- docs/production-readiness-checklist.md

Implement:
1. Config:
   Add security config:
   - security.mode: "local" | "password"
   - security.localUserId default "local-admin"
   - security.sessionSecretEnvVar optional
   - security.allowedOrigins string[]
   - security.csrfProtectionEnabled boolean default false for local mode
   - security.requireAuthForApi boolean default false in local mode, true in password mode
   Validate config.

2. Database:
   Existing users, roles, user_roles tables are reserved.
   Extend if needed:
   - project_users
     - project_id
     - user_id
     - role: "owner" | "editor" | "viewer" | "approver"
   Ensure projects.created_by stores authenticated user id.

3. Auth middleware:
   Create src/server/auth.ts.
   Local mode:
   - Behaves like today, user id = configured localUserId.

   Password mode:
   - Implement simple username/password auth only if acceptable and secure enough for initial shared deployment.
   - Hash passwords using a safe library.
   - Use secure cookie session or signed token.
   If full auth is too big, implement middleware interfaces and local mode plus clear TODO for external auth, but do not pretend password auth exists.

4. Authorization:
   Create src/server/authorization.ts.
   Permission checks:
   - viewer: read project/diff/export reports
   - editor: create/edit/import/validate/export
   - approver: approve change sets
   - owner: manage project users/delete project

   Apply to routes:
   - project read/list
   - project create
   - member/relationship edits
   - import
   - validation
   - export
   - snapshots
   - change sets if present

5. API:
   Add:
   - GET /api/auth/me
   - POST /api/auth/login if password mode
   - POST /api/auth/logout if password mode
   - GET /api/projects/:projectId/users
   - POST /api/projects/:projectId/users
   - PATCH /api/projects/:projectId/users/:userId
   - DELETE /api/projects/:projectId/users/:userId

6. CORS/CSRF:
   - Restrict CORS origins based on config.
   - In local mode, preserve simple dev experience.
   - Add CSRF guard if enabled and cookie-based auth is implemented.

7. Audit logs:
   - Replace hardcoded local-admin in routes with req.user.id.
   - Ensure audit entries include authenticated identity.

8. UI:
   - Add current user display.
   - Add login page only if password mode implemented.
   - Add project users management panel for owner.
   - Hide/disable actions based on permissions.
   - Keep local mode frictionless.

9. Tests:
   - Auth middleware local mode test.
   - Authorization tests for viewer/editor/owner.
   - API tests for protected route denied/allowed.
   - Audit log identity test.
   - Config validation tests.
   - CORS config test if practical.

10. Docs:
   - Update docs/security-model.md.
   - Update docs/deployment-guide.md.
   - Update docs/production-readiness-checklist.md.
   - Update docs/api-reference.md.
   - Update docs/database-architecture.md.
   - Update docs/configuration-guide.md.
   - Update docs/current-state-baseline.md to remove/adjust no-auth gap.

Acceptance criteria:
- Local mode still works with no login friction.
- Shared mode can require authenticated identity or at minimum has middleware/authorization foundation clearly implemented.
- Hardcoded local-admin is removed from route actions except as local-mode configured user.
- Project permissions are enforced server-side.
- npm.cmd test passes.
- npm.cmd run build passes.
- npm.cmd run docs:check passes.
````

---

# Feature 17 - Database migrations and operational hardening

````text
Feature: Add database migration framework and operational hardening basics.

Goal:
Introduce safe, repeatable schema migrations and basic operational checks so future features can evolve the SQLite schema without risky ad hoc changes.

Current anchors:
- src/server/db/schema.ts
- src/server/db/database.ts
- src/server/db/repositories.ts
- src/server/index.ts
- src/server/app.ts
- docs/database-architecture.md
- docs/deployment-guide.md
- docs/production-readiness-checklist.md

Implement:
1. Migration table:
   Add schema_migrations:
   - id
   - name
   - applied_at
   - checksum optional

2. Migration runner:
   Create src/server/db/migrations.ts.
   Requirements:
   - Runs synchronously on startup before routes serve requests.
   - Uses better-sqlite3 transaction.
   - Applies only unapplied migrations.
   - Records applied migrations.
   - Fails startup on migration error.
   - Supports idempotent safe migration style for SQLite.
   - Does not break existing dev databases.

3. Refactor schema initialization:
   Current schema.ts likely creates tables directly.
   Keep initial bootstrap safe:
   - New database gets full schema.
   - Existing database gets migrations.
   - Avoid duplicate table/column errors.
   Add helpers:
   - tableExists
   - columnExists
   - indexExists

4. Backup before migration:
   Add config:
   - database.backupBeforeMigration default true
   - database.backupDirectory default data/backups

   On startup, if migrations are pending and backup enabled:
   - copy data/app.db to timestamped backup before applying migrations.
   - log backup path.

5. Health check:
   Extend /api/health:
   - ok true
   - database ok
   - migration status
   - app version if available
   Keep /api/health client-safe.

6. Structured logging:
   Add minimal logger module:
   - src/server/logger.ts
   - levels: info, warn, error
   Replace scattered console logs in touched areas only.
   Do not over-refactor the entire app.

7. Tests:
   - Migration runner applies migration once.
   - Migration runner records applied migrations.
   - Existing DB simulation gets new column/table.
   - Backup function test if filesystem testing is available.
   - Health endpoint test includes database status.

8. Docs:
   - Update docs/database-architecture.md.
   - Update docs/deployment-guide.md.
   - Update docs/production-readiness-checklist.md.
   - Update docs/api-reference.md for enhanced health response.
   - Update docs/current-state-baseline.md to remove no migration gap if fully implemented.

Acceptance criteria:
- New DB initializes correctly.
- Existing DB migrates safely.
- Migration runner is tested.
- Backup-before-migration works or is clearly disabled by config.
- Health check reports DB/migration status.
- npm.cmd test passes.
- npm.cmd run build passes.
- npm.cmd run docs:check passes.
````

---

# Feature 18 - Formula, member filter, and property helper tools

````text
Feature: Add formula, member filter, and property helper tools.

Goal:
Help OneStream builders author metadata-related formulas, member filters, and property lookups using the current project metadata.

Current anchors:
- src/client/components/DimensionWorkspace.tsx
- src/client/components/MetadataEditor.tsx
- src/client/components/EditableGrid.tsx
- src/shared/text.ts
- src/shared/hierarchy.ts
- src/shared/oneStreamPropertyDictionary.ts if implemented
- src/shared/validationEngine.ts
- docs/feature-catalog.md

Implement:
1. Shared helper module:
   Create src/shared/oneStreamHelpers.ts.
   Functions:
   - escapeFormulaText(value)
   - escapeXmlPropertyValue(value)
   - buildMemberFilterExamples(dimensionType, memberKey)
   - buildXFGetMemberPropertyExample(dimensionType, memberKey, propertyName, context)
   - buildXFGetRelationshipPropertyExample(dimensionType, parentKey, childKey, propertyName, context)
   - findFormulaReferences(text, members)
   - validateFormulaTextLightweight(text)

2. UI:
   Add Helper panel in DimensionWorkspace.
   Tabs:
   - Property Lookup
   - Member Filter Builder
   - Formula Helper

   Property Lookup:
   - Select member or relationship.
   - Select property.
   - Generate example lookup formula/text.

   Member Filter Builder:
   - Select dimension/member.
   - Generate common filter examples:
     - member only
     - children
     - descendants
     - base descendants

   Formula Helper:
   - Text area.
   - Show XML escaping preview.
   - Show detected member references.
   - Warn on formula error values or suspicious unescaped quotes.

3. Integration:
   - Add "Open helper" action from member/relationship grid row if simple.
   - Add copy-to-clipboard buttons.

4. Validation:
   Add optional lightweight issue/warning if formulas contain Excel error values or XML-invalid characters.
   Reuse existing issue codes where possible.

5. Tests:
   - Unit tests for helper string generation.
   - Unit tests for formula reference detection.
   - UI markup test for helper panel.

6. Docs:
   - Update docs/feature-catalog.md.
   - Update docs/validation-rules.md if new validation behavior added.
   - Update docs/implementation-map.md.

Acceptance criteria:
- Users can generate useful member/property helper strings from current metadata.
- No server dependency required unless current project data must be fetched.
- Existing editing/export remains unchanged.
- npm.cmd test passes.
- npm.cmd run build passes.
- npm.cmd run docs:check passes.
````

---

# Feature 19 - UD Attribute design assistant

````text
Feature: Add UD Attribute design assistant and performance guardrails.

Goal:
Help users configure and review UD attribute member patterns with design validation and performance warnings.

Current anchors:
- src/shared/dimensionSchemas.ts
- src/shared/oneStreamPropertyDictionary.ts if implemented
- src/shared/validationEngine.ts
- src/client/components/DimensionWorkspace.tsx
- src/client/components/MetadataEditor.tsx
- src/client/components/EditableGrid.tsx
- docs/validation-rules.md
- docs/feature-catalog.md

Implement:
1. Shared module:
   Create src/shared/udAttributeAssistant.ts.
   Types:
   - UdAttributeDesign
   - UdAttributeAnalysis
   Functions:
   - detectUdAttributeMembers(dimension, members)
   - analyzeUdAttributeDesign(projectState, dimensionId)
   - estimateAttributeIntersectionRisk(...)
   - validateUdAttributeMember(...)
   - summarizeUdAttributeUsage(...)

2. Property dictionary:
   Add or use UD-related properties:
   - Is Attribute Member
   - Related Dimension Type
   - Source Property
   - Comparison Text
   - Allow Input
   - Text1-Text8
   Use actual existing app field names where available.

3. Validation:
   Add issue codes:
   - UD_ATTRIBUTE_RELATED_DIMENSION_MISSING
   - UD_ATTRIBUTE_SOURCE_PROPERTY_MISSING
   - UD_ATTRIBUTE_COMPARISON_TEXT_MISSING
   - UD_ATTRIBUTE_ALLOW_INPUT_WARNING
   - UD_ATTRIBUTE_COUNT_PERFORMANCE_WARNING
   - UD_ATTRIBUTE_SOURCE_PROPERTY_UNKNOWN

   Default performance warning threshold configurable:
   - validation.oneStreamProfile.udAttributeCountWarningThreshold default 2000

4. UI:
   Add "UD Attribute Assistant" panel visible for UD1-UD8 dimensions.
   Show:
   - detected attribute members
   - related dimension/source property/comparison text
   - count and warning threshold
   - missing configuration warnings
   - impacted source dimensions/properties
   Allow editing relevant properties through existing member update API.

5. API:
   Add:
   - GET /api/projects/:projectId/dimensions/:dimensionId/ud-attributes/analysis
   Or compute client-side if all data is already loaded. Prefer server endpoint if dimensions can be large.

6. Tests:
   - Unit tests for detection.
   - Unit tests for missing config warnings.
   - Unit tests for threshold warning.
   - API test if endpoint is added.
   - UI test if new panel added.

7. Docs:
   - Update docs/api-reference.md if endpoint added.
   - Update docs/validation-rules.md.
   - Update docs/feature-catalog.md.
   - Update docs/configuration-guide.md if threshold config added.

Acceptance criteria:
- UD dimensions show attribute analysis.
- Validation warns about incomplete/high-risk UD attribute designs.
- Non-UD dimensions are unaffected.
- npm.cmd test passes.
- npm.cmd run build passes.
- npm.cmd run docs:check passes.
````

---

# Feature 20 - Dynamic Dimension readiness support

````text
Feature: Add Dynamic Dimension readiness support.

Goal:
Let users mark dimensions as standard, business-rule sourced, dynamic-dimension sourced, or XBRL/source-driven, and capture source metadata required for handoff.

Current anchors:
- src/shared/xmlExport.ts
- docs/xml-generation-guide.md
- dimensions.metadata_json
- dimension XML source attributes:
  - dimMemberSourceType
  - dimMemberSourcePath
  - dimMemberSourceNVPairs
- src/client/components/MetadataEditor.tsx
- src/shared/validationEngine.ts
- docs/database-architecture.md

Implement:
1. Domain model:
   Add dimension source metadata:
   - dimMemberSourceType: "Standard" | "BusinessRule" | "DynamicDimension" | "XBRL" | "External"
   - dimMemberSourcePath
   - dimMemberSourceNVPairs
   - externalSourceName
   - externalSourceDescription
   Store in dimension.metadata_json unless typed columns already exist or are justified.

2. Shared module:
   Create src/shared/dynamicDimension.ts.
   Functions:
   - getDimensionSourceInfo(dimension)
   - validateDimensionSourceInfo(dimension)
   - summarizeDynamicDimensionReadiness(projectState)
   - renderDynamicDimensionHandoffNotes(dimension)

3. Validation:
   Add issue codes:
   - DYNAMIC_DIMENSION_SOURCE_PATH_MISSING
   - DYNAMIC_DIMENSION_NVP_INVALID
   - DYNAMIC_DIMENSION_EXTENSIBILITY_WARNING
   - DYNAMIC_DIMENSION_EXPORT_INFO_MISSING

   Rules:
   - If source type is DynamicDimension/BusinessRule/External, source path should be present.
   - NVPairs should parse as key/value pairs if provided.
   - Warn if inherited/extended dimension references conflict with dynamic source metadata.

4. XML export:
   Current exporter can include dimMemberSourceType, dimMemberSourcePath, dimMemberSourceNVPairs when enabled.
   Ensure it reads new metadata consistently.
   Add tests.

5. UI:
   Enhance MetadataEditor:
   - Dimension Source Type dropdown.
   - Source Path input.
   - Source NV Pairs input.
   - Readiness summary.
   Add handoff notes export/copy if simple.

6. API:
   Existing PATCH dimension endpoint may be enough.
   If needed, add:
   - GET /api/projects/:projectId/dimensions/:dimensionId/source-readiness

7. Tests:
   - Unit tests for NVP parsing.
   - Validation tests for missing source path.
   - XML export test for source attributes.
   - UI/view model test if applicable.

8. Docs:
   - Update docs/xml-generation-guide.md.
   - Update docs/validation-rules.md.
   - Update docs/feature-catalog.md.
   - Update docs/database-architecture.md if persistence changes.

Acceptance criteria:
- Users can capture source metadata for dynamic/source-driven dimensions.
- XML export uses the source attributes consistently.
- Validation warns on incomplete source setup.
- Existing standard dimensions unaffected.
- npm.cmd test passes.
- npm.cmd run build passes.
- npm.cmd run docs:check passes.
````

---

# Recommended execution order

1. Server-side export blocking
2. OneStream property dictionary
3. Stronger OneStream validation profile
4. XML import with unknown preservation
5. Snapshot restore, branching, and rollback
6. Baseline compare/diff engine
7. Relationship load modes
8. Change sets and release packages
9. Bulk update wizard
10. Levelized hierarchy export and hierarchy analytics
11. Blueprint Studio
12. ACM-compatible export mode
13. Varying-property engine
14. Extensible and inherited dimension support
15. Project readiness dashboard
16. Authentication, authorization, and project ownership
17. Database migrations and operational hardening
18. Formula, member filter, and property helper tools
19. UD Attribute design assistant
20. Dynamic Dimension readiness support

---

# Suggested branch naming

Use one branch per feature:

- feature/export-blocking
- feature/onestream-property-dictionary
- feature/onestream-validation-profile
- feature/xml-import-roundtrip
- feature/snapshot-restore
- feature/metadata-diff
- feature/relationship-load-modes
- feature/change-sets
- feature/bulk-update
- feature/hierarchy-analytics
- feature/blueprint-studio
- feature/acm-export
- feature/varying-properties
- feature/extensible-dimensions
- feature/project-readiness
- feature/auth-authorization
- feature/db-migrations
- feature/onestream-helper-tools
- feature/ud-attribute-assistant
- feature/dynamic-dimension-readiness

---

# Handoff checklist for every Codex task

Before accepting any feature implementation, require Codex to report:

- Files changed
- New files added
- API changes
- Database changes
- Config changes
- Validation changes
- Export changes
- UI changes
- Tests added/updated
- Docs added/updated
- Commands run:
  - npm.cmd test
  - npm.cmd run build
  - npm.cmd run docs:check
- Known limitations
- Follow-up TODOs
