# SR OneStream Dim Builder - Agent Implementation Backlog

Generated: 2026-05-31
Owner: Naga Shankar / Spaulding Ridge US Workspace
Purpose: A single implementation backlog for Claude Code, Codex, or another coding agent. Execute tasks one by one in the order below. Mark each task complete only after code, tests, docs, and acceptance criteria are done.

---

## How to use this file

1. Start every coding session with **TASK-00: Agent Operating Instructions**.
2. Implement the remaining tasks in order.
3. For each task, copy the full **Agent Prompt** into Claude Code/Codex.
4. Ask the agent to update the checklist section in this file after completing a task.
5. Do not skip tests or documentation updates.
6. Do not claim real OneStream, ACM, or EPMware deployment unless a real connector and verified environment exist.

---

## Master checklist

| Order | Task | Status |
|---:|---|---|
| 00 | Agent Operating Instructions | [x] Complete |
| 01 | Product Positioning Cleanup | [x] Complete |
| 02 | Pilot Hardening and Production Safety | [x] Complete |
| 03 | OneStream Validation Expansion and Preflight Gates | [x] Complete |
| 04 | OneStream XML Round-Trip Certification | [x] Complete |
| 05 | Mode-Specific Incremental XML and Rollback XML | [x] Complete |
| 06 | OneStream Deployment Readiness Score | [x] Complete |
| 07 | Guided OneStream Workflow UX | [x] Complete |
| 08 | Release Evidence Package | [x] Complete |
| 09 | OneStream Artifact Impact Scanner | [x] Complete |
| 10 | Effective OneStream POV Simulator | [x] Complete |
| 11 | Extensible Dimensionality X-Ray | [x] Complete |
| 12 | ACM Handoff Package | [x] Complete |
| 13 | EPMware Handoff Package | [x] Complete |
| 14 | Evidence-Based Project Assistant | [x] Complete |
| 15 | Metadata Risk Heatmap | [x] Complete |
| 16 | Client Pattern Profiler | [x] Complete |
| 17 | Migration Cockpit | [x] Complete |
| 18 | End-to-End Regression Suite | [x] Complete |

---

# TASK-00 - Agent Operating Instructions

## Status

- [ ] Not started
- [ ] In progress
- [ ] Complete

## Purpose

This task is the operating prompt to paste at the start of every coding session. It establishes product positioning, engineering discipline, testing expectations, and documentation rules.

## Agent Prompt

```text
You are working in the SR OneStream Dim Builder repository.

Act as a senior OneStream architect, TypeScript full-stack engineer, QA lead, and enterprise product reviewer.

This product must be positioned as a OneStream metadata build, validation, impact-analysis, and release-readiness workbench. It must NOT be positioned as an enterprise MDM replacement, direct OneStream deployment engine, or guaranteed replacement for ACM/EPMware.

Core workflow:
Create/import metadata -> edit dimensions/members/relationships -> validate -> analyze impact -> compare baseline -> package changes -> export/handoff.

Before changing code:
1. Inspect the repo structure.
2. Identify frontend, backend, shared/domain, database, tests, config, and docs.
3. Read these docs if they exist:
   - docs/current-state-baseline.md
   - docs/architecture.md
   - docs/api-reference.md
   - docs/XML_CORRECTNESS_REVIEW.md
   - docs/VALIDATION_COVERAGE_REVIEW.md
   - docs/STAKEHOLDER_MESSAGING_REVIEW.md
   - docs/PRODUCTION_READINESS_REVIEW.md
4. Confirm existing implementation from source code, not only documentation.
5. Preserve existing behavior unless this task explicitly changes it.

Engineering rules:
- Implement end-to-end, not only backend or only UI.
- Add or update shared types.
- Add API route validation with Zod or the existing validation pattern.
- Add repository/database changes through the existing persistence layer.
- Add frontend API client functions.
- Add UI affordances where applicable.
- Add tests for shared logic and API routes.
- Update docs to describe actual behavior.
- Do not claim real OneStream deployment unless a real connector and test environment exist.
- Do not call heuristic features "AI" unless there is a real LLM integration. Prefer "Smart Suggestions."
- Do not remove existing docs unless clearly obsolete; mark planned/limited behavior honestly.
- Run the existing test/build commands and fix regressions.

At the end, provide:
1. Files changed.
2. Behavior implemented.
3. Tests added/updated.
4. Docs updated.
5. Remaining gaps or assumptions.
```

## Completion checklist

- [ ] Agent inspected repository structure.
- [ ] Agent confirmed current implementation from code.
- [ ] Agent used source files and docs, not docs alone.
- [ ] Agent ran applicable tests/build commands.
- [ ] Agent reported files changed, behavior, tests, docs, and remaining gaps.

---

# TASK-01 - Product Positioning Cleanup

## Status

- [ ] Not started
- [ ] In progress
- [ ] Complete

## Priority

Critical. Do this first before adding new features.

## User story

As a Spaulding Ridge OneStream implementation leader, I want the application positioned as a OneStream metadata engineering and release-readiness workbench, so that stakeholders understand the product's value without overclaiming that it replaces ACM, EPMware, or direct OneStream deployment.

## Goal

Reposition SR OneStream Dim Builder as:

"A OneStream metadata engineering, validation, impact-analysis, and release-readiness workbench."

It should be clearly complementary to ACM and EPMware:

- ACM governs approved changes inside OneStream.
- EPMware governs enterprise master data across systems.
- SR Dim Builder helps implementation teams design, validate, analyze, package, and hand off OneStream metadata before it enters ACM, EPMware, or manual OneStream import.

## Agent Prompt

```text
Implement a documentation and UI messaging cleanup so the product is positioned honestly and strongly from a OneStream-only perspective.

Goal:
Reposition SR OneStream Dim Builder as:
"A OneStream metadata engineering, validation, impact-analysis, and release-readiness workbench."

It should be clearly complementary to ACM and EPMware:
- ACM governs approved changes inside OneStream.
- EPMware governs enterprise master data across systems.
- SR Dim Builder helps implementation teams design, validate, analyze, package, and hand off OneStream metadata before it enters ACM, EPMware, or manual OneStream import.

Tasks:
1. Search the repo for overclaiming language:
   - "AI-powered enterprise MDM"
   - "replaces ACM"
   - "replaces EPMware"
   - "deploys directly to OneStream"
   - "tested against OneStream"
   - "no other tool has AI"
   - "zero cost"
   - "EPMware is expensive"
   - "ACM cannot do X" without proof
2. Replace with safer wording:
   - "OneStream metadata workbench"
   - "Smart Suggestions"
   - "manual XML import/export handoff"
   - "ACM handoff-ready"
   - "EPMware handoff-ready"
   - "direct OneStream deployment is planned / mock only unless configured with a real connector"
3. Update docs:
   - docs/competitive-comparison.md
   - docs/STAKEHOLDER_MESSAGING_REVIEW.md
   - docs/feature-catalog.md
   - docs/README.md
   - docs/current-state-baseline.md
4. Add or update a document:
   - docs/positioning.md
5. The new document must include:
   - What this tool does
   - What this tool does not do
   - How it complements ACM
   - How it complements EPMware
   - Safe demo language
   - Unsafe claims to avoid
6. Update UI copy where needed:
   - Rename "AI Insights" to "Smart Insights" or "Smart Suggestions" unless there is true LLM behavior.
   - Any "deploy" UI must clarify whether it is real deployment, mock tracking, or export/handoff only.
7. Do not remove useful comparison tables; rewrite them to be fair and defensible.
8. Add a test or static check if the repo has a docs check mechanism, ensuring banned phrases are flagged.

Acceptance criteria:
- No user-facing docs or UI claim direct OneStream deployment unless clearly labeled mock/planned.
- ACM and EPMware are described respectfully and accurately.
- The product's differentiated lane is clear: OneStream-specific build quality, validation, migration acceleration, impact analysis, and release packaging.
- Existing tests pass.
```

