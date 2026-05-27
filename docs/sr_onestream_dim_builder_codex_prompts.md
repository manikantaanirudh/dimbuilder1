# SR Onestream Dim Builder - Codex Prompt Pack

This file contains copy-ready prompts to use with Codex or another coding agent to keep the SR Onestream Dim Builder project on the right path.

The main goal is to avoid building a broad, impressive-looking product before proving the core workflow is correct, tested, secure, and honest in the documentation.

Core product workflow:

```text
Create or import metadata -> edit dimensions, members, and relationships -> validate -> compare against a baseline -> approve or package -> export XML/XLSX/CSV/JSON/snapshots.
```

Primary rule:

```text
Do not mark any feature as complete unless there is implementation evidence, test evidence, and documentation that accurately describes the current behavior.
```

Recommended starting order:

1. Current-state truth audit
2. Core workflow proof
3. OneStream XML correctness review
4. Security model reconciliation
5. Production readiness review
6. Sprint planning based on the findings

---

## Prompt 0 - Codex operating instructions

Use this first when starting a Codex session in the repository.

```text
You are working on the SR Onestream Dim Builder repository.

Act as a senior product architect, TypeScript engineer, QA lead, and enterprise application reviewer.

Your goal is not to add flashy features. Your goal is to make the core product trustworthy:

Create/import metadata -> edit -> validate -> compare -> package -> export.

Before making code changes:

1. Inspect the repository structure.
2. Identify the frontend, backend, shared/domain, tests, docs, and configuration areas.
3. Identify the current implemented feature set from actual code, not from documentation claims alone.
4. Identify contradictions between documentation and implementation.
5. Prioritize correctness, safety, and test evidence over roadmap expansion.

Rules:

- Do not assume a feature is implemented unless code and tests prove it.
- Do not claim production readiness without migrations, backup/restore, security, deployment, and recovery evidence.
- Do not claim enterprise security without authentication, authorization, project scoping, audit identity, and access-control tests.
- Do not claim OneStream XML correctness without fixtures and round-trip tests.
- Prefer small, verifiable changes.
- Preserve existing functionality.
- Add or update tests when changing behavior.
- Update documentation only to match actual behavior.
- If a feature is planned but not implemented, label it clearly as planned.

Start by producing a short repository assessment with:

- Current architecture summary
- Implemented features with evidence
- Unverified or contradictory features
- Top risks
- Recommended first changes
- Files you plan to inspect next
```

---

## Prompt 1 - Master project health assessment

```text
You are a senior product architect, enterprise SaaS reviewer, and OneStream metadata lifecycle advisor.

Review the current SR Onestream Dim Builder documentation, source code, tests, and recent changes.

Assess whether the project is on the right path to become a reliable OneStream metadata workbench.

Evaluate the project across these areas:

1. Product value and user problem fit
2. OneStream metadata correctness
3. XML import/export fidelity
4. XLSX import/export reliability
5. Validation engine completeness
6. Architecture quality
7. Data model and persistence design
8. Security and authentication clarity
9. Production readiness
10. Test coverage and QA evidence
11. Release packaging and rollback readiness
12. Documentation accuracy
13. Roadmap realism
14. Enterprise adoption readiness

For each area, provide:

- Current rating: Green / Yellow / Red
- Evidence from the code or docs
- Main risks
- What must be fixed next
- What can wait
- Recommended owner: product, frontend, backend, QA, DevOps, security, or architecture

Be strict. Do not assume a feature is implemented unless there is code, tests, or runnable evidence.
```

---

## Prompt 2 - Current-state truth audit

This is one of the most important prompts for this project because the docs may mix implemented, planned, and aspirational features.

