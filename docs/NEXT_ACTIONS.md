# Next Actions — Prioritized Backlog

**Date:** 2026-05-25  
**Scoring:** 5=very high, 3=medium, 1=low  
**Effort is inverted:** 5=easy (hours), 3=moderate (1-2 days), 1=hard (week+)

---

## Scoring Criteria

| Dimension | What It Means |
|-----------|---------------|
| User Value | Direct benefit to a OneStream practitioner during the pilot |
| Risk Reduction | Reduces probability/impact of failure, data loss, or security incident |
| OneStream Correctness | Ensures exported XML will actually work in OneStream |
| Production Readiness | Moves toward sustainable operation beyond pilot |
| Demo Value | Makes the product more impressive in stakeholder demonstrations |
| Effort (inverted) | 5=trivial, 1=massive undertaking |

---

## Top 5 Things to BUILD Next

> Historical backlog. `ROOT_MEMBER_MISSING` is retired by the OneStream 9.2 validation catalog; inherited/system Root and None states are valid and are not export-blocking errors.

| # | Item | User | Risk | OS Corr | Prod | Demo | Effort | Total | Rationale |
|---|------|------|------|---------|------|------|--------|-------|-----------|
| 1 | **Retired: ROOT_MEMBER_MISSING validation rule** | — | — | — | — | — | — | — | OneStream 9.2 does not support treating missing local Root as a platform import error. |
| 2 | **SELF_REFERENCING_RELATIONSHIP validation** | 4 | 4 | 5 | 3 | 3 | 5 | **24** | parentKey===childKey is invalid, cycle detector may miss it, easy to implement. |
| 3 | **MEMBER_NAME_LEADING_TRAILING_WHITESPACE validation** | 5 | 4 | 5 | 3 | 2 | 5 | **24** | Causes silent "member not found" failures in OneStream. Practitioners import this from Excel constantly. |
| 4 | **Upload file type/size validation (multer filter)** | 2 | 5 | 1 | 5 | 1 | 5 | **19** | Prevents arbitrary file upload. 10 lines of code for meaningful security improvement. |
| 5 | **SQLite WAL mode** | 3 | 5 | 1 | 5 | 1 | 5 | **20** | One PRAGMA statement. Prevents write-lock contention for 5-10 concurrent users. Eliminates most common pilot failure mode. |

---

## Top 5 Things to FIX Next

| # | Item | User | Risk | OS Corr | Prod | Demo | Effort | Total | Rationale |
|---|------|------|------|---------|------|------|--------|-------|-----------|
| 1 | **Member PATCH API 500 error** | 5 | 4 | 3 | 4 | 5 | 4 | **25** | Core workflow step 9 fails. The UI works (correct body format) but API documentation/testing gap. Pilot users doing API work will hit this. |
| 2 | **Diff route 404** | 5 | 3 | 2 | 4 | 5 | 4 | **23** | Core workflow steps 11-13 blocked. Baseline→diff→change-set is a key governance story. |
| 3 | **Workbook parser test fixture missing** | 3 | 4 | 3 | 4 | 2 | 5 | **21** | 4 failing tests. May mask a real regression. Fixture restore is trivial if file exists elsewhere. |
| 4 | **JWT secret placeholder in shipping config** | 1 | 5 | 1 | 5 | 1 | 5 | **18** | `"change-me-in-production"` is the default. Any auth-enabled deployment without env var override is compromised. Add startup warning if default is detected. |
| 5 | **Admin password logged at startup** | 1 | 5 | 1 | 4 | 1 | 5 | **17** | Credentials in logs is a security anti-pattern. Mask with `***` or remove the log line. |

---

## Top 5 Things to TEST Next