## Definition of done

- [ ] Overclaiming terms removed or corrected.
- [ ] docs/positioning.md created or updated.
- [ ] ACM/EPMware language is complementary, not combative.
- [ ] UI copy no longer overclaims.
- [ ] Static banned-phrase check added if practical.
- [ ] Tests/build pass.

---

# TASK-02 - Pilot Hardening and Production Safety

## Status

- [ ] Not started
- [ ] In progress
- [ ] Complete

## Priority

Critical. Do before deeper features so the pilot foundation is safer.

## User story

As a project owner, I want the application hardened for a small internal pilot, so that 5-10 users can test safely without pretending the app is fully enterprise production-ready.

## Agent Prompt

```text
Implement pilot hardening for safe internal/network deployment.

Goal:
Make the app safer for a small internal pilot without pretending it is fully enterprise production-ready.

Tasks:
1. Database:
   - Enable SQLite WAL mode.
   - Add busy timeout.
   - Add DB health check.
   - Add backup script or documented backup command.
2. Migrations:
   - Introduce a migration system if none exists.
   - Current schema becomes migration 001.
   - Add schema_migrations table.
   - Ensure migrations run safely on startup.
3. Upload security:
   - Validate file extensions and MIME where practical.
   - Enforce max file size from config.
   - Reject unexpected file types.
   - Clean up temp uploads after import.
4. Export retention:
   - Add config for export retention days.
   - Add cleanup command or scheduled job.
5. HTTP hardening:
   - Add Helmet or equivalent security headers.
   - Make CORS configurable.
   - Ensure default CORS is localhost-only unless config says otherwise.
6. Secrets:
   - Add startup warning for default JWT/session secrets.
   - Mask admin/default password in logs.
   - Add .env.example.
7. Health:
   - /api/health should verify app alive.
   - Add /api/health/deep or similar for DB/write/export path checks if consistent with existing style.
8. Logging:
   - Add request correlation ID.
   - Include authenticated user ID when available.
9. Docs:
   - Create or update docs/pilot-deployment-guide.md.
   - Update docs/production-readiness-checklist.md.
   - Update docs/PRODUCTION_READINESS_REVIEW.md.

Tests:
- Migration runs once.
- WAL/busy timeout applied.
- Upload rejects invalid extension.
- Health check fails when DB is unavailable if testable.
- CORS config is applied.
- Default secret warning appears in startup validation function.

Acceptance criteria:
- Safer for 5-10 user pilot.
- No passwords printed in logs.
- Operators have .env.example and pilot deployment guide.
- Docs still distinguish pilot-ready from production-ready.
```

## Definition of done

- [ ] SQLite WAL and busy timeout implemented.
- [ ] Migration system exists or current migration approach strengthened.
- [ ] Upload constraints enforced.
- [ ] Export retention or cleanup documented/implemented.
- [ ] Security headers and CORS hardened.
- [ ] Default secret warnings added.
- [ ] Health/deep health endpoint implemented where practical.
- [ ] Pilot deployment docs updated.
- [ ] Tests/build pass.

---

# TASK-03 - OneStream Validation Expansion and Preflight Gates

## Status

- [ ] Not started
- [ ] In progress
- [ ] Complete

## Priority

Critical. This creates the core OneStream-specific credibility.

## User story

As a OneStream metadata builder, I want the app to catch OneStream-specific metadata issues before export, so that I can fix blockers before ACM/EPMware handoff or manual OneStream import.

## Agent Prompt

```text
Implement missing OneStream-specific validation rules and a project-level preflight validation layer.

Goal:
Strengthen the app's OneStream-specific value by catching metadata problems before export/handoff.

Important:
First inspect the existing validation engine and rule list. Do not duplicate rules that already exist. If a listed rule already exists, verify test coverage and docs instead.

Inspect:
- src/shared/validationEngine.ts
- src/shared/oneStreamValidation.ts
- src/shared/hierarchy.ts
- src/shared/oneStreamPropertyDictionary.ts
- config/dimbuilder.yaml
- docs/VALIDATION_COVERAGE_REVIEW.md
- docs/validation-rules.md

Implement or verify these rules:
1. ROOT_MEMBER_MISSING
   - Every dimension should have a configured root member.
   - Root member name should come from blueprint/config where available.
2. SELF_REFERENCING_RELATIONSHIP
   - parentKey === childKey is invalid.
3. MEMBER_NAME_LEADING_TRAILING_WHITESPACE
   - Member keys with leading/trailing spaces or tabs are errors.
4. DUPLICATE_MEMBER_CASE_INSENSITIVE
   - Two active members in the same dimension differ only by case.
5. MEMBER_NAME_STARTS_WITH_DIGIT
   - Warning by default.
6. SCENARIO_TYPE_MISSING
   - Scenario dimension members missing Scenario Type property.
7. HIERARCHY_MAX_DEPTH_EXCEEDED
   - Configurable max depth, default 20.
8. DIMENSION_MISSING_FROM_PROJECT
   - Project missing expected dimensions from config.
9. CROSS_DIMENSION_CURRENCY_INVALID
   - Entity currency property must map to configured valid currency members or ISO list.
10. CONSOLIDATION_METHOD_MISMATCH
   - Entity ownership/consolidation percentage contradictions.
11. ACCOUNT_ALLOW_INPUT_PARENT_RISK
   - Parent account with Allow Input enabled should be warning unless explicitly allowed.
12. SECURITY_GROUP_REFERENCE_MISSING
   - Access/Maintenance group references should resolve against configured known groups, if reference list exists.

Add configuration:
- validation.oneStreamProfile.maxHierarchyDepth
- validation.oneStreamProfile.expectedDimensionTypes
- validation.oneStreamProfile.validCurrencyCodes
- validation.oneStreamProfile.securityGroups
- validation.ruleOverrides for every new rule.

Implementation details:
1. Add project-level validation if existing validation is dimension-only.
2. Validation output must include:
   - code
   - severity
   - message
   - dimensionId/dimensionName
   - memberId/memberKey when applicable
   - relationshipId when applicable
   - remediation hint
3. Ensure export blocking respects configured severities.
4. Add tests for every rule.
5. Update validation rules export CSV if the app supports it.
6. Update UI issue drill-down so new rules navigate to the right dimension/member where possible.
7. Update docs:
   - docs/validation-rules.md
   - docs/VALIDATION_COVERAGE_REVIEW.md
   - docs/api-reference.md

Acceptance criteria:
- Every new rule has test coverage.
- Rule severities are configurable.
- Export blocking works for error-level rules.
- UI displays remediation guidance.
- Existing validation tests still pass.
```

## Definition of done