```text
Act as a strict technical auditor.

Review the SR Onestream Dim Builder documentation and source code.

Create a feature status matrix with these columns:

- Feature
- Claimed status in documentation
- Actual implementation status
- Evidence from source code
- Evidence from tests
- API route or UI location, if applicable
- Database tables involved
- Status: Implemented / Partial / Planned / Not found / Contradictory
- Risk level: High / Medium / Low
- Recommended documentation update

Pay special attention to these areas:

- Authentication
- Authorization
- Basic Auth
- JWT
- OIDC / SSO
- RBAC
- Project-level permissions
- SQLite implementation
- Migrations
- AI features
- Version control features
- Connectors
- Reporting
- Multi-tenancy
- Offline sync
- Collaboration
- Release packages
- Rollback support
- OneStream XML import/export
- XLSX import/export
- Validation engine
- Bulk update
- Snapshots
- Baselines and diffs

Do not be polite. Identify contradictions clearly.

Deliverables:

1. Create or update docs/CURRENT_STATE_MATRIX.md.
2. Create a prioritized list of contradictions to fix.
3. Recommend which docs should be rewritten, split, archived, or deleted.
4. Do not change implementation code unless the user explicitly asks for fixes after the audit.
```

---

## Prompt 3 - Are we overbuilding?

```text
Act as a pragmatic startup CTO.

Review the SR Onestream Dim Builder roadmap and current feature set.

Tell me whether we are overbuilding.

Separate the product into:

1. Core must-have features for a successful internal pilot
2. Must-have features for production enterprise use
3. Nice-to-have features
4. Features that should be deferred
5. Features that may distract from product-market fit

Evaluate whether each feature directly supports the main user journey:

Create/import metadata -> edit -> validate -> compare -> package -> export -> deploy to OneStream.

Be very strict. Recommend the smallest version of the product that can prove real value.

Deliverables:

1. Create or update docs/ROADMAP_TRIAGE.md.
2. Create a defer list for features that are too early.
3. Create a pilot MVP scope.
```

---

## Prompt 4 - OneStream XML correctness review

Use this before trusting the tool for real metadata deployment.

```text
You are a OneStream metadata XML expert and QA lead.

Review the SR Onestream Dim Builder XML import and export implementation.

Assess whether the generated XML is safe and reliable for OneStream metadata workflows.

Check the following:

1. Dimension structure correctness
2. Member property mapping
3. Parent-child relationship mapping
4. Relationship ordering
5. Unknown XML preservation
6. Varying property handling
7. Cube/scenario/time context handling
8. Text properties
9. Alias properties
10. Formula properties
11. Aggregation/weight/sign logic
12. OneStream load method compatibility
13. Round-trip import/export behavior
14. Edge cases that could corrupt metadata
15. Whether exported XML matches known-good OneStream samples

Create a test plan with required XML fixtures.

Classify each finding as:

- Blocker before production
- Required before pilot
- Important but can wait
- Documentation-only issue

Do not assume correctness without fixture evidence.

Deliverables:

1. Create or update docs/XML_CORRECTNESS_REVIEW.md.
2. Create or update tests/fixtures/xml/README.md with required fixture cases.
3. Add missing tests only if the repository already has a suitable test structure.
4. If adding tests, keep them focused on round-trip import/export and validation safety.
```

---

## Prompt 5 - XLSX workbook reliability review

Use this if workbook import/export is part of the real customer workflow.

```text
Act as a QA engineer specializing in Excel-driven metadata tools.

Review the SR Onestream Dim Builder XLSX import/export logic.

Assess whether the workbook workflow is reliable enough for real users.

Evaluate:

1. Supported workbook templates
2. Required sheets
3. Required columns
4. Optional columns
5. Missing value handling
6. Duplicate member handling
7. Duplicate relationship handling
8. Formula cell handling
9. Hidden sheet behavior
10. Data type conversion
11. Date/time/culture issues
12. Large workbook performance
13. Browser upload behavior
14. Error messages for invalid workbooks
15. Exported workbook usability

Create a fixture-based test suite recommendation.

Include examples of malformed workbooks that should be tested.

Deliverables:

1. Create or update docs/XLSX_RELIABILITY_REVIEW.md.
2. Create or update tests/fixtures/xlsx/README.md with required fixture cases.
3. Add tests only where practical and consistent with the existing test framework.
```

