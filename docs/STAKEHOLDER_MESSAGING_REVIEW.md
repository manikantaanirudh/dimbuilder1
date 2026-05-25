# Stakeholder Messaging Review

**Project:** SR OneStream Dim Builder  
**Date:** 2026-05-25  
**Perspective:** Skeptical executive stakeholder  
**Purpose:** Classify all product claims by defensibility; prevent credibility damage in demos and materials  

---

## Claim Classification

### 1. Safe Claims We Can Confidently Make Today

These are verified with working code, passing tests, and live API proof:

| # | Claim | Evidence |
|---|-------|----------|
| 1 | Imports and exports OneStream-format XML with property fidelity | 13 XML tests passing, live API export verified, 100+ property dictionary, unknown XML preservation |
| 2 | 20+ validation rules purpose-built for OneStream naming/property conventions | `validationEngine.ts` (750 lines), `oneStreamValidation.ts`, live validation run confirmed |
| 3 | Visual hierarchy tree with search, expand/collapse, analytics | React component exists, hierarchy engine tested (cycle detection, orphans, levelized tables) |
| 4 | Imports from Excel workbooks with auto-detection of dimension type | `workbookParser.ts` (499 lines), schema-driven column mapping, alias resolution |
| 5 | Snapshot and restore — save project state at any point, roll back | Live API confirmed: create snapshot, restore with 12 dims/13 members round-tripped |
| 6 | Bulk update with 8 operations (set, clear, replace, regex, copy, derive) | `bulkUpdate.ts` tested, preview/apply/rollback workflow |
| 7 | Cross-dimension analysis: where-used, shared members, inheritance chains | `crossDimensionEngine.ts` (294 lines), 3 validation rule types, tested |
| 8 | Full RBAC with 4 roles and 14 permissions | Code + tests confirmed, permission matrix well-defined |
| 9 | OIDC/SSO ready with PKCE (Entra ID, Okta compatible) | `oidcStrategy.ts` fully implemented with proper state/PKCE flow |
| 10 | Works entirely locally — no internet required for editing/validation | SQLite local DB, localhost binding, no external service dependencies for core workflow |
| 11 | Exports to XML, XLSX, CSV, JSON formats | All four export paths live-tested |
| 12 | Migration parsers for Hyperion HFM, EPMA, SAP BPC, generic CSV | All 4 parsers implemented, tested, produce unified output |
| 13 | Multi-step approval workflows with auto-advance | Workflow engine (225 lines), self-approval prevention, role-based steps |
| 14 | Version control with branches, commits, diffs, merge | VCS engine tested, 3-way conflict detection implemented |
| 15 | Per-dimension quality scoring (property completeness, naming consistency) | Reporting engine calculates real scores from data |
| 16 | Configurable severity on validation rules; dismiss false positives | Validation supports severity levels, dismiss/restore verified in tests |
| 17 | Zero per-user licensing cost | Internal IP, no external SaaS dependency for core operation |

---

### 2. Claims Valid for Internal Pilot Only

Working but with caveats that limit scope to controlled environments:

| # | Claim | Caveat |
|---|-------|--------|
| 1 | "Enterprise authentication" | Auth is **disabled by default**. Must be manually enabled. JWT secret is a placeholder. Safe only after configuration. |
| 2 | "Handles real-world scale" | Tested with 209K-member dataset per email draft, but no formal load test. SQLite has single-writer lock. 5-15 concurrent users max without WAL mode. |
| 3 | "Audit trail for all operations" | Audit logging records operations, but when auth is off (default), all entries say "system" — cannot distinguish users. Compliance reporting returns stubs. |
| 4 | "Environment management with deploy tracking" | Sync status computation works via hash comparison. But actual deployment to OneStream is a mock — deploy is just a status flag update. |
| 5 | "Real-time collaboration" | Presence tracking exists but is polling-based (no WebSocket), in-memory only (lost on restart), not shareable across instances. |
| 6 | "Version control with merge" | Merge conflict detection works. But there is no UI for manual conflict resolution — source-wins by default. |
| 7 | "Scheduled automation" | In-process cron scheduler works. Single-instance only. Actions are lightweight summaries, not full job execution. |
| 8 | "Offline operation" | App works offline (it's local), but the "offline sync" feature (queue + push/pull) is a stub with no actual remote sync or conflict resolution. |

---

### 3. Claims Requiring More Evidence

Partial implementation or limited testing — need proof before asserting:

| # | Claim | Gap |
|---|-------|-----|
| 1 | "Round-trip XML fidelity" | No dedicated import-then-export-then-compare test exists. Property value normalization during import may alter formatting. |
| 2 | "ERP connectors (Oracle, SAP, REST)" | Factory exists but Oracle/SAP fall through to generic SQL connector. REST uses mock. Only CSV connector is demonstrably production-ready. |
| 3 | "API key authentication for integrations" | Keys can be generated/revoked, but API key auth is not wired into the authenticate middleware. Only JWT works for actual API access. |
| 4 | "Automated rollback on failed deploy" | Release packages generate rollback *notes* (markdown). No automated rollback XML generation. Manual process only. |
| 5 | "Impact analysis for proposed changes" | Engine exists and tests pass. But not validated against a real OneStream environment with complex cross-dimension dependencies. |
| 6 | "Natural language chatbot" | Keyword/intent matching parser — not an LLM chatbot. Handles simple queries like "find member X" but not arbitrary natural language. |

---

### 4. Claims We Should NOT Make Yet

Not implemented, not tested, or contradictory to audit findings:

| # | Claim | Reality |
|---|-------|---------|
| 1 | "Deploy dimensions directly to OneStream" | **Only a mock client exists.** No real OneStream API integration. This is the #1 expectation from users and it does not work. |
| 2 | "Multi-tenant with data isolation" | Tenant table exists. Usage metrics are hardcoded zeros. **No tenant-scoped filtering on any query.** Data leaks between tenants. |
| 3 | "Production-ready security" | Auth disabled by default, no Helmet, no CORS restriction, no file upload validation, no TLS. Requires 6+ configuration steps before network-safe. |
| 4 | "Performance monitoring" | Metrics endpoint returns **hardcoded fake values** (avg 15ms, p95 50ms). No actual request tracking or APM. |
| 5 | "Compliance reporting (SOD, audit completeness)" | Returns stub data. Not computed from real audit records. |
| 6 | "Enterprise-grade collaboration" | No WebSocket, no email/push notifications, presence lost on restart. Not comparable to real collaboration tools. |

---

### 5. Claims That Could Create Credibility Risk

Overstatements that would damage trust if challenged by a technical buyer:

| # | Dangerous Claim | Why It's Risky |
|---|-----------------|----------------|
| 1 | **"4 AI engines"** | These are string similarity functions and pattern matching. If a prospect asks "what model do you use?" the answer is "Levenshtein distance." Calling this AI invites comparison to GPT/Copilot and will disappoint. |
| 2 | **"No other tool in this space has AI/ML capabilities"** | Factually fragile. ACM and EPMWARE may add AI features. Also, our "AI" is heuristics — the claim implies we have something they can't replicate trivially. |
| 3 | **"Natural language chatbot"** | It's a keyword parser. Users will type free-form questions expecting ChatGPT-level understanding and get "I don't understand." |
| 4 | **"Fully functional with 209K-member dataset, validates in under 15 seconds"** | No formal benchmark. Was this measured once on one machine? What hardware? Would a skeptic reproduce it? |
| 5 | **"Purpose-built for OneStream Extensible Dimensionality model"** | Cannot deploy to OneStream. Has never been tested against a real OneStream instance. XML format correctness is inferred from documentation, not validated end-to-end. |
| 6 | **"Full VCS — branches, commits, diffs, merge with conflict detection"** | Merge has no conflict resolution UI. User cannot actually resolve conflicts — system auto-resolves or fails silently. Calling it "full VCS" invites Git comparisons. |
| 7 | **"Enterprise subscription ($$$)" next to "Internal IP — no per-user licensing"** | Implies EPMWARE is expensive without data. If challenged on pricing comparison, we have no quotes. Also implies our tool is "free" — it costs engineering time. |

---

## Competitive Comparison Accuracy Assessment

| Competitor Claim | Fair? | Risk |
|---|---|---|
| "ACM: No visuals, no AI, no migration" | **Partially fair** — ACM is tabular, but "no AI" may change. ACM also runs *inside* OneStream (a major advantage we undersell). |
| "EPMWARE: Expensive, PL/SQL required, overkill" | **Unfair framing** — EPMWARE is an established MDM product. "Overkill" dismisses legitimate enterprise needs. We don't have their pricing data. |
| "SR Dim Builder: 4 AI engines" | **Misleading** — They are heuristic functions, not AI engines. A technical evaluator would see through this immediately. |
| "SR Dim Builder: Natural language chatbot" | **Overstatement** — It's a keyword parser with intent matching. Not a chatbot by modern standards. |
| "SR Dim Builder: Multi-environment with deploy, sync" | **Partially true** — Sync status works. Deploy is a mock. This will fail in a live demo against real environments. |

---

## Safe Demo Language

Exact words safe to use in presentations:

### Product Description
> "A dimension management workbench purpose-built for OneStream implementation teams."

### Core Capabilities
> "Import your dimension metadata from Excel workbooks or XML files, visualize hierarchies, run OneStream-specific validations, and export clean XML ready for OneStream import."

### Validation
> "Over 20 validation rules that check OneStream naming conventions, required properties, hierarchy integrity, and consolidation patterns — with configurable severity levels."

### Migration
> "Native parsers for Hyperion HFM, EPMA, SAP BPC, and CSV — import legacy hierarchies and validate them against OneStream rules before you commit."

### Quality
> "Quality scoring gives you visibility into property completeness and naming consistency at the dimension and member level."

### Intelligence Features
> "Smart suggestions powered by pattern analysis — detects potential duplicates via string similarity, flags naming convention outliers, and identifies missing properties based on peer members."

### Collaboration
> "Built-in approval workflows, snapshot/restore for safe experimentation, and branch-based version tracking for parallel workstreams."

### Deployment
> "Runs locally on your workstation with no internet dependency. Zero licensing cost — Spaulding Ridge internal IP."

### Scale
> "Designed to handle dimensions with thousands of members. Pagination, indexed queries, and optimized bulk operations."

---

## Claims to Avoid

Exact words NOT to use in any external communication:

| Do NOT Say | Why |
|---|---|
| "AI-powered" | Heuristics, not AI. Will be challenged. |
| "4 AI engines" | Inflates string similarity and pattern matching to "engine" status. |
| "Machine learning" | No ML models exist in the codebase. |
| "Natural language chatbot" | It's keyword matching, not NLU. |
| "Enterprise-ready" | Auth off by default, SQLite, no TLS, no security headers. |
| "Production-ready" | Audit explicitly says NO-GO for production. |
| "Deploy directly to OneStream" | Mock client only. Cannot deploy anything. |
| "Real-time collaboration" | Polling with 30-second heartbeat. Not real-time. |
| "Multi-tenant" | No data isolation. Would leak data between tenants. |
| "Fully automated rollback" | Rollback notes are markdown text, not executable. |
| "Tested against OneStream" | Never connected to a real OneStream instance. |
| "No other tool has AI" | Unverifiable; invites immediate counter-research. |
| "EPMWARE is expensive" | We don't have their pricing. |
| "Complete audit compliance" | Compliance reports return stub data. |
| "Offline-first architecture" | App is local, but "sync" features are stubs. |

---

## Honest Differentiators

What genuinely sets this apart — defensible under scrutiny:

### 1. OneStream-Specific Validation Rules
Unlike generic MDM tools, the validation engine knows OneStream naming restrictions, required properties per dimension type, consolidation patterns, and XD inheritance rules. This isn't configurable-to-any-platform — it's built specifically for OneStream.

**Defensible because:** 100+ property dictionary entries, per-dimension-type attribute mappings, 750-line engine with tests.

### 2. XML Round-Trip Safety
Imports OneStream XML, preserves unknown elements/attributes during editing, and exports clean XML without losing data the tool doesn't understand. This solves the "I'm afraid to touch the XML" problem.

**Defensible because:** Unknown XML preservation tested, entity ownership fields mapped, varying properties handled with explicit context.

### 3. Legacy Migration Path
Native parsers for HFM, EPMA, BPC, and CSV mean implementation teams can bring forward legacy hierarchies without manual reformatting. The tool validates imported data against OneStream rules immediately.

**Defensible because:** 4 parsers produce unified ParsedDimension output, tested.

### 4. Hierarchy Intelligence (Not AI, Just Smart)
Cycle detection, orphan identification, shared member analysis, cross-dimension where-used, and depth/balance analytics — computed instantly from the local data model. No cloud service required.

**Defensible because:** DFS algorithms, hierarchy analytics (485 lines), cross-dimension engine (294 lines), all tested.

### 5. Zero External Dependency for Core Workflow
The entire import → edit → validate → export workflow runs locally with no internet, no license server, no SaaS subscription. A consultant can use this on a plane.

**Defensible because:** SQLite local DB, no external API calls in core path, localhost binding by default.

### 6. Governance Workflow Without OneStream Dependency
Approval workflows, change sets, baselines, diffs, and release packages work entirely within the tool. Teams can govern dimension changes before touching OneStream — not after.

**Defensible because:** Workflow engine, change set lifecycle, release package generation — all tested end-to-end.

### 7. Cost Structure
No per-user, per-record, or per-environment licensing. Engineering time to build/maintain is the cost. For a consulting firm deploying across multiple client engagements, this eliminates license negotiation.

**Defensible because:** It's a fact about the licensing model.

---

## Summary for Leadership

| Category | Count |
|---|---|
| Safe to claim today | 17 |
| Valid for pilot only (with caveats) | 8 |
| Need more evidence | 6 |
| Should NOT claim yet | 6 |
| Credibility risk if claimed | 7 |

**Bottom line:** The tool has genuine, defensible value as a **OneStream dimension workbench for implementation teams**. The core workflow (import → validate → edit → export) is solid. The danger zone is overpositioning it as an "AI-powered enterprise platform" when it's actually a well-built local tool with heuristic helpers.

**Recommended positioning:**  
> "A specialized dimension management workbench that accelerates OneStream implementations by automating validation, migration, and quality governance — purpose-built by consultants who know the platform."

**Avoid positioning as:**  
> "An AI-powered enterprise MDM platform that deploys directly to OneStream."

The first is true and defensible. The second will unravel under any technical due diligence.