- [ ] Existing validation engine inspected before changes.
- [ ] Duplicate rules avoided.
- [ ] New OneStream rules implemented or verified.
- [ ] Project-level preflight validation works.
- [ ] Rule severities configurable.
- [ ] UI drill-down supports new issues.
- [ ] Tests cover all new rules.
- [ ] Docs updated.

---

# TASK-04 - OneStream XML Round-Trip Certification

## Status

- [ ] Not started
- [ ] In progress
- [ ] Complete

## Priority

Critical. This is a major differentiator against generic metadata governance.

## User story

As a OneStream implementation consultant, I want to prove that imported OneStream XML can be edited and exported without silent metadata loss, so that I can trust the app during client implementations.

## Agent Prompt

```text
Implement OneStream XML Round-Trip Certification.

Goal:
Users must be able to prove that imported OneStream XML can be edited and exported without losing known metadata or silently dropping unknown metadata.

Feature name:
"OneStream XML Round-Trip Certification"

Core behavior:
Given a project created from XML import, the app should compare:
1. Original imported XML structure.
2. Persisted project records.
3. Re-exported XML.

It should produce a certification report with:
- Overall status: Passed / Passed with warnings / Failed.
- Dimension count comparison.
- Member count comparison.
- Relationship count comparison.
- Known property comparison.
- Varying property comparison.
- Unknown XML attribute preservation summary.
- Unsupported XML element preservation summary.
- Lost metadata warnings.
- Changed metadata summary.
- Canonical structural diff.
- Recommended next action.

Implementation tasks:
1. Inspect existing XML import/export modules:
   - src/shared/xmlImport.ts
   - src/shared/xmlExport.ts
   - src/shared/oneStreamPropertyDictionary.ts
   - src/server/routes/import.ts
   - src/server/routes/export.ts
2. Add a shared module:
   - src/shared/xmlRoundTripCertification.ts
3. Implement canonical comparison logic:
   - Ignore whitespace-only formatting changes.
   - Normalize attribute ordering.
   - Normalize generated IDs if the app creates internal IDs.
   - Compare dimensions by dimension type/name.
   - Compare members by dimension + member key.
   - Compare relationships by dimension + parent + child.
   - Compare known properties by normalized OneStream XML name.
   - Compare unknown preserved attributes/elements separately.
4. Add source XML tracking if not already available:
   - Store original XML hash.
   - Store import timestamp.
   - Store preservation statistics.
   - Do not store large raw XML in DB unless existing storage patterns support it. If raw XML storage is unsafe, store normalized fingerprint and preservation metadata.
5. Add API route:
   - POST /api/projects/:projectId/xml/certification
   - It should generate/export XML in memory, run certification, persist or return report.
6. Optional read route:
   - GET /api/projects/:projectId/xml/certification/latest
7. Add frontend client functions.
8. Add UI in the XML tab:
   - "Run Round-Trip Certification"
   - Status badge
   - Summary cards
   - Detailed diff table
   - Download report JSON
   - Download report Markdown
9. Add tests:
   - Simple XML import/export passes.
   - Unknown attributes are preserved.
   - Unknown property nodes are preserved or reported.
   - Missing relationship fails certification.
   - Changed property appears as changed, not lost.
10. Add fixtures:
   - tests/fixtures/xml/roundtrip-basic.xml
   - tests/fixtures/xml/roundtrip-unknowns.xml
   - tests/fixtures/xml/roundtrip-varying-properties.xml
11. Update docs:
   - docs/XML_CORRECTNESS_REVIEW.md
   - docs/xml-generation-guide.md
   - docs/api-reference.md
   - docs/feature-catalog.md

Acceptance criteria:
- A user can run certification from the UI.
- The API returns a deterministic report.
- Tests prove at least one passing and one failing certification.
- The report clearly distinguishes formatting differences from metadata loss.
- The docs state that certification is internal structural certification, not proof that OneStream itself accepted the file unless tested in a real OneStream environment.
```

## Definition of done

- [ ] XML certification shared module implemented.
- [ ] Canonical comparison handles formatting/order differences.
- [ ] Unknown XML preservation is reported.
- [ ] API route implemented.
- [ ] UI panel implemented.
- [ ] Passing and failing fixtures added.
- [ ] Docs updated with limits.
- [ ] Tests/build pass.

---

# TASK-05 - Mode-Specific Incremental XML and Rollback XML

## Status

- [ ] Not started
- [ ] In progress
- [ ] Complete

## Priority

Critical. Required for serious release packaging.

## User story

As a OneStream release lead, I want release packages to generate XML according to the selected package mode, so that adds, updates, relationship changes, full exports, and rollback instructions are clearly separated.

## Agent Prompt

```text
Implement true mode-specific release XML and rollback XML.

Current gap:
Release package XML may currently export full current metadata regardless of package mode. That is not enough for a serious OneStream release workflow.

Goal:
When a change set is packaged, generate XML artifacts that match the selected release mode:
- Full current metadata XML.
- Add-only XML.
- Update-only XML.
- Relationship move/copy XML.
- Delete/break relationship XML where safely representable.
- Rollback XML or rollback instruction package.

Implementation tasks:
1. Inspect:
   - src/shared/metadataDiff.ts
   - src/shared/relationshipOperations.ts
   - src/shared/releasePackage.ts
   - src/shared/xmlExport.ts
   - src/server/routes/export.ts
   - change set routes/repositories
2. Define release package XML modes:
   - full
   - incremental
   - addOnly
   - updateOnly
   - relationshipOperations
   - rollback
3. Add shared types for:
   - ReleaseXmlMode
   - ReleaseXmlArtifact
   - RollbackArtifact
   - ReleasePackageManifest
4. Use diff items to determine changed members, changed relationships, property deltas, move/copy operations, and break/build operations.
5. Generate separate files in release package directory:
   - manifest.json
   - release-notes.md
   - validation-report.csv/json
   - impact-report.json if available
   - metadata-full.xml
   - metadata-adds.xml
   - metadata-updates.xml
   - relationship-operations.xml
   - rollback.xml where possible
   - rollback-instructions.md always
6. If true rollback XML cannot safely represent an operation, document it in rollback-instructions.md and flag the package as "rollback requires manual review."
7. Add API support:
   - Existing package endpoint should accept mode options.
   - Return generated artifact list and warnings.
8. Add UI:
   - Package mode selector.
   - Explain each mode.
   - Show whether rollback XML is fully generated or manual-review required.
9. Add tests:
   - Add member produces add-only XML.
   - Property update produces update-only XML.
   - Relationship move produces relationship operation artifact.
   - Delete/break operation appears in rollback instructions if XML representation is unsafe.
   - Full mode still works.
10. Update docs:
   - docs/change-set-guide.md
   - docs/export-modes.md
   - docs/metadata-diff-guide.md
   - docs/api-reference.md

Acceptance criteria:
- Release package mode changes actual generated XML content.
- Package manifest truthfully lists which artifacts are full, incremental, or rollback.
- Rollback output is never falsely claimed to be automatic if manual review is needed.
- Existing export behavior remains backward-compatible.
```

## Definition of done

- [ ] Release package modes implemented.
- [ ] Actual XML output changes by selected mode.
- [ ] Rollback XML generated where safe.
- [ ] Rollback instructions generated always.
- [ ] Manifest accurately lists files.
- [ ] UI explains modes.
- [ ] Tests cover add/update/relationship/delete/full modes.
- [ ] Docs updated.

---

# TASK-06 - OneStream Deployment Readiness Score