---

## Prompt 6 - Validation engine completeness review

Use this to make sure validation is genuinely useful, not cosmetic.

```text
You are a metadata governance and validation specialist.

Review the SR Onestream Dim Builder validation engine.

Determine whether it catches the problems that would actually block or damage OneStream metadata deployments.

Evaluate validation coverage for:

1. Invalid dimension names
2. Invalid member names
3. Duplicate members
4. Duplicate relationships
5. Circular hierarchies
6. Orphan members
7. Missing required properties
8. Invalid property values
9. Invalid parent-child relationships
10. Invalid aggregation settings
11. Invalid varying properties
12. Unknown XML fields
13. Export-blocking issues
14. Warning-only issues
15. False positives
16. False negatives

For each validation rule, provide:

- Rule name
- Why it matters
- Current implementation evidence
- Example failing input
- Expected error message
- Severity recommendation
- Whether export should be blocked

Then recommend the top 10 validation rules still missing.

Deliverables:

1. Create or update docs/VALIDATION_COVERAGE_REVIEW.md.
2. Add focused validation tests for high-risk missing coverage, if appropriate.
3. Do not weaken existing validation to make tests pass.
```

---

## Prompt 7 - Security model reconciliation

Use this because the docs may be inconsistent around Basic Auth, JWT, OIDC, RBAC, and local-first mode.

```text
Act as an enterprise application security reviewer.

Review the SR Onestream Dim Builder security documentation and implementation.

Resolve the actual current security model.

Answer these questions:

1. Is authentication currently implemented?
2. Is it Basic Auth, JWT, local credentials, OIDC, or something else?
3. Is authorization implemented?
4. Are project-level permissions implemented?
5. Is RBAC implemented?
6. Are sessions implemented?
7. Are refresh tokens implemented?
8. Are API keys implemented?
9. Are audit logs tied to real users?
10. Are uploads protected?
11. Is CSRF protection required?
12. Are secrets handled safely?
13. Are exported files access-controlled?
14. Are dangerous admin actions protected?
15. Is the app safe for localhost only, internal network, or public deployment?

Create a corrected security model document with:

- Current state
- Supported deployment modes
- Known gaps
- Required changes before internal pilot
- Required changes before enterprise production
- Documentation corrections needed

Do not allow the docs to claim enterprise security unless the code proves it.

Deliverables:

1. Create or update docs/SECURITY_MODEL_CURRENT.md.
2. List every security-related documentation contradiction.
3. Add security tests only if there is existing auth/security implementation to test.
```

---

## Prompt 8 - Production readiness review

Use this before any shared deployment.

```text
Act as a production readiness reviewer.

Review SR Onestream Dim Builder for deployment readiness.

Assess the following:

1. Configuration management
2. Environment variables
3. Secrets handling
4. Database location and persistence
5. SQLite backup strategy
6. Restore strategy
7. Migration strategy
8. Logging
9. Error handling
10. Health checks
11. File upload limits
12. File retention
13. Export retention
14. Audit retention
15. Concurrent user behavior
16. Transaction safety
17. Performance under realistic metadata size
18. Deployment topology
19. Rollback plan
20. Disaster recovery

For each item, mark:

- Ready
- Partially ready
- Not ready
- Unknown

Then create a production readiness checklist ordered by priority.

Separate requirements for:

- Local developer use
- Internal pilot
- Department/team deployment
- Enterprise production

Deliverables:

1. Create or update docs/PRODUCTION_READINESS_REVIEW.md.
2. Create a go/no-go checklist for pilot and production.
3. Do not mark an item ready without code, config, tests, or operational evidence.
```

---

## Prompt 9 - Release package and rollback review

Use this because release packaging is a major differentiator and a major risk.

