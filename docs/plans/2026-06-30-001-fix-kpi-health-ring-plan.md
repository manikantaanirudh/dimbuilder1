# fix: KPI health ring empty on Project Overview

**Date:** 2026-06-30  
**Branch:** `feature/overview-dimension-metrics`  
**execution:** code

## Summary

The Project Overview KPI circle stays as an empty gray skeleton because `fetchQualityScores` hits a module-gated route (`offlineSync` / `apiPlatform` default off) while coverage loads successfully from always-on reporting routes. Expose project health scoring on the core projects API and redesign the featured KPI as a composite **Health** ring with a client-side fallback so the UI never stalls.

## Problem Frame

Users see a pulsing empty circle beside working metrics (dimensions, members, issues, coverage). The ring is meant to show project quality but the API returns 404 when tier3 modules are disabled. `KPICards` swallows the error and shows an infinite skeleton.

## Requirements

1. **R1** — Project health score must load with default module configuration (no tier3 flags required).
2. **R2** — Featured KPI ring must always render a numeric score or explicit unavailable state; no infinite skeleton.
3. **R3** — Ring label and tooltip should communicate composite health (metadata, validation, coverage).
4. **R4** — Existing tier3 quality routes remain available when modules are enabled (no breaking change).

## Key Technical Decisions

1. **Move core read path to projects router** — Add `GET /api/projects/:projectId/quality/scores` on `createProjectRouter` using existing `scoreProjectQuality` from `tier3Engine`. Projects router is always mounted; tier3 duplicate is harmless when both exist (projects registered first).
2. **Composite Health presentation** — Rename ring label from "Quality" to "Health". Tooltip shows metadata, validation, and coverage breakdown when available.
3. **Client fallback** — If quality API still fails, derive validation score from loaded issues (same penalty weights as server) and blend with coverage using `blendQualityScores` weights (35% metadata proxy via coverage, 65% validation).

## Implementation Units

### U1. Expose quality scores on projects router

**Goal:** Make health scoring reachable without tier3 module flags.

**Files:** `src/server/routes/projects.ts`, `src/test/moduleRoutes.test.ts`

**Approach:** Add GET handler mirroring tier3 route; import `scoreProjectQuality`.

**Test scenarios:**
- Covers R1. With all module flags false, `GET /api/projects/:id/quality/scores` returns 200 for a seeded project.
- Returns 404 for missing project.

### U2. Redesign KPICards health ring

**Goal:** Show composite health with fallback; eliminate infinite skeleton.

**Files:** `src/client/components/KPICards.tsx`, `src/client/ui/viewModel.ts`, `src/client/styles.css`

**Approach:**
- Load quality and coverage in parallel.
- Compute `displayHealth` from API or fallback.
- Pass breakdown to `ScoreRing` title.
- Replace skeleton-only state with ring showing score or compact unavailable badge.

**Test scenarios:**
- Covers R2/R3. `computeProjectHealthFallback` penalizes issues correctly.
- Markup test: KPICards renders score ring with numeric value when summary/issues provided.

### U3. Tests

**Files:** `src/test/clientUiViewModel.test.ts`, `src/test/clientComponentsMarkup.test.ts`, `src/test/moduleRoutes.test.ts`

**Verification:** Targeted vitest files pass.

## Scope Boundaries

### Deferred to Follow-Up Work

- Replacing coverage duplicate fetch (KPICards + Dashboard both fetch coverage) with shared store.
- Per-dimension health mini-rings on overview rows.

## Risks & Dependencies

- **Low risk:** Route duplication when tier3 enabled; projects router wins registration order.
- Depends on prior branch work (`dimensionStats` on summary) but U1–U3 are independent.
