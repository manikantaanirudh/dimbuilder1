# SR OneStream Dim Builder — Competitive Comparison

## Feature Comparison: SR Dim Builder vs ACM vs EPMWARE

| # | Capability | ACM (Free, Marketplace) | EPMWARE (Commercial SaaS) | SR Dim Builder |
|---|---|---|---|---|
| 1 | **Visual Hierarchy Editor** | No — tabular format only | Yes — graphical tree + drag/drop | Yes — interactive tree with search filter, expand/collapse, analytics panel |
| 2 | **Real-Time Validation** | Custom field-level rules only | PL/SQL scripting engine | 20+ OneStream-specific rules, instant execution, configurable severity |
| 3 | **AI / Machine Learning** | None | None | 4 AI engines: duplicate detection, naming anomalies, hierarchy optimization, property suggestions |
| 4 | **Natural Language Chatbot** | None | None | Yes — query project data in plain English ("Find member X", "How many dimensions?") |
| 5 | **Quality Scoring** | None | None | Per-member quality scores, dimension-level grades, animated score rings |
| 6 | **Migration from Legacy Systems** | None | Yes — adapter-based | Yes — native parsers for Hyperion HFM, EPMA, SAP BPC, generic CSV |
| 7 | **XML Preview & Export** | No — commits directly to OneStream | Via adapters | Live XML preview exactly as OneStream expects, per-dimension download |
| 8 | **Cross-Dimension Analysis** | None | Cross-application impact | Where-used analysis, shared member detection, cross-dimension validation |
| 9 | **Approval Workflows** | Multi-level within OneStream | Multi-stage cross-app | Configurable workflow definitions with auto-advance rule engine |
| 10 | **Environment Management** | Limited | DEV/UAT/PROD | Multi-environment with deploy, sync status, connection testing |
| 11 | **Reporting & Analytics** | Audit trail only | Historical snapshots | Health reports, velocity tracking, coverage analysis, compliance reporting |
| 12 | **Version Control** | None | Snapshots | Full VCS — branches, commits, diffs, merge with conflict detection, tags |
| 13 | **Issue Dismissal (Mark as Safe)** | None | None | Per-issue dismiss with restore capability — handle false positives gracefully |
| 14 | **Validation Rule Export** | None | None | Export rules as CSV for business team review and sign-off |
| 15 | **Drill-Down Dashboard** | None | Limited | Clickable severity cards filter to issue type, navigate to source dimension |
| 16 | **Offline / Local Operation** | No — requires OneStream | No — SaaS dependent | Fully local, works without internet, instant response times |
| 17 | **Licensing Cost** | Free | Enterprise subscription ($$$) | Internal IP — no per-user or per-record licensing |
| 18 | **OneStream XD Understanding** | Native (runs inside OneStream) | Adapter-based understanding | Purpose-built for OneStream Extensible Dimensionality model |
| 19 | **Bulk Operations** | Mass update via spreadsheet | Bulk upload templates | Bulk update with preview, Excel publish API, paginated grid editing |
| 20 | **Template Library** | None | None | Industry templates (extract from project, apply with rename) |

## Summary

| Tool | Best For | Limitations |
|---|---|---|
| **ACM** | Simple internal OneStream governance, free | No visuals, no AI, no migration, no cross-system, tabular only |
| **EPMWARE** | Enterprise MDM across multiple applications | Expensive, PL/SQL required, vendor dependency, overkill for OneStream-only |
| **SR Dim Builder** | OneStream-focused teams needing intelligence, speed, and quality governance | Internal tool (not yet cross-application MDM) |

---

## Email Draft

**Subject:** Introducing SR Dim Builder — AI-Powered OneStream Dimension Governance

Hi [Name],

I wanted to share an update on the dimension management tool we've been building for our OneStream practice.

**The Problem We're Solving**

Today, teams managing OneStream dimensions typically rely on either:
- **ACM** (free, but limited to tabular editing, no visualizations, no intelligence)
- **EPMWARE** (powerful cross-application MDM, but expensive and complex for OneStream-focused work)
- **Manual Excel processes** (error-prone, no validation, no governance)

**What SR Dim Builder Does Differently**

We've built a purpose-built tool that combines the best of both worlds — plus capabilities neither tool offers:

1. **AI-Powered Intelligence** — Automatically detects duplicate members, naming convention violations, and hierarchy optimization opportunities. No other tool in this space has AI/ML capabilities.

2. **Natural Language Chatbot** — Business users can query metadata in plain English: "Is there a member called Actual?", "How many members in the Account dimension?", "Show children of Revenue." This is unique to our platform.

3. **Quality Scoring** — Every member and dimension gets a quantitative quality score (not just pass/fail). Teams can track metadata health over time and set quality gates for deployment.

4. **Visual Hierarchy with Smart Filtering** — Interactive tree view with search that filters to matching branches. Hierarchy analytics show depth, balance, orphans, and shared members at a glance.

5. **20+ OneStream-Specific Validation Rules** — Purpose-built for OneStream's naming restrictions, property requirements, and consolidation patterns. Rules are exportable as CSV so business teams can review and sign off.

6. **Legacy Migration** — Native parsers for Hyperion HFM, EPMA, and SAP BPC formats. Teams can import legacy hierarchies and validate them against OneStream rules before committing.

7. **Zero Licensing Cost** — Unlike EPMWARE's enterprise pricing, this is Spaulding Ridge internal IP that we can deploy for any client engagement.

**How It Compares**

| | ACM | EPMWARE | SR Dim Builder |
|---|---|---|---|
| AI Intelligence | — | — | 4 engines |
| Chatbot | — | — | Yes |
| Quality Scoring | — | — | Yes |
| Visual Hierarchy | — | Yes | Yes |
| Migration Parsers | — | Yes | Yes |
| Validation Rules | Basic | PL/SQL | 20+ OneStream-native |
| Cost | Free | $$$ | Internal IP |

**Next Steps**

I'd welcome the opportunity to demo this for the team. The tool is fully functional with a 209K-member real-world dataset and processes validations in under 15 seconds.

Let me know if you'd like to schedule a walkthrough.

Best regards,
[Your Name]
Spaulding Ridge