```text
You are a release management architect for financial systems.

Review SR Onestream Dim Builder change sets and release package features.

Assess whether the release package workflow is reliable enough for governed metadata deployment.

Evaluate:

1. Change set creation
2. Change set approval
3. Baseline comparison
4. Additive package generation
5. Property update package generation
6. Relationship add/delete package generation
7. Move/copy handling
8. Break/build hierarchy handling
9. Full export package generation
10. Rollback data capture
11. Rollback XML generation
12. Human-readable package manifest
13. Deployment instructions
14. Audit trail
15. Approval trail
16. Package reproducibility

Clearly distinguish between:

- UI records the selected mode
- Backend stores the mode
- Export XML actually reflects the selected mode
- Rollback XML is actually generated

Provide a list of blockers before this can be called release-ready.

Deliverables:

1. Create or update docs/RELEASE_PACKAGE_REVIEW.md.
2. Add or recommend tests for package mode behavior.
3. Identify any misleading UI labels or documentation claims.
```

---

## Prompt 10 - Data model and migration review

```text
Act as a database architect.

Review the SR Onestream Dim Builder SQLite schema and persistence layer.

Evaluate whether the data model supports the intended product safely.

Review:

1. Projects
2. Dimensions
3. Members
4. Relationships
5. Properties
6. Varying properties
7. Unknown XML preservation
8. Snapshots
9. Baselines
10. Diff runs
11. Change sets
12. Release packages
13. Audit logs
14. Bulk update jobs
15. Validation issues
16. Users and roles, if present
17. Migration strategy
18. Indexes
19. Constraints
20. Transaction boundaries

Identify:

- Data integrity risks
- Missing constraints
- Tables that appear planned but unused
- Schema contradictions with documentation
- Migration risks
- Performance risks
- Backup/restore implications

Recommend the minimum database hardening required before pilot and before production.

Deliverables:

1. Create or update docs/DATABASE_REVIEW.md.
2. Propose migration strategy options.
3. Add database integrity tests only where safe and practical.
```

---

## Prompt 11 - API review

```text
Act as a senior backend API reviewer.

Review the SR Onestream Dim Builder API routes, controllers, validation, error handling, and documentation.

Evaluate:

1. Route naming consistency
2. Request validation
3. Response shape consistency
4. Error response consistency
5. Status code correctness
6. Authentication enforcement
7. Authorization enforcement
8. Project scoping
9. File upload safety
10. Export behavior
11. Long-running operation handling
12. Bulk update preview/apply separation
13. Snapshot restore behavior
14. Diff run behavior
15. Release package behavior
16. Audit logging
17. API documentation accuracy

For each API area, identify:

- Current behavior
- Risk
- Missing tests
- Recommended fix
- Whether this blocks pilot or production

Deliverables:

1. Create or update docs/API_REVIEW.md.
2. Add API tests for high-risk gaps where the existing test framework supports it.
3. Recommend API documentation corrections.
```

---

## Prompt 12 - Frontend UX readiness review

```text
Act as a UX reviewer for enterprise metadata management tools.

Review the SR Onestream Dim Builder frontend.

Assess whether a OneStream administrator can efficiently complete these workflows:

1. Create a project
2. Import metadata
3. Navigate dimensions
4. Add/edit members
5. Add/edit relationships
6. Understand validation errors
7. Fix validation errors
8. Preview bulk changes
9. Apply bulk changes
10. Compare against a baseline
11. Create a release package
12. Export XML/XLSX/CSV/JSON
13. Restore a snapshot
14. Understand what is safe to deploy

Evaluate:

- Information architecture
- Grid usability
- Error visibility
- Empty states
- Loading states
- Undo/recovery
- Accessibility
- Keyboard usability
- Mobile/tablet practicality
- User confidence before export

Recommend the top UX improvements that would most increase trust and adoption.

Deliverables:

1. Create or update docs/UX_READINESS_REVIEW.md.
2. Identify quick UX wins for pilot readiness.
3. Identify UX issues that could cause user mistakes or metadata risk.
```

---

## Prompt 13 - Testing strategy