## Status

- [ ] Not started
- [ ] In progress
- [ ] Complete

## Priority

High. This creates a simple executive/demo signal.

## User story

As a user preparing metadata for handoff or import, I want a clear readiness score, so that I can understand whether the project is export-ready and what to fix first.

## Agent Prompt

```text
Implement a OneStream Deployment Readiness Score.

Goal:
Give users a single, understandable score that answers:
"Is this project safe to export or hand off for OneStream import?"

Feature name:
"OneStream Readiness Score"

Inputs:
- Validation issues by severity.
- XML round-trip certification status.
- Required dimension completeness.
- Required property completeness.
- Varying property conflicts.
- Hierarchy health.
- Cross-dimension reference health.
- Impact scanner risk, if available.
- Release package rollback readiness.
- Export gate status.
- Unknown XML preservation warnings.

Score:
0-100 with category bands:
- 90-100 Ready
- 75-89 Ready with warnings
- 50-74 Needs review
- 0-49 Not ready

Implementation tasks:
1. Add shared module:
   - src/shared/readinessScore.ts
2. Define scoring categories:
   - Structural integrity
   - OneStream required properties
   - XML fidelity
   - Hierarchy health
   - Cross-dimension consistency
   - Release readiness
   - Impact risk
   - Documentation/evidence readiness
3. Each category should include:
   - score
   - weight
   - status
   - findings
   - blockers
   - recommended actions
4. Add API:
   - GET /api/projects/:projectId/readiness
   - Optional query: ?includeDetails=true
5. Add frontend client function.
6. Add UI:
   - Dashboard readiness card.
   - Validation tab readiness summary.
   - Export modal warning if score is below configured threshold.
   - Link from score findings to validation/impact/XML certification panels.
7. Add config:
   - readiness.minimumScoreForExportWarning
   - readiness.categoryWeights
8. Integrate with export gate:
   - Do not hard-block exports by score unless config explicitly says so.
   - Validation error blocking remains the source of hard blocking.
9. Add tests:
   - No issues gives high score.
   - Error validation issues reduce score significantly.
   - Failed XML certification reduces score.
   - Missing rollback readiness reduces release category.
10. Update docs:
   - docs/feature-catalog.md
   - docs/api-reference.md
   - docs/export-modes.md
   - docs/README.md

Acceptance criteria:
- Score is deterministic for the same project state.
- Score explains why it is low.
- UI does not present score as OneStream acceptance guarantee.
- Tests cover score calculation and API output.
```

## Definition of done

- [ ] Readiness score module implemented.
- [ ] Score categories and weights configurable.
- [ ] API route implemented.
- [ ] UI dashboard and export warning implemented.
- [ ] Score explains low areas.
- [ ] Tests cover clean/error/certification/rollback cases.
- [ ] Docs updated with non-guarantee language.

---

# TASK-07 - Guided OneStream Workflow UX

## Status

- [ ] Not started
- [ ] In progress
- [ ] Complete

## Priority

High. Makes the application easier to demo and use.

## User story

As a new user, I want a guided workflow showing what to do next, so that I can move from import to validation, packaging, and handoff without getting lost in disconnected tabs.

## Agent Prompt

```text
Implement a guided OneStream workflow experience.

Goal:
Make the app feel like a consultant workbench with a clear end-to-end path instead of many disconnected tabs.

Workflow stages:
1. Create/import project
2. Review dimensions
3. Edit metadata
4. Validate
5. Run XML certification
6. Analyze hierarchy and XD behavior
7. Analyze impact
8. Compare against baseline
9. Create/approve change set
10. Generate release evidence package
11. Export XML or handoff to ACM/EPMware

Implementation tasks:
1. Add shared workflow model:
   - src/shared/workflowReadiness.ts or similar
2. For each stage compute:
   - status: not started / needs attention / ready / complete
   - blockers
   - warnings
   - recommended action
   - link target
3. Add API:
   - GET /api/projects/:projectId/workflow-status
4. Add UI:
   - Workflow progress component on project overview.
   - Stage cards with status.
   - "Next best action" button.
   - Warning badges.
5. Integrate existing data:
   - project summary
   - validation
   - readiness
   - XML certification
   - impact scanner
   - diff/change set/package state
6. Add tests:
   - New project shows import/review incomplete.
   - Project with validation errors points to validation.
   - Approved change set points to package/export.
7. Update docs:
   - docs/README.md
   - docs/feature-catalog.md
   - docs/api-reference.md

Acceptance criteria:
- A new user can understand what to do next.
- Workflow status uses real project state.
- It does not block power users from using existing tabs.
```

## Definition of done

- [ ] Workflow status model implemented.
- [ ] API route implemented.
- [ ] Overview workflow UI implemented.
- [ ] Next-best-action logic works from real state.
- [ ] Tests cover new, invalid, and approved-change-set cases.
- [ ] Docs updated.

---

# TASK-08 - Release Evidence Package

## Status

- [ ] Not started
- [ ] In progress
- [ ] Complete

## Priority

High. This turns the tool into a client-ready delivery accelerator.

## User story

As a release owner, I want a polished evidence package for every approved change set, so that reviewers and approvers can see changes, validation, impact, XML, rollback notes, and post-import checks in one place.

## Agent Prompt

```text
Implement a polished Release Evidence Package.

Goal:
Every approved change set should produce a client-ready evidence package for review, sign-off, import, and rollback planning.

Package contents:
1. manifest.json
2. release-summary.md
3. release-summary.html if HTML report utilities exist
4. change-summary.csv
5. before-after-diff.csv/json
6. validation-report.csv/json
7. readiness-report.json
8. xml-certification-report.json/md if available
9. impact-report.json/md if available
10. generated XML artifacts
11. ACM handoff if requested
12. EPMware handoff if requested
13. rollback.xml if available
14. rollback-instructions.md
15. post-import-smoke-test-checklist.md
16. approver-signoff.md

Implementation tasks:
1. Inspect:
   - src/shared/releasePackage.ts
   - change set package route
   - reporting exporter utilities
2. Extend release package builder.
3. Add package options:
   - includeAcmHandoff
   - includeEpmwareHandoff
   - includeImpactReport
   - includeXmlCertification
   - includeSmokeTestChecklist
4. Add smoke test checklist template:
   - Validate dimensions import.
   - Validate member counts.
   - Validate hierarchy parent-child counts.
   - Validate sample Cube View opens.
   - Validate sample consolidation/calc if applicable.
   - Validate security/maintenance groups if included.
5. Add UI:
   - Evidence package options checklist.
   - Package preview.
   - Download package.
6. Add tests:
   - Package includes all required files.
   - Missing optional data produces warning file, not crash.
   - Manifest accurately describes artifacts.
7. Update docs:
   - docs/change-set-guide.md
   - docs/export-modes.md
   - docs/api-reference.md
   - docs/feature-catalog.md

Acceptance criteria:
- Release evidence package is deterministic.
- Package is useful without direct OneStream deployment.
- Optional missing inputs are honestly reported.
- Manifest never lists files that were not generated.
```

## Definition of done

- [ ] Evidence package builder extended.
- [ ] Required files generated.
- [ ] Optional missing data handled with warnings.
- [ ] Smoke test checklist generated.
- [ ] UI package options implemented.
- [ ] Manifest accurate.
- [ ] Tests and docs complete.