| # | Item | User | Risk | OS Corr | Prod | Demo | Effort | Total | Rationale |
|---|------|------|------|---------|------|------|--------|-------|-----------|
| 1 | **XML round-trip test (import→export→compare)** | 4 | 4 | 5 | 4 | 3 | 3 | **23** | The #1 trust question: "Does export corrupt my data?" Only a round-trip test can answer this definitively. |
| 2 | **Auth flow integration test (register→login→protected→refresh→logout)** | 2 | 5 | 1 | 5 | 1 | 4 | **18** | Auth is disabled by default. When enabled for pilot, we need confidence it works end-to-end. No auth-specific integration test exists today. |
| 3 | **Validation engine edge cases (empty dimension, 0 members with relationships)** | 3 | 3 | 5 | 3 | 2 | 4 | **20** | VALIDATION_COVERAGE_REVIEW identified these gaps. Empty dimensions are common during early project setup. |
| 4 | **Special characters in member names (& < > " ' in XML export)** | 3 | 3 | 5 | 3 | 2 | 4 | **20** | XML_CORRECTNESS_REVIEW flagged this. `escapeXml()` exists but no test with actual special-char members through the full export path. |
| 5 | **Core workflow automated regression (16-step proof as test)** | 4 | 4 | 3 | 4 | 3 | 2 | **20** | The workflow proof is currently manual. Automating it as a test prevents regressions and serves as living documentation. |

---

## Top 5 Things to DOCUMENT Next

| # | Item | User | Risk | OS Corr | Prod | Demo | Effort | Total | Rationale |
|---|------|------|------|---------|------|------|--------|-------|-----------|
| 1 | **Pilot Deployment Guide** | 5 | 5 | 1 | 5 | 2 | 4 | **22** | Without this, pilot operators will deploy insecurely or not at all. Covers auth, TLS, backups, env vars. |
| 2 | **`.env.example` with all supported variables** | 4 | 4 | 1 | 5 | 1 | 5 | **20** | Standard practice. Prevents misconfiguration. Takes 15 minutes to create. |
| 3 | **Safe demo script (10-minute walkthrough)** | 3 | 3 | 2 | 2 | 5 | 4 | **19** | Prevents demo disasters. Uses verified-safe claims from STAKEHOLDER_MESSAGING_REVIEW. Keeps presenters on solid ground. |
| 4 | **API reference for diff/baseline/change-set workflow** | 4 | 2 | 2 | 3 | 3 | 4 | **18** | The 404 on diff route happened because the path wasn't documented. Prevents pilot user confusion. |
| 5 | **Known limitations / "What This Tool Does NOT Do"** | 3 | 4 | 2 | 3 | 3 | 5 | **20** | Proactively sets expectations. "Does not deploy to OneStream directly. Does not replace ACM for in-platform editing." Prevents disappointment. |

---

## Top 5 Things to DEFER

| # | Item | Why Defer | When to Revisit |
|---|------|-----------|-----------------|
| 1 | **Real OneStream API connector** | Requires OneStream environment access, API credentials, and significant integration work. Pilot users can manually import the exported XML. Mock is transparent about its limitations. | Post-pilot, when we have a test OneStream instance. |
| 2 | **Multi-tenant data isolation** | Tenant table exists but no filtering on queries. Fixing this requires touching every repository query. Pilot is single-tenant by nature (one team, one instance). | When/if the product is offered as a shared service to multiple clients. |
| 3 | **LLM integration for "AI" features** | Current heuristics work (duplicate detection, naming anomalies). Renaming to "Smart Suggestions" is sufficient. LLM adds external dependency, cost, and latency for marginal pilot benefit. | Post-pilot, evaluate whether users request natural-language capabilities. |
| 4 | **PostgreSQL migration** | SQLite with WAL mode handles 5-10 users easily. PostgreSQL requires schema migration tooling, connection pooling, and operational complexity. No user benefit at pilot scale. | When user count exceeds 20-30 concurrent or write contention is observed. |
| 5 | **WebSocket collaboration / real-time presence** | Polling presence with 30-second heartbeat is adequate for 5-10 users. WebSocket adds infrastructure complexity (sticky sessions, connection management) with no pilot-scale benefit. | When collaboration is identified as a key user need from pilot feedback. |

---

## Complete Backlog Scoring (All Identified Work Items)

### Validation Rules to Add

| Item | User | Risk | OS Corr | Prod | Demo | Effort | Total |
|------|------|------|---------|------|------|--------|-------|
| ROOT_MEMBER_MISSING (retired) | — | — | — | — | — | — | — |
| SELF_REFERENCING_RELATIONSHIP | 4 | 4 | 5 | 3 | 3 | 5 | **24** |
| MEMBER_NAME_LEADING_TRAILING_WHITESPACE | 5 | 4 | 5 | 3 | 2 | 5 | **24** |
| DUPLICATE_MEMBER_CASE_INSENSITIVE | 4 | 3 | 5 | 2 | 2 | 5 | **21** |
| MEMBER_NAME_STARTS_WITH_DIGIT | 3 | 2 | 4 | 2 | 2 | 5 | **18** |
| SCENARIO_TYPE_MISSING | 3 | 2 | 5 | 2 | 2 | 4 | **18** |
| HIERARCHY_MAX_DEPTH_EXCEEDED | 3 | 2 | 4 | 2 | 2 | 3 | **16** |
| DIMENSION_MISSING_FROM_PROJECT | 2 | 2 | 4 | 2 | 2 | 3 | **15** |
| CROSS_DIMENSION_CURRENCY_INVALID | 2 | 2 | 5 | 2 | 1 | 2 | **14** |
| CONSOLIDATION_METHOD_MISMATCH | 2 | 2 | 4 | 2 | 1 | 2 | **13** |

### Bug Fixes

| Item | User | Risk | OS Corr | Prod | Demo | Effort | Total |
|------|------|------|---------|------|------|--------|-------|
| Member PATCH 500 error | 5 | 4 | 3 | 4 | 5 | 4 | **25** |
| Diff route 404 | 5 | 3 | 2 | 4 | 5 | 4 | **23** |
| Workbook parser fixture | 3 | 4 | 3 | 4 | 2 | 5 | **21** |
| JWT secret startup warning | 1 | 5 | 1 | 5 | 1 | 5 | **18** |
| Admin password in logs | 1 | 5 | 1 | 4 | 1 | 5 | **17** |
| CORS wide-open by default | 1 | 4 | 1 | 4 | 1 | 5 | **16** |

### Infrastructure / Hardening

| Item | User | Risk | OS Corr | Prod | Demo | Effort | Total |
|------|------|------|---------|------|------|--------|-------|
| SQLite WAL mode | 3 | 5 | 1 | 5 | 1 | 5 | **20** |
| Upload file validation | 2 | 5 | 1 | 5 | 1 | 5 | **19** |
| Health check with DB verification | 2 | 4 | 1 | 5 | 1 | 5 | **18** |
| Upload cleanup (post-import unlink) | 1 | 3 | 1 | 4 | 1 | 4 | **14** |
| Export file retention/cleanup | 1 | 3 | 1 | 4 | 1 | 3 | **13** |
| Request correlation IDs | 1 | 2 | 1 | 4 | 1 | 3 | **12** |
| User identity in request logs | 1 | 2 | 1 | 4 | 1 | 4 | **13** |
| Helmet security headers | 1 | 3 | 1 | 4 | 1 | 5 | **15** |
| Docker-compose for pilot | 2 | 2 | 1 | 4 | 2 | 3 | **14** |
| CI/CD pipeline | 1 | 2 | 1 | 4 | 1 | 2 | **11** |

### Tests to Write

| Item | User | Risk | OS Corr | Prod | Demo | Effort | Total |
|------|------|------|---------|------|------|--------|-------|
| XML round-trip test | 4 | 4 | 5 | 4 | 3 | 3 | **23** |
| Validation edge cases | 3 | 3 | 5 | 3 | 2 | 4 | **20** |
| Special chars in XML export | 3 | 3 | 5 | 3 | 2 | 4 | **20** |
| Core workflow regression suite | 4 | 4 | 3 | 4 | 3 | 2 | **20** |
| Auth flow integration test | 2 | 5 | 1 | 5 | 1 | 4 | **18** |
| OIDC flow test (with mock IdP) | 1 | 3 | 1 | 4 | 1 | 2 | **12** |
| E2E browser test (Playwright) | 3 | 2 | 2 | 3 | 4 | 1 | **15** |
| Large file performance test | 2 | 2 | 2 | 3 | 2 | 2 | **13** |

### Features to Defer

| Item | User | Risk | OS Corr | Prod | Demo | Effort | Total | Verdict |
|------|------|------|---------|------|------|--------|-------|---------|
| OneStream real connector | 5 | 3 | 5 | 3 | 5 | 1 | **22** | DEFER — effort too high, requires external dependency |
| Multi-tenant isolation | 1 | 3 | 1 | 2 | 1 | 1 | **9** | DEFER — not needed for pilot |
| WebSocket presence | 2 | 1 | 1 | 2 | 3 | 2 | **11** | DEFER — polling sufficient |
| LLM chatbot integration | 2 | 1 | 1 | 1 | 3 | 1 | **9** | DEFER — heuristics work |
| PostgreSQL migration | 1 | 2 | 1 | 3 | 1 | 1 | **9** | DEFER — SQLite fine for pilot |
| Redis shared state | 1 | 1 | 1 | 3 | 1 | 2 | **9** | DEFER — single instance for pilot |
| Streaming exports | 1 | 2 | 1 | 3 | 1 | 2 | **10** | DEFER — pilot data sizes are small |
| Email/push notifications | 2 | 1 | 1 | 2 | 2 | 2 | **10** | DEFER — in-app notifications sufficient |
| VCS conflict resolution UI | 2 | 1 | 1 | 2 | 3 | 2 | **11** | DEFER — source-wins is acceptable for pilot |
| Automated rollback XML | 2 | 2 | 3 | 2 | 2 | 2 | **13** | DEFER — manual rollback from baseline is documented |

---

## Implementation Order Recommendation

Execute in this sequence to maximize pilot readiness with least dependency:

### Phase 1: Foundation (no dependencies, parallelize)
1. Fix workbook parser fixture (Q1) — unblocks 100% test pass
2. Enable SQLite WAL mode (E3) — one line, high impact
3. Add upload file validation (E7) — security quick win
4. Add startup warning if JWT secret is default — prevents insecure deployment
5. Mask admin password in logs — security hygiene

### Phase 2: Core Workflow (depends on Phase 1 for confidence)
6. Fix member PATCH API (E1) — unblocks workflow step 9
7. Fix diff route (E2) — unblocks workflow steps 11-13
8. Add 3 validation rules: ROOT, SELF_REF, WHITESPACE (E5) — high OneStream value

### Phase 3: Trust & Safety (depends on Phase 2 for tested code)
9. Add XML round-trip test (Q2) — proves export fidelity
10. Add auth flow integration test (Q4) — proves auth works before pilot
11. Verify auth enabled mode works end-to-end (E6) — pilot prerequisite

### Phase 4: Documentation (depends on Phase 2-3 for accurate content)
12. Create `.env.example` (D2) — quick reference
13. Write Pilot Deployment Guide (D1) — operator handbook
14. Write API quick reference for diff/baseline workflow (D3)
15. Create safe demo script (D4) — stakeholder protection

---

## Decision Log

| Decision | Rationale | Revisit When |
|----------|-----------|--------------|
| Don't build OneStream connector this sprint | No test environment. Pilot users can export XML and import manually. | Test OneStream instance becomes available |
| Rename "AI" to "Smart Suggestions" | Avoids credibility damage. Heuristics are genuinely useful — just not "AI". | LLM integration is prioritized |
| Keep SQLite for pilot | WAL mode handles 5-10 users. PostgreSQL adds ops complexity with no pilot benefit. | Write contention observed or user count exceeds 20 |
| Skip E2E browser tests this sprint | Integration tests cover API correctness. Browser tests are high-effort for incremental confidence. | After pilot validates core workflows |
| Don't fix multi-tenant this sprint | Single-instance, single-team pilot. Tenant isolation is a shared-service concern. | Product is offered to multiple isolated clients |
| Accept polling presence (no WebSocket) | 30-second heartbeat is adequate for 5-10 users who check in occasionally. | Users report collaboration friction |

---

## Summary

**This sprint is about trust, not features.** The product has 35 implemented features. What it needs for pilot is:

1. **Working core workflow** — fix 2 broken API paths
2. **Safe network deployment** — auth, secrets, CORS, TLS guidance  
3. **OneStream correctness** — 3 easy validation rules that catch real import failures
4. **Provable fidelity** — round-trip XML test
5. **Operator confidence** — deployment guide, backups, health check

No new features. No flashy demos. Just reliability and safety for the 5-10 people who will trust this tool with their dimension metadata.