```text
Act as a QA automation lead.

Review the SR Onestream Dim Builder test suite.

Create a test strategy that proves the product is safe for metadata lifecycle management.

Include:

1. Unit tests
2. Integration tests
3. API tests
4. Frontend component tests
5. End-to-end tests
6. XML fixture tests
7. XLSX fixture tests
8. Snapshot restore tests
9. Diff/baseline tests
10. Bulk update preview/apply tests
11. Release package tests
12. Permission/security tests
13. Performance tests
14. Regression tests
15. Smoke tests for deployment

For each test category, provide:

- Purpose
- Current coverage, if known
- Missing tests
- Priority
- Example test cases
- Required fixtures

Then create a 30-day QA hardening plan.

Deliverables:

1. Create or update docs/QA_STRATEGY.md.
2. Create a prioritized test backlog.
3. Add high-value tests only if they are low-risk and align with current code structure.
```

---

## Prompt 14 - Definition of Done for a feature

Use this for every feature before calling it complete.

```text
Act as a strict engineering manager.

For the feature below, create a Definition of Done.

Feature:
[Describe feature here]

The Definition of Done must include:

1. User story
2. Functional requirements
3. Non-functional requirements
4. API requirements
5. Frontend requirements
6. Database requirements
7. Security requirements
8. Validation requirements
9. Audit requirements
10. Error handling requirements
11. Test requirements
12. Documentation requirements
13. Demo acceptance criteria
14. Production readiness criteria
15. Explicit non-goals

Also identify what evidence is required before we can mark this feature as implemented.

Do not allow vague acceptance criteria.

Deliverables:

1. Create or update a feature-specific Definition of Done document.
2. Recommend tests required before merge.
3. Recommend documentation updates required before release.
```

---

## Prompt 15 - Sprint planning

Use this before each sprint.

```text
Act as a product owner and technical lead.

Given the current state of SR Onestream Dim Builder, recommend the next sprint backlog.

Optimize for proving the core product value:

Create/import metadata -> edit -> validate -> compare -> package -> export.

Create a sprint plan with:

- Sprint goal
- Top priorities
- User stories
- Acceptance criteria
- Engineering tasks
- QA tasks
- Documentation tasks
- Risks
- Dependencies
- What not to work on this sprint

Prioritize features that reduce production risk, improve OneStream correctness, or increase user trust.

Avoid roadmap expansion unless the core workflow is already proven.

Deliverables:

1. Create or update docs/NEXT_SPRINT_PLAN.md.
2. Include a small number of high-impact tasks.
3. Include explicit non-goals for the sprint.
```

---

## Prompt 16 - Architecture decision review

Use this whenever making a major technical choice.

```text
Act as an architecture review board.

Evaluate this proposed architecture decision for SR Onestream Dim Builder:

Decision:
[Describe decision]

Context:
[Describe why we are considering it]

Options:
[List options]

Evaluate each option across:

1. Simplicity
2. Reliability
3. Security
4. Maintainability
5. OneStream metadata correctness
6. Local-first compatibility
7. Future enterprise compatibility
8. Testing impact
9. Deployment impact
10. Migration impact
11. Cost
12. Risk

Recommend one option.

Also provide:

- Decision record summary
- Tradeoffs
- Reversibility
- Implementation plan
- Risks to monitor
- Tests required

Deliverables:

1. Create or update docs/adr/ADR-[number]-[short-title].md.
2. Do not implement the decision unless requested.
```

---

## Prompt 17 - Documentation cleanup

Use this to fix documentation inconsistencies.

