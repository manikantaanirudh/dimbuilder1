# Next Sprint Plan — Internal Pilot Readiness

**Date:** 2026-05-25  
**Sprint Goal:** Make the SR Dim Builder safe, reliable, and demonstrable for a controlled internal pilot with 5-10 OneStream practitioners on a shared network.

---

## Top 5 Priorities (Ranked by Pilot Readiness Impact)

| # | Priority | Why |
|---|----------|-----|
| 1 | **Fix core workflow gaps** (member edit API, diff route) | Pilot users will hit these within the first 30 minutes of use. 2 of 16 workflow steps are broken. |
| 2 | **Enable network-safe authentication** | The app ships with auth OFF and a placeholder JWT secret. Putting 5-10 users on a network without this is a security incident. |
| 3 | **Add missing "easy win" validation rules** | ROOT_MEMBER_MISSING, SELF_REFERENCING_RELATIONSHIP, and leading/trailing whitespace — these catch real OneStream import failures that pilot users will encounter. |
| 4 | **Fix the failing tests and add round-trip XML test** | 4 tests fail due to missing fixture. No import→export→compare test exists. These undermine confidence in the core export path. |
| 5 | **Create pilot deployment guide and operator docs** | Pilot operators need a one-page checklist to configure auth, CORS, TLS proxy, backups. Without this, deployment will be ad-hoc and insecure. |

---

## User Stories

### Story 1: Practitioner edits members via the grid and sees changes in diff
**As a** OneStream practitioner,  
**I want to** edit member properties in the grid and run a diff against my baseline,  
**So that** I can review exactly what changed before exporting.

**Acceptance Criteria:**
- [ ] Member PATCH API accepts the same body format the UI sends (fix 500 error on raw API call)
- [ ] Diff route is discoverable and documented (resolve 404 on `/api/projects/{id}/diffs`)
- [ ] Diff items show old/new values for modified members
- [ ] Change set can be created from diff results

---

### Story 2: Team accesses the tool securely on internal network
**As a** pilot administrator,  
**I want to** deploy the Dim Builder on our internal network with authentication enabled,  
**So that** each user has their own identity and audit actions are attributable.

**Acceptance Criteria:**
- [ ] `auth.enabled: true` with `local` strategy works end-to-end (register, login, session)
- [ ] JWT_SECRET is read from environment variable (not the placeholder)
- [ ] CORS is restricted to the configured client origin
- [ ] Deployment guide covers: reverse proxy (nginx/Caddy), TLS, env vars, SQLite WAL mode
- [ ] Default admin credentials are set via env vars, not hardcoded in config

---

### Story 3: Practitioner imports Excel workbook and gets immediate validation feedback
**As a** OneStream practitioner,  
**I want to** import my dimension workbook and immediately see validation issues ranked by severity,  
**So that** I can fix problems before attempting a OneStream import.

**Acceptance Criteria:**
- [ ] Workbook parser tests pass (fixture file restored or recreated)
- [ ] ROOT_MEMBER_MISSING validation fires when no Root member exists
- [ ] SELF_REFERENCING_RELATIONSHIP catches parent===child
- [ ] MEMBER_NAME_LEADING_TRAILING_WHITESPACE catches silent matching failures
- [ ] Validation results display in the UI with clear severity indicators

---

### Story 4: Practitioner exports XML and re-imports without data loss
**As a** OneStream practitioner,  
**I want to** export XML, re-import it into the Dim Builder, and see zero unexpected changes,  
**So that** I trust the tool isn't corrupting my metadata.

**Acceptance Criteria:**
- [ ] Round-trip test exists: import sample XML → export → re-import → compare (zero diff on structure)
- [ ] Unknown XML attributes/elements survive the round-trip
- [ ] Entity ownership fields (PercentConsolidation, PercentOwnership) round-trip correctly
- [ ] Varying properties with explicit context round-trip correctly

---

### Story 5: Pilot operator can monitor and recover from issues
**As a** pilot operator/admin,  
**I want to** have database backups, WAL mode enabled, and basic health monitoring,  
**So that** I can recover from issues without losing practitioner work.

**Acceptance Criteria:**
- [ ] SQLite WAL mode enabled at database initialization (`PRAGMA journal_mode=WAL`)
- [ ] Health endpoint checks database connectivity (not just `{ ok: true }`)
- [ ] Backup strategy documented (simple file copy of `data/app.db` while WAL is enabled)
- [ ] `.env.example` file documents all required/optional environment variables

---

## Engineering Tasks

### E1: Fix Member Edit API (Story 1)
- Investigate the PATCH `/api/projects/{id}/members/{memberId}` route
- Identify expected body format vs. what was sent in the workflow proof
- Add/fix Zod schema validation to match UI payload
- Add API test case for member property edit

### E2: Fix/Document Diff Route (Story 1)
- Trace the diff execution path in the codebase (likely `/api/projects/{id}/baselines/{baselineId}/diff`)
- Ensure route is correctly mounted and returns diff items
- Add API test for: create baseline → modify → run diff → verify items

### E3: Enable SQLite WAL Mode (Story 5)
- Add `PRAGMA journal_mode=WAL` to `src/server/db/database.ts` after DB open
- Verify WAL mode is active via `PRAGMA journal_mode` query in health check
- Test that concurrent reads don't block during writes

### E4: Enhance Health Endpoint (Story 5)
- Extend `GET /api/health` to execute a trivial DB query (e.g., `SELECT 1`)
- Return `{ ok: true, db: "connected" }` on success, `{ ok: false, db: "error" }` on failure
- Keep endpoint unauthenticated (already correct)