---

# TASK-09 - OneStream Artifact Impact Scanner

## Status

- [ ] Not started
- [ ] In progress
- [ ] Complete

## Priority

High. This creates a very strong OneStream implementation differentiator.

## User story

As a OneStream implementation consultant, I want to scan Business Rules, Cube Views, Member Lists, Dashboards, Transformation Rules, and other artifacts for member references, so that I know what will break or require review before changing metadata.

## Agent Prompt

```text
Implement a OneStream Artifact Impact Scanner.

Goal:
When a member is renamed, deleted, moved, or changed, users should know what OneStream artifacts may be affected.

Artifacts to support in first version:
- Business Rule files or exported text.
- Cube View XML/text exports.
- Member List exports.
- Dashboard XML/text exports.
- Transformation Rule exports.
- Workflow/Profile text or XML exports.
- Generic text files.

Core capability:
Upload or attach artifact files to a project, scan them for member references, and expose where-used impact results.

Implementation tasks:
1. Add database tables if needed:
   - project_artifacts
   - project_artifact_references
   - artifact_scan_runs
2. Store:
   - artifact name
   - artifact type
   - original filename
   - content hash
   - uploaded by
   - uploaded at
   - scan status
3. Add shared parser:
   - src/shared/artifactReferenceScanner.ts
4. Scanner should detect common OneStream reference patterns:
   - A#Member
   - E#Member
   - S#Member
   - T#Member
   - F#Member
   - O#Member
   - I#Member
   - U1#Member through U8#Member
   - MemberScript-like strings
   - quoted member names with dimension hints
   - XFBR or BRApi text references where detectable
5. Every reference should include:
   - dimension hint
   - member key
   - line number if text
   - character offset if possible
   - confidence: high/medium/low
   - surrounding snippet
6. Add API:
   - POST /api/projects/:projectId/artifacts/upload
   - POST /api/projects/:projectId/artifacts/:artifactId/scan
   - GET /api/projects/:projectId/artifacts
   - GET /api/projects/:projectId/impact/member/:memberId
   - POST /api/projects/:projectId/impact/proposed-change
7. Add UI:
   - Artifact upload panel.
   - Artifact library table.
   - Scan results.
   - Member "Where used" panel.
   - Proposed rename/delete impact preview.
8. Integrate with change sets:
   - Before packaging, show impacted artifacts.
   - Include impact report in release package if available.
9. Add tests:
   - Detect A#/E#/U1# patterns.
   - Ignore false positives where confidence is low.
   - Return line numbers/snippets.
   - Proposed delete of referenced member creates high-risk impact.
10. Update docs:
   - docs/feature-catalog.md
   - docs/api-reference.md
   - docs/change-set-guide.md

Acceptance criteria:
- User can upload artifact files and scan them.
- Member impact report shows artifact references.
- Release package can include artifact impact report.
- The scanner uses confidence levels and does not pretend every text match is guaranteed.
```

## Definition of done

- [ ] Artifact persistence implemented if needed.
- [ ] Reference scanner implemented.
- [ ] Upload/scan/list/impact APIs implemented.
- [ ] UI artifact library and where-used panels implemented.
- [ ] Change set packaging integration added.
- [ ] Tests cover high-confidence and low-confidence references.
- [ ] Docs updated.

---

# TASK-10 - Effective OneStream POV Simulator

## Status

- [ ] Not started
- [ ] In progress
- [ ] Complete

## Priority

High. Very OneStream-specific and useful for demos.

## User story

As a OneStream metadata designer, I want to select a POV context and see which properties effectively apply, so that I can understand varying properties, relationship properties, inheritance, and context-specific metadata behavior.

## Agent Prompt

```text
Implement an Effective OneStream POV Simulator.

Goal:
Allow users to select a OneStream-like POV/context and see which metadata properties effectively apply.

Feature name:
"Effective POV Simulator"

User inputs:
- Dimension
- Member or relationship
- Cube Type
- Scenario Type
- Time member
- Optional Entity
- Optional UD members
- Optional property filter

Output:
- Effective property values.
- Source of each value:
  - base/default property
  - varying property override
  - inherited value
  - relationship property
  - dictionary default
  - unresolved/missing
- Context match explanation.
- Conflicts or duplicate varying contexts.
- Missing required property warnings.
- Export/readiness impact.

Implementation tasks:
1. Inspect existing varying property support:
   - src/shared/varyingProperties.ts
   - repository methods for varying_property_values
   - VaryingPropertiesPanel
2. Add or extend shared resolver:
   - src/shared/effectivePov.ts
3. Resolver must support:
   - member effective properties
   - relationship effective properties
   - dimension effective properties if stored
   - precedence rules:
     a. exact cube/scenario/time match
     b. partial context match
     c. default persisted property
     d. dictionary default
4. Add clear ambiguity behavior:
   - If multiple overrides match equally, return conflict warning.
5. Add API:
   - POST /api/projects/:projectId/effective-pov
6. Request body:
   - targetType: dimension/member/relationship
   - targetId or dimensionId + memberKey / parentKey + childKey
   - context object
   - propertyNames optional
7. Response:
   - target summary
   - context
   - effectiveProperties[]
   - warnings[]
   - validationLinks[]
8. Add UI panel:
   - New tab: "POV Simulator" or inside Varying Properties.
   - Dropdowns populated from project dimensions/members.
   - Context fields.
   - Results table with source badges.
9. Add tests:
   - Default property only.
   - Exact varying override wins.
   - Partial context fallback.
   - Duplicate context conflict.
   - Missing required property warning.
10. Update docs:
   - docs/feature-catalog.md
   - docs/api-reference.md
   - docs/architecture.md

Acceptance criteria:
- User can simulate effective properties without exporting XML.
- Results explain why each value was selected.
- The simulator works even when some context fields are blank.
- Existing varying property behavior is not broken.
```

## Definition of done

- [ ] Effective POV resolver implemented.
- [ ] Precedence behavior documented and tested.
- [ ] API route implemented.
- [ ] UI simulator implemented.
- [ ] Conflict behavior clear.
- [ ] Docs updated.

---

# TASK-11 - Extensible Dimensionality X-Ray

## Status

- [ ] Not started
- [ ] In progress
- [ ] Complete

## Priority

High. This is another sharp OneStream-specific differentiator.

## User story

As a OneStream architect, I want to visualize and analyze base vs extended dimension behavior, so that I can find inherited members, local overrides, and cube-specific metadata differences.

## Agent Prompt