```text
Act as a technical documentation editor and product auditor.

Review all SR Onestream Dim Builder documentation.

Identify documentation that is:

1. Accurate
2. Outdated
3. Contradictory
4. Aspirational but written as implemented
5. Missing
6. Too detailed for current state
7. Too vague for implementation
8. Risky from a sales or compliance perspective

Create a documentation cleanup plan.

For each document, provide:

- Current purpose
- Problems found
- Recommended action: keep, rewrite, split, archive, or delete
- Specific sections to correct
- Source of truth it should align with

Then propose a clean documentation structure with these categories:

- Current product
- Architecture
- API
- User guide
- Admin/deployment guide
- Security model
- QA/test evidence
- Roadmap
- Future concepts

Deliverables:

1. Create or update docs/DOCUMENTATION_CLEANUP_PLAN.md.
2. Identify documents that should be archived.
3. Recommend a source-of-truth documentation structure.
```

---

## Prompt 18 - Stakeholder honesty review

Use this before showing the project to executives, clients, or investors.

```text
Act as a skeptical executive stakeholder.

Review the SR Onestream Dim Builder product narrative.

Identify claims that are strong, weak, unsupported, or risky.

Separate the messaging into:

1. Safe claims we can confidently make today
2. Claims we can make only for an internal pilot
3. Claims that require more evidence
4. Claims we should not make yet
5. Claims that could create credibility risk

Focus especially on:

- Production readiness
- Enterprise readiness
- Security
- AI features
- OneStream compatibility
- Release package automation
- Rollback support
- Competitive differentiation
- Governance capabilities

Rewrite the product positioning so it is compelling but honest.

Deliverables:

1. Create or update docs/STAKEHOLDER_MESSAGING_REVIEW.md.
2. Provide safe demo language.
3. Provide claims to avoid until verified.
```

---

## Prompt 19 - Pilot readiness assessment

Use this when preparing for the first real users.

```text
Act as a pilot launch manager.

Create a pilot readiness assessment for SR Onestream Dim Builder.

Assume the pilot users are OneStream administrators or metadata owners.

Evaluate whether the product is ready for a controlled pilot.

Check:

1. Installation process
2. Sample project setup
3. Import workflow
4. Manual editing workflow
5. Validation workflow
6. Export workflow
7. Known limitations
8. Error recovery
9. User documentation
10. Support process
11. Feedback capture
12. Data safety
13. Backup/restore
14. Security expectations
15. Success metrics

Create:

- Pilot scope
- Pilot exclusions
- Entry criteria
- Exit criteria
- User tasks
- Feedback questions
- Risk mitigation plan
- Go/no-go recommendation

Deliverables:

1. Create or update docs/PILOT_READINESS_ASSESSMENT.md.
2. Create a pilot user task script.
3. Create a pilot feedback form outline.
```

---

## Prompt 20 - Success metrics

Use this to define whether the product is actually working.

```text
Act as a product strategy lead.

Define success metrics for SR Onestream Dim Builder.

The product goal is to improve OneStream metadata creation, maintenance, validation, comparison, packaging, and export.

Create metrics for:

1. User adoption
2. Time saved
3. Metadata quality
4. Validation effectiveness
5. Export success rate
6. XML round-trip reliability
7. Release package accuracy
8. Error reduction
9. User confidence
10. Governance improvement
11. Support burden
12. Performance
13. Production readiness

For each metric, provide:

- Metric name
- Why it matters
- How to measure it
- Target for internal pilot
- Target for production readiness
- Data source
- Review frequency

Also recommend the top 5 metrics we should track first.

Deliverables:

1. Create or update docs/SUCCESS_METRICS.md.
2. Recommend where metrics can be captured from existing logs, tests, or user feedback.
```

---

## Prompt 21 - Weekly project steering report

Use this every week.

```text
Act as the project steering committee for SR Onestream Dim Builder.

Based on the latest code, docs, tests, and open issues, produce a weekly steering report.

Include:

1. What improved this week
2. What became riskier this week
3. What is blocked
4. What decisions are needed
5. Whether we are still aligned to the core product goal
6. Whether the roadmap is expanding too much
7. Whether documentation matches implementation
8. Whether test evidence improved
9. Whether OneStream correctness improved
10. Whether production readiness improved

Use this format:

- Overall status: Green / Yellow / Red
- Top 3 wins
- Top 3 risks
- Top 3 decisions needed
- Top 5 recommended actions
- Features to pause
- Features to accelerate
- Features requiring proof

Deliverables:

1. Create or update docs/WEEKLY_STEERING_REPORT.md.
2. Keep the report evidence-based.
3. Call out any documentation claims that became less trustworthy.
```

