# OneStream Metadata Workbench — Cleanup Plan

Implementation tracker for product positioning and P0 hardening. Do not confuse with [cleanup-implementation-plan.md](cleanup-implementation-plan.md) (engineering consolidation).

## Executive summary

Local-first OneStream metadata workbench. Architecture stays SQLite + shared TypeScript + Express. P0 work focuses on **conservative defaults**, **honest language**, **ACM handoff**, **auditable waivers**, and **doc accuracy**.

## What is already strong

See [feature-status.md](feature-status.md). Core domain logic in `src/shared`, migrations, startup safety, bulk CSV/rollback, partial export streaming, XML fixtures.

## Implementation status

| ID | Item | Status |
|----|------|--------|
| P0.1 | Conservative module defaults + route/nav gating | Implemented |
| P0.2 | Export/Handoff language | Implemented |
| P0.3 | ACM handoff package expansion | Implemented |
| P0.4 | XML round-trip terminology + tests | Implemented |
| P0.5 | Validation profiles | Implemented |
| P0.6 | Auditable waivers | Implemented |
| P0.7 | Docs contradiction sweep | Implemented |
| P0.8 | `operations.appMode` + config guards | Implemented |
| P0.9 | Workbook test fixtures | Implemented |

## P0 checklist

- [x] `modules.*` default `false`; `ai.enabled` default `false`
- [x] `registerApiRoutes` gates experimental/platform routers
- [x] `moduleNav` + `AppShell` hide non-core nav
- [x] Deploy → Handoff in UI
- [x] Certification → XML Round-Trip Check
- [x] ACM package files per [acm-handoff-guide.md](acm-handoff-guide.md)
- [x] Validation profiles in config + release manifest
- [x] `validation_waivers` table + API + UI waive with reason
- [x] `operations.appMode` local/shared/production
- [x] Config `PUT` guarded in shared/production
- [x] Minimal workbook fixture for tests

## P1 backlog (not in P0)

See [onestream-next-enhancement-backlog.md](onestream-next-enhancement-backlog.md) for prioritized P1/P2 items (XML fixtures, export safety, artifact scanner, XD/POV release evidence).

## P3 non-goals

Postgres, Redis, WebSockets, SaaS multi-tenant, LLM expansion, direct OneStream write-back, React 19, Redux/Zustand, full VCS.

## Test checklist

```powershell
npm.cmd test
npm.cmd run docs:check
npm.cmd run build
```

## Related docs

- [onestream-next-enhancement-backlog.md](onestream-next-enhancement-backlog.md)
- [onestream-positioning.md](onestream-positioning.md)
- [feature-status.md](feature-status.md)
- [acm-handoff-guide.md](acm-handoff-guide.md)
- [xml-round-trip-readiness.md](xml-round-trip-readiness.md)