### E5: Add 3 Easy Validation Rules (Story 3)
- `ROOT_MEMBER_MISSING`: Check each dimension has at least one member with key matching configured root name (default "Root")
- `SELF_REFERENCING_RELATIONSHIP`: Check parentKey !== childKey on all relationships
- `MEMBER_NAME_LEADING_TRAILING_WHITESPACE`: Trim check on all memberKey values

### E6: Authentication Hardening (Story 2)
- Verify `auth.enabled: true` + `strategy: local` works end-to-end
- Ensure JWT_SECRET env var override works (test with non-default value)
- Verify CORS rejection when origin doesn't match configured `corsOrigins`
- Mask admin password in startup logs (currently logged in plaintext)

### E7: Add Upload File Validation (Security)
- Add multer `fileFilter` to restrict to `.xlsx` and `.xml` extensions
- Add multer `limits: { fileSize: 50 * 1024 * 1024 }` (50MB)
- Return 400 with descriptive error on rejection

---

## QA Tasks

### Q1: Fix Failing Tests
- Restore or recreate the missing fixture file `XF Dimensions Template - 29.04.2026.xlsx`
- Verify all 541 tests pass (currently 537/541)
- Target: 0 test failures

### Q2: Add Round-Trip XML Test (Story 4)
- Write test: load `metadata/sample_xml.xml` → import → export → re-import → compare member/relationship counts and key property values
- Verify unknown XML elements survive round-trip
- Verify entity ownership fields are preserved

### Q3: Workflow Proof Regression Test
- Script the 16-step workflow proof as an automated integration test
- Steps 1-8, 10, 14-16 should all pass programmatically
- Steps 9, 11 should pass after E1/E2 fixes

### Q4: Auth Flow Integration Test
- Test: register → login → access protected route → refresh → logout
- Test: access protected route without token → 401
- Test: access admin route as non-admin → 403

### Q5: Validation Rule Smoke Test
- Create dimension with known issues (circular ref, restricted chars, missing root)
- Run validation → verify each expected issue appears with correct severity
- Verify export is blocked when errors exist

---

## Documentation Tasks

### D1: Pilot Deployment Guide (`docs/PILOT_DEPLOYMENT_GUIDE.md`)
- Prerequisites: Node.js 22+, nginx/Caddy, TLS cert
- Step-by-step: clone, build, configure `.env`, set up proxy, start
- Configuration reference: all env vars with descriptions
- Backup strategy: WAL mode + cron file copy
- Troubleshooting: common issues and fixes

### D2: `.env.example` File
- All supported environment variables with comments
- Required vs. optional clearly marked
- Example values (not real secrets)

### D3: API Quick Reference
- Document the member edit PATCH body format
- Document the diff endpoint path and payload
- Document the baseline → diff → change set workflow
- Keep concise (1-2 pages max)

### D4: Safe Demo Script
- 10-minute scripted walkthrough covering: import Excel → view hierarchy → run validation → fix issue → export XML
- Use the "Safe Demo Language" from STAKEHOLDER_MESSAGING_REVIEW
- Explicitly note what NOT to demo (deploy to OneStream, "AI" features, multi-tenant)

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Pilot users expect OneStream deploy capability | High | High | Set expectations in pilot onboarding: "export XML for manual import." Add a clear "coming soon" state in the UI deploy section. |
| SQLite write contention with 5-10 concurrent users | Medium | Medium | Enable WAL mode (E3). Monitor for lock timeouts. Acceptable for pilot scale. |
| Pilot users label "AI" features as misleading | Medium | Medium | Rename to "Smart Suggestions" in UI before pilot. Use safe demo language. |
| Someone exposes app to internet without proxy | Low | Critical | Deployment guide makes reverse proxy a mandatory step. Default host stays `127.0.0.1`. |
| Missing fixture file masks a real parser regression | Low | Medium | Prioritize Q1 (fixture restore). If parser has regressed, fix before pilot. |
| Round-trip XML has subtle property formatting differences | Medium | Medium | Q2 will surface these. Fix any that would cause OneStream import failures. Cosmetic differences are acceptable. |

---

## Non-Goals (What NOT to Work On This Sprint)

| Item | Reason |
|------|--------|
| Real OneStream API connector | Requires OneStream environment access we don't have. Mock is fine for pilot — users export XML files manually. |
| Multi-tenant data isolation | Not needed for a 5-10 person pilot on a single instance. Would require significant query refactoring. |
| WebSocket real-time collaboration | Polling presence is acceptable for pilot scale. WebSocket is a production concern. |
| PostgreSQL migration | SQLite with WAL mode handles pilot load. PostgreSQL is a production scaling concern. |
| CI/CD pipeline | Nice to have but pilot deployment is manual. Build it after pilot validates the product. |
| LLM/AI integration | Heuristic features work. Renaming them is sufficient. LLM integration is a post-pilot enhancement. |
| Email/push notifications | In-DB notifications are sufficient for pilot. Users check the app directly. |
| Horizontal scaling (Redis, multi-instance) | Single instance is fine for 5-10 users. |
| Performance/load testing | Pilot scale (5-10 users, <10K members) won't stress the system. Test after pilot. |
| Compliance reporting | Stub data acknowledged. Not needed for internal pilot — real compliance is a production requirement. |

---

## Sprint Metrics

| Metric | Target |
|--------|--------|
| Test pass rate | 541/541 (100%) |
| Core workflow steps passing | 16/16 |
| Validation rules (total) | 52+ (49 existing + 3 new) |
| Critical security items resolved | 5/5 (auth, JWT, CORS, upload validation, password masking) |
| Documentation pages created | 4 (deployment guide, .env.example, API reference, demo script) |