---

## Prompt 22 - Red-team review

Use this when you want the project challenged aggressively.

```text
Act as a red-team reviewer.

Your job is to find reasons SR Onestream Dim Builder could fail.

Challenge the product from these angles:

1. User adoption failure
2. Incorrect OneStream XML
3. Metadata corruption
4. Weak validation
5. Poor UX
6. Overcomplicated roadmap
7. Security weakness
8. Unsupported enterprise claims
9. Poor test coverage
10. Documentation contradictions
11. Deployment fragility
12. Data loss risk
13. Performance limitations
14. Competitive weakness
15. Maintenance burden

For each risk, explain:

- How it could happen
- How likely it is
- How severe it would be
- How to detect it early
- How to prevent it
- Whether it blocks pilot or production

Be direct and skeptical.

Deliverables:

1. Create or update docs/RED_TEAM_REVIEW.md.
2. Include a prioritized risk register.
3. Identify which risks must be mitigated before pilot.
```

---

## Prompt 23 - Green-team success plan

Use this after the red-team review to focus on practical solutions.

```text
Act as a green-team product and engineering advisor.

Take the red-team risks for SR Onestream Dim Builder and convert them into a practical success plan.

For each major risk, provide:

- Mitigation
- Owner
- Priority
- Effort estimate: Small / Medium / Large
- Success evidence
- Test required
- Documentation required
- Deadline recommendation

Then create a phased plan:

Phase 1: Make the core workflow trustworthy
Phase 2: Make the product pilot-ready
Phase 3: Make the product production-ready
Phase 4: Add enterprise differentiators
Phase 5: Add advanced intelligence and automation

Deliverables:

1. Create or update docs/GREEN_TEAM_SUCCESS_PLAN.md.
2. Convert risk mitigation into actionable backlog items.
3. Keep the first phase focused on the core workflow only.
```

---

## Prompt 24 - Core workflow proof

Use this as the most important product validation prompt.

```text
Act as a hands-on QA lead and product owner.

Prove whether the following SR Onestream Dim Builder workflow works end to end:

1. Create a project
2. Import or create dimensions
3. Add members
4. Add relationships
5. Edit properties
6. Run validation
7. Fix validation errors
8. Create a baseline
9. Make changes
10. Run a diff
11. Create a change set
12. Create a release package
13. Export XML
14. Export XLSX
15. Restore a snapshot

For each step, provide:

- Expected user action
- Expected system behavior
- API calls involved
- Database changes
- UI confirmation
- Validation checks
- Test evidence
- Failure modes
- Recovery path

At the end, give a go/no-go recommendation for using this workflow in a real pilot.

Deliverables:

1. Create or update docs/CORE_WORKFLOW_PROOF.md.
2. Add or recommend automated tests for any unproven step.
3. Clearly label steps that are implemented, partial, or unverified.
```

---

## Prompt 25 - What should we build next?

Use this when deciding priorities.

```text
Act as a product strategist and technical architect.

Given the current SR Onestream Dim Builder state, recommend what we should build next.

Rank possible next work by:

1. User value
2. Risk reduction
3. OneStream correctness
4. Production readiness
5. Demo value
6. Engineering effort
7. Dependency impact
8. Strategic importance

Use this scoring table:

- 5 = very high
- 3 = medium
- 1 = low

Then recommend:

- Top 5 things to build next
- Top 5 things to fix next
- Top 5 things to test next
- Top 5 things to document next
- Top 5 things to defer

Do not prioritize flashy features over core reliability.

Deliverables:

1. Create or update docs/NEXT_ACTIONS.md.
2. Make the recommendations evidence-based.
3. Tie every recommendation back to the core workflow or production risk.
```