```text
Implement Extensible Dimensionality X-Ray.

Goal:
Give OneStream implementation teams a visual and analytical view of base vs extended dimension behavior.

Feature name:
"XD X-Ray"

The feature should identify:
- Base dimensions.
- Extended dimensions.
- Inherited members.
- Locally added members.
- Locally overridden properties.
- Members with same key but different behavior by cube/dimension.
- Relationship differences across dimensions.
- Varying property differences by cube/scenario/time.
- Potential extensibility anti-patterns.

Important:
If the current data model does not explicitly store base/extended dimension links, implement a conservative first version that uses available dimension metadata, naming conventions, and configured mappings. Do not invent facts. Mark inferred links as inferred.

Implementation tasks:
1. Inspect existing extensibility engine:
   - src/server/extensibility/extensibilityEngine.ts
   - any existing routes/components for extensibility.
2. Add shared types:
   - ExtensibilityMap
   - ExtensibilityDimensionNode
   - ExtensibilityMemberStatus
   - ExtensibilityOverride
   - ExtensibilityRisk
3. Add config support:
   - extensibility.dimensionLinks
   - extensibility.namingPatterns
   - extensibility.cubeDimensionMappings if not already present.
4. Add API:
   - GET /api/projects/:projectId/extensibility/xray
5. Response should include:
   - dimensions
   - inheritance links
   - member lineage
   - overridden properties
   - relationship differences
   - risks
   - confidence: explicit/inferred/unknown
6. Add UI:
   - New dashboard/workbench panel "XD X-Ray"
   - Dimension lineage tree
   - Member search
   - Filters:
     - inherited only
     - overridden only
     - local only
     - conflicts only
   - Risk cards
7. Add tests:
   - Explicit base/extended mapping.
   - Inferred mapping.
   - Same member inherited unchanged.
   - Same member overridden.
   - Local-only member.
   - Conflict risk.
8. Update docs:
   - docs/feature-catalog.md
   - docs/api-reference.md
   - docs/architecture.md
   - docs/validation-rules.md if risks create validation issues.

Acceptance criteria:
- Feature never falsely claims inferred relationships as definite.
- Users can see where a member behaves differently across dimensions.
- Risks are actionable and link to member/dimension records where possible.
```

## Definition of done

- [ ] XD X-Ray shared types implemented.
- [ ] Config supports explicit/inferred mappings.
- [ ] API route implemented.
- [ ] UI panel implemented.
- [ ] Confidence labels shown.
- [ ] Tests cover explicit, inferred, inherited, overridden, local-only, and conflict cases.
- [ ] Docs updated.

---

# TASK-12 - ACM Handoff Package

## Status

- [ ] Not started
- [ ] In progress
- [ ] Complete

## Priority

High. Makes the product complementary to ACM instead of competitive.

## User story

As a OneStream governance lead, I want a clean ACM handoff package from an approved change set, so that I can submit or document governed changes in ACM with supporting validation and impact evidence.

## Agent Prompt

```text
Implement ACM Handoff Package export.

Goal:
Do not compete with ACM. Make the app generate a clean handoff package that helps teams submit or document governed changes in ACM.

Feature name:
"ACM Handoff"

Output package should include:
- acm-change-request.csv
- acm-change-request.xlsx if XLSX export utilities exist
- acm-summary.md
- validation-evidence.csv/json
- impacted-artifacts.json if impact scanner data exists
- source-change-set.json
- import-ready XML artifacts where applicable

ACM handoff rows should include:
- Project name
- Change set name
- Change type: Add / Update / Move / Copy / Delete / Relationship Update
- Dimension type
- Dimension name
- Member key
- Parent key
- Child key
- Property name
- Old value
- New value
- Reason / business justification
- Risk level
- Validation status
- Requested by
- Requested date
- Approver notes
- Source baseline
- Target environment optional

Implementation tasks:
1. Inspect existing change set and release package code.
2. Add shared exporter:
   - src/shared/acmHandoff.ts
3. Add config mapping:
   - integrations.acm.enabled
   - integrations.acm.exportFields
   - integrations.acm.fieldLabels
4. Add API:
   - POST /api/projects/:projectId/change-sets/:changeSetId/handoff/acm
5. Add UI button in Change Sets / Release Package panel:
   - "Generate ACM Handoff"
6. The UI must explain:
   - This does not submit to ACM directly.
   - It creates an evidence package for ACM/governance workflows.
7. Include validation and readiness status in the package.
8. Add tests:
   - Member add maps to ACM row.
   - Property update maps old/new values.
   - Relationship move maps parent/child details.
   - Package includes manifest.
9. Update docs:
   - docs/change-set-guide.md
   - docs/export-modes.md
   - docs/api-reference.md
   - docs/positioning.md

Acceptance criteria:
- ACM handoff package can be generated from an approved change set.
- The export is deterministic.
- The UI and docs clearly state that it is a handoff/export, not direct ACM submission.
```

## Definition of done

- [ ] ACM exporter implemented.
- [ ] Configurable ACM fields supported.
- [ ] API route implemented.
- [ ] UI handoff button implemented.
- [ ] Package includes validation/readiness evidence.
- [ ] Tests cover add/update/relationship move.
- [ ] Docs clearly state file-based handoff only.

---

# TASK-13 - EPMware Handoff Package

## Status

- [ ] Not started
- [ ] In progress
- [ ] Complete

## Priority

High. Makes the product complementary to EPMware.

## User story

As an enterprise master data team, I want a file-based EPMware handoff package, so that OneStream-specific metadata engineering work can be reviewed, mapped, or imported through the EPMware governance process.

## Agent Prompt

```text
Implement EPMware Handoff Package export.

Goal:
Make SR Dim Builder complementary to EPMware by producing a clean, configurable metadata/change package that EPMware teams can review, map, or import through their own process.

Feature name:
"EPMware Handoff"

Output package:
- epmware-request.csv
- epmware-property-map.csv
- epmware-summary.md
- validation-evidence.csv/json
- readiness-report.json
- source-change-set.json
- xml-artifacts/
- manifest.json

Implementation tasks:
1. Add shared exporter:
   - src/shared/epmwareHandoff.ts
2. Add config:
   - integrations.epmware.enabled
   - integrations.epmware.fieldMappings
   - integrations.epmware.dimensionMappings
   - integrations.epmware.propertyMappings
3. First version should be file-based, not API-based.
4. Handoff row fields:
   - Application
   - Dimension
   - Hierarchy
   - Node / Member
   - Parent
   - Operation
   - Property
   - Old Value
   - New Value
   - Effective Date optional
   - Requestor
   - Comment
   - Validation Status
   - Readiness Status
5. Add API:
   - POST /api/projects/:projectId/change-sets/:changeSetId/handoff/epmware
6. Add UI:
   - "Generate EPMware Handoff"
   - Field mapping preview
   - Missing mapping warnings
7. Add tests:
   - Generates expected CSV.
   - Missing property mapping creates warning, not crash.
   - Includes manifest and validation evidence.
8. Update docs:
   - docs/change-set-guide.md
   - docs/export-modes.md
   - docs/api-reference.md
   - docs/positioning.md

Acceptance criteria:
- Handoff package is generated from a change set.
- Configurable field/property mapping works.
- Docs state clearly that this is not direct EPMware API integration.
```

## Definition of done

- [ ] EPMware exporter implemented.
- [ ] Configurable field/property mappings supported.
- [ ] API route implemented.
- [ ] UI handoff button and mapping preview implemented.
- [ ] Missing mapping warnings handled gracefully.
- [ ] Tests and docs complete.

---

# TASK-14 - Evidence-Based Project Assistant

## Status

- [ ] Not started
- [ ] In progress
- [ ] Complete

## Priority

Medium-high. Useful after readiness, validation, impact, and packaging exist.

## User story

As a user, I want a project assistant that answers questions using real project evidence, so that I can quickly understand blockers, changes, risks, and next actions without relying on hallucinated chatbot answers.

## Agent Prompt