---

# Suggested first Codex session

Copy this whole block into Codex after opening the repository.

```text
Use the SR Onestream Dim Builder Codex Prompt Pack.

Start with Prompt 0 and Prompt 2.

Your first mission is to produce an evidence-based current-state truth audit.

Do not implement new features yet.

Inspect the repository, docs, tests, API routes, frontend routes, shared modules, configuration, database schema, and package scripts.

Create or update docs/CURRENT_STATE_MATRIX.md with:

- Feature
- Claimed documentation status
- Actual implementation status
- Evidence from source code
- Evidence from tests
- API route or UI location
- Database tables involved
- Status: Implemented / Partial / Planned / Not found / Contradictory
- Risk level
- Recommended documentation update

Pay special attention to contradictions around:

- Basic Auth versus JWT versus OIDC
- RBAC and project-level permissions
- SQLite implementation details
- AI features
- connectors
- reporting
- multi-tenancy
- offline sync
- collaboration
- release package mode-specific XML
- rollback XML
- OneStream XML fidelity
- XLSX import/export evidence

After creating the matrix, produce a short summary with:

1. Top 10 verified implemented features
2. Top 10 unverified or contradictory claims
3. Top 10 risks before pilot
4. Recommended next Codex session prompt

Do not change production code in this session unless needed to fix broken tests caused by documentation-only changes.
```

---

# Suggested second Codex session

```text
Use the SR Onestream Dim Builder Codex Prompt Pack.

Start with Prompt 24, Prompt 4, and Prompt 6.

Your mission is to prove the core metadata workflow and identify the highest-risk correctness gaps.

Focus on:

- Create project
- Import or create dimensions
- Add members
- Add relationships
- Edit properties
- Validate
- Fix validation issues
- Create baseline
- Diff changes
- Create change set
- Create release package
- Export XML
- Export XLSX
- Restore snapshot

Create or update:

- docs/CORE_WORKFLOW_PROOF.md
- docs/XML_CORRECTNESS_REVIEW.md
- docs/VALIDATION_COVERAGE_REVIEW.md

Add focused tests only if they fit the existing test structure and are low-risk.

Do not expand the roadmap.

End with a go/no-go recommendation for a controlled internal pilot.
```

---

# Suggested third Codex session

```text
Use the SR Onestream Dim Builder Codex Prompt Pack.

Start with Prompt 7 and Prompt 8.

Your mission is to reconcile the security model and production readiness story.

Create or update:

- docs/SECURITY_MODEL_CURRENT.md
- docs/PRODUCTION_READINESS_REVIEW.md

Identify what is actually implemented versus planned for:

- Authentication
- Authorization
- Project-level permissions
- RBAC
- Sessions
- Refresh tokens
- OIDC / SSO
- API keys
- Audit user identity
- Upload protection
- Export file access control
- CSRF protection
- Secrets management
- Environment configuration
- Database migrations
- Backup and restore
- Retention policies
- Deployment topology

Do not claim enterprise readiness unless code, configuration, and tests prove it.

End with:

1. Local-only readiness assessment
2. Internal pilot readiness assessment
3. Department deployment readiness assessment
4. Enterprise production readiness assessment
5. Top 10 blockers
```

---

# Suggested fourth Codex session

```text
Use the SR Onestream Dim Builder Codex Prompt Pack.

Start with Prompt 15 and Prompt 25.

Your mission is to create the next sprint plan based on evidence from the audits.

Create or update:

- docs/NEXT_SPRINT_PLAN.md
- docs/NEXT_ACTIONS.md

Prioritize work that improves:

- OneStream XML correctness
- validation coverage
- core workflow reliability
- documentation truthfulness
- test evidence
- pilot readiness
- production risk reduction

Explicitly defer:

- AI features
- marketplace features
- broad integrations
- multi-tenancy
- collaboration
- offline sync
- advanced enterprise automation

unless the audits prove the core workflow is already trustworthy.
```

---

# End of prompt pack