```text
Improve the Project Assistant so it answers useful OneStream project questions from actual project data only.

Goal:
The assistant should behave like an evidence-based project analyst, not a generic chatbot.

Rename if needed:
- "Chat" -> "Project Assistant"
- "AI Chat" -> "Project Assistant"
- "AI Insights" -> "Smart Insights"

Supported user questions:
1. "Is this project export ready?"
2. "Why is the readiness score low?"
3. "What blocks XML export?"
4. "Which dimensions have the most issues?"
5. "Which members are missing Account Type?"
6. "Which Entity members are missing Currency?"
7. "What changed since baseline X?"
8. "Generate release notes for change set Y."
9. "What will be impacted if I rename member X?"
10. "Show risky members."
11. "Show unresolved validation errors."
12. "What should I fix first?"

Implementation tasks:
1. Inspect:
   - src/client/components/ChatPanel.tsx
   - src/server/ai/projectContext.ts
   - src/server/ai/naturalLanguage/queryParser.ts
2. Add intents for the supported questions.
3. Each answer must include:
   - Plain-English summary.
   - Evidence source:
     - validation issue IDs/codes
     - dimension/member references
     - readiness category
     - diff run/change set ID
     - impact scanner references
   - Suggested next actions.
4. Do not send project data to external LLM by default.
5. If optional LLM fallback exists:
   - It must be disabled by default.
   - It must never be required for core answers.
   - It must disclose fallback behavior in config/docs.
6. Add API route if needed:
   - POST /api/projects/:projectId/assistant/query
7. Add UI:
   - Suggested question chips.
   - Evidence links.
   - "Copy answer" button.
   - Clear disclaimer: "Answers are generated from current project metadata and validation results."
8. Add tests:
   - Each new intent returns deterministic answer.
   - Unknown question returns helpful fallback.
   - Export readiness answer uses real validation/export gate state.
   - Impact answer uses artifact references when available.
9. Update docs:
   - docs/feature-catalog.md
   - docs/api-reference.md
   - docs/positioning.md

Acceptance criteria:
- Assistant answers are grounded in project data.
- It does not hallucinate OneStream behavior.
- It can explain blockers and recommended fixes.
```

## Definition of done

- [ ] Assistant renamed where needed.
- [ ] Supported intents implemented.
- [ ] Answers include evidence and next actions.
- [ ] No external LLM required by default.
- [ ] UI suggested questions and evidence links implemented.
- [ ] Deterministic tests added.
- [ ] Docs updated.

---

# TASK-15 - Metadata Risk Heatmap

## Status

- [ ] Not started
- [ ] In progress
- [ ] Complete

## Priority

Medium. Best implemented after validation, readiness, XML certification, and impact scanning.

## User story

As a metadata reviewer, I want a heatmap of risk by dimension and category, so that I can quickly identify the highest-risk parts of the OneStream metadata model.

## Agent Prompt

```text
Implement Metadata Risk Heatmap.

Goal:
Give users a fast visual way to see which dimensions and risk categories need attention.

Risk categories:
- XML fidelity
- Validation errors
- Required properties
- Hierarchy structure
- Varying property conflicts
- Cross-dimension references
- Artifact impact
- Release/rollback readiness
- Naming convention risk
- Data quality/completeness

Implementation tasks:
1. Add shared module:
   - src/shared/riskHeatmap.ts
2. Inputs:
   - validation issues
   - readiness score categories
   - hierarchy analytics
   - XML certification
   - impact scanner output
   - quality scores if available
3. Output:
   - rows: dimensions
   - columns: risk categories
   - cell score 0-100 or Low/Medium/High
   - issue counts
   - top findings
   - links to drill-down targets
4. Add API:
   - GET /api/projects/:projectId/risk-heatmap
5. Add UI:
   - Dashboard heatmap.
   - Clickable cells.
   - Filter by severity.
   - Legend explaining risk levels.
6. Add tests:
   - Dimension with validation errors shows high validation risk.
   - Failed XML certification increases XML risk.
   - Impact references increase artifact risk.
   - Clean dimension shows low risk.
7. Update docs:
   - docs/feature-catalog.md
   - docs/api-reference.md

Acceptance criteria:
- Risk heatmap is deterministic.
- Every high-risk cell explains why.
- Clicking a risk leads the user to the relevant details.
```

## Definition of done

- [ ] Risk heatmap module implemented.
- [ ] API route implemented.
- [ ] Dashboard heatmap UI implemented.
- [ ] High-risk cells include reasons and links.
- [ ] Tests cover validation/XML/impact/clean cases.
- [ ] Docs updated.

---

# TASK-16 - Client Pattern Profiler

## Status

- [ ] Not started
- [ ] In progress
- [ ] Complete

## Priority

Medium. Strong consultant accelerator after core validation is stable.

## User story

As a consultant, I want to learn client-specific metadata patterns from a good project, so that future builds can flag deviations from the client's conventions without confusing suggestions with hard OneStream rules.

## Agent Prompt

```text
Implement Client Pattern Profiler.

Goal:
Let users load or choose a "good" OneStream project and derive reusable client-specific metadata standards from it.

Feature name:
"Client Pattern Profiler"

Patterns to detect:
- Member naming prefixes/suffixes.
- Case conventions.
- Account Type by hierarchy branch.
- Flow usage by Account Type.
- Entity Currency completeness.
- UD dimension naming patterns.
- Description/alias completeness.
- Sort order conventions.
- Relationship weight defaults.
- Common root/None member patterns.
- Common property values by dimension type.
- Shared member usage patterns.

Implementation tasks:
1. Add shared module:
   - src/shared/clientPatternProfiler.ts
2. Add persistence if needed:
   - pattern_profiles
   - pattern_profile_rules
   - pattern_profile_runs
3. Add API:
   - POST /api/projects/:projectId/pattern-profiles
     Creates profile from current project.
   - GET /api/projects/:projectId/pattern-profiles
   - POST /api/projects/:projectId/pattern-profiles/:profileId/evaluate
4. Evaluation output:
   - rule name
   - confidence
   - observed pattern
   - deviations
   - affected dimensions/members
   - suggested remediation
5. Add UI:
   - Create pattern profile from project.
   - View learned rules.
   - Run profile against current project.
   - Deviations table.
   - Option to export profile JSON.
6. Add config:
   - patternProfiler.minimumConfidence
   - patternProfiler.maxGeneratedRules
7. Add tests:
   - Detect prefix convention.
   - Detect required description/alias pattern.
   - Detect branch-specific Account Type pattern.
   - Low-confidence patterns are not enforced.
8. Update docs:
   - docs/feature-catalog.md
   - docs/api-reference.md

Acceptance criteria:
- The profiler distinguishes learned convention from hard OneStream rule.
- Low-confidence findings are suggestions, not validation errors.
- Users can export and reuse a profile.
```

## Definition of done

- [ ] Pattern profiler module implemented.
- [ ] Persistence added if needed.
- [ ] API routes implemented.
- [ ] UI profile creation/evaluation/export implemented.
- [ ] Confidence behavior implemented.
- [ ] Tests and docs complete.

---

# TASK-17 - Migration Cockpit

## Status

- [ ] Not started
- [ ] In progress
- [ ] Complete

## Priority

Medium. Valuable after core import, validation, and preview flows are stable.

## User story

As a migration consultant, I want a guided cockpit for HFM, EPMA, SAP BPC, and CSV migrations, so that I can preview mappings, resolve decisions, validate output, and generate a client issue pack before committing metadata.

## Agent Prompt

```text
Implement Migration Cockpit on top of the existing migration parsers.

Goal:
Turn legacy migration from a parser into a guided consultant workflow.

Supported sources:
- Hyperion HFM
- Hyperion EPMA
- SAP BPC
- Generic CSV

Workflow:
1. Upload source file.
2. Parse source.
3. Show detected dimensions/hierarchies.
4. Show mapping confidence.
5. Show unresolved decisions.
6. Let user map source fields to OneStream fields.
7. Preview generated OneStream members/relationships/properties.
8. Run validation before import.
9. Commit import.
10. Generate migration issue pack.

Implementation tasks:
1. Inspect:
   - src/server/migration/migrationParsers.ts
   - import routes
   - workbook import flow
2. Add shared types:
   - MigrationSession
   - MigrationSourceSummary
   - MigrationMapping
   - MigrationDecision
   - MigrationPreview
   - MigrationIssuePack
3. Add persistence if needed:
   - migration_sessions
   - migration_decisions
   - migration_preview_items
4. Add API:
   - POST /api/projects/:projectId/migration/sessions
   - GET /api/projects/:projectId/migration/sessions/:sessionId
   - POST /api/projects/:projectId/migration/sessions/:sessionId/mappings
   - POST /api/projects/:projectId/migration/sessions/:sessionId/preview
   - POST /api/projects/:projectId/migration/sessions/:sessionId/commit
   - GET /api/projects/:projectId/migration/sessions/:sessionId/issue-pack
5. Add UI:
   - New "Migration Cockpit" panel.
   - Source upload.
   - Mapping grid.
   - Confidence badges.
   - Decision queue.
   - Validation preview.
   - Commit button with confirmation.
6. Add mapping suggestions:
   - Source account type -> OneStream Account Type.
   - Entity currency source -> Currency property.
   - Parent/child columns -> relationships.
   - Legacy aliases/descriptions -> properties.
7. Add tests:
   - HFM parser session preview.
   - Generic CSV mapping.
   - Unresolved decisions block commit unless override.
   - Validation preview runs before commit.
8. Update docs:
   - docs/import-seeding-guide.md
   - docs/feature-catalog.md
   - docs/api-reference.md

Acceptance criteria:
- Migration import is preview-first.
- User sees what will be created before commit.
- Commit is transactional.
- Issue pack can be exported for client review.
```

## Definition of done

- [ ] Migration session model implemented.
- [ ] Preview-first workflow implemented.
- [ ] API routes implemented.
- [ ] UI cockpit implemented.
- [ ] Commit is transactional.
- [ ] Issue pack export implemented.
- [ ] Tests and docs complete.

---

# TASK-18 - End-to-End Regression Suite

## Status

- [ ] Not started
- [ ] In progress
- [ ] Complete

## Priority

Critical after the feature backlog is implemented. Also useful earlier as a safety net if time allows.

## User story

As a product owner, I want an end-to-end regression suite for the core OneStream metadata workflow, so that future changes do not break import, edit, validation, diff, package, export, certification, or readiness behavior.

## Agent Prompt

```text
Build an end-to-end regression suite for the core OneStream metadata workflow.

Goal:
Protect the core workflow from regressions.

Core workflow to test:
1. Create project from blueprint.
2. Import XML fixture.
3. List dimensions.
4. Edit a member property.
5. Add a relationship.
6. Run validation.
7. Create baseline.
8. Make a change.
9. Run diff.
10. Create change set.
11. Approve change set.
12. Generate release package.
13. Export XML.
14. Run XML round-trip certification if implemented.
15. Generate readiness score if implemented.

Implementation tasks:
1. Inspect existing test setup:
   - Vitest
   - API integration tests
   - fixtures
   - any Playwright/Cypress setup
2. Prefer API integration tests first unless browser E2E is already established.
3. Add fixtures:
   - small valid OneStream XML
   - invalid XML with known issue
   - sample artifact file for impact scanner if implemented
4. Add test utilities:
   - create test project
   - seed dimensions
   - run validation
   - package change set
   - cleanup temp exports/uploads
5. Add CI-friendly test command if missing.
6. Add docs:
   - docs/testing-strategy.md
   - docs/system-integration-test-report.md

Acceptance criteria:
- One command runs the core workflow regression.
- Test fails if XML export, diff, validation, or package generation breaks.
- Fixtures are small enough to run quickly.
- Test names describe user workflow, not implementation internals.
```

## Definition of done

- [ ] Test setup inspected.
- [ ] Core workflow regression implemented.
- [ ] Fixtures added.
- [ ] Test utilities added.
- [ ] CI-friendly command documented.
- [ ] Testing docs updated.
- [ ] Regression fails on broken validation/diff/package/export.

---

## Suggested implementation waves

### Wave 1 - Trust and pilot safety

- [x] TASK-01 Product Positioning Cleanup
- [x] TASK-02 Pilot Hardening and Production Safety
- [x] TASK-03 OneStream Validation Expansion and Preflight Gates

### Wave 2 - OneStream metadata correctness

- [x] TASK-04 OneStream XML Round-Trip Certification
- [x] TASK-05 Mode-Specific Incremental XML and Rollback XML
- [x] TASK-06 OneStream Deployment Readiness Score

### Wave 3 - Better user workflow and release deliverables

- [x] TASK-07 Guided OneStream Workflow UX
- [x] TASK-08 Release Evidence Package
- [x] TASK-09 OneStream Artifact Impact Scanner

### Wave 4 - Advanced OneStream-specific intelligence

- [x] TASK-10 Effective OneStream POV Simulator
- [x] TASK-11 Extensible Dimensionality X-Ray
- [x] TASK-15 Metadata Risk Heatmap

### Wave 5 - Governance handoff and assistant

- [x] TASK-12 ACM Handoff Package
- [x] TASK-13 EPMware Handoff Package
- [x] TASK-14 Evidence-Based Project Assistant

### Wave 6 - Accelerator features and long-term safety net

- [x] TASK-16 Client Pattern Profiler
- [x] TASK-17 Migration Cockpit
- [x] TASK-18 End-to-End Regression Suite

---

## Product positioning guardrails for every task

Use this language:

- OneStream metadata workbench
- OneStream metadata engineering workbench
- Validation and release-readiness workbench
- ACM handoff package
- EPMware handoff package
- Smart Suggestions
- Export-ready XML artifact
- Release evidence package
- Internal structural certification

Avoid this language unless technically proven:

- Replaces ACM
- Replaces EPMware
- Direct deploy to OneStream
- Production-ready enterprise MDM
- AI-powered MDM
- Guaranteed OneStream import success
- OneStream-certified
- Zero-cost replacement
- Fully automated rollback for every change

---

## Final success criteria for the full backlog

The backlog is complete when the application can support this story end to end:

1. A consultant creates or imports a OneStream metadata project.
2. The app validates required OneStream structures and properties.
3. The app certifies XML round-trip fidelity.
4. The app computes a readiness score and explains blockers.
5. The consultant simulates effective metadata behavior by POV.
6. The consultant analyzes extensible dimensionality inheritance and overrides.
7. The consultant scans OneStream artifacts for impacted references.
8. The consultant creates a baseline, diff, and change set.
9. The app generates mode-specific XML artifacts and rollback notes.
10. The app creates a release evidence package.
11. The package can be handed off to ACM, EPMware, or manual OneStream import workflows.
12. The regression suite protects the full workflow from future breakage.
