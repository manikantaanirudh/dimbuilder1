# SR OneStream Dim Builder — Positioning

SR OneStream Dim Builder is a **OneStream metadata engineering, validation, impact-analysis, and
release-readiness workbench**. It helps implementation teams design, validate, analyze, package,
and hand off OneStream metadata before that metadata enters ACM, EPMware, or a manual OneStream import.

## Core workflow

```
Create / import metadata
  -> edit dimensions / members / relationships
  -> validate
  -> analyze impact
  -> compare against baseline
  -> package changes
  -> export XML / hand off to ACM, EPMware, or manual import
```

## What this tool does

- Creates blank metadata projects from blueprints or imports from OneStream XML and workbooks.
- Edits dimensions, members, relationships, and properties with a grid and hierarchy tree.
- Runs OneStream-specific validation rules with configurable severities and export gating.
- Provides Smart Suggestions (heuristic helpers, not an LLM) for duplicates, naming anomalies,
  and hierarchy/property issues.
- Analyzes impact, cross-dimension references, and extensibility behavior.
- Compares against baselines, builds change sets, and packages release evidence.
- Generates export-ready XML artifacts and ACM/EPMware handoff packages.
- Provides an evidence-based Project Assistant that answers questions from current project metadata
  and validation results (deterministic; no external LLM required).

## What this tool does NOT do

- It does **not** replace ACM for governed in-platform OneStream editing and approval.
- It does **not** replace EPMware for enterprise master data management across systems.
- It does **not** deploy directly to OneStream. "Deploy" actions are mock/tracked unless a real
  connector is configured and verified in a real environment.
- It does **not** guarantee that OneStream will accept an exported file. XML round-trip
  certification is *internal structural certification* only.
- It is **not** an "AI-powered" product. Intelligence features are deterministic heuristics
  unless an optional LLM integration is explicitly configured.

## How it complements ACM

ACM governs approved changes inside OneStream. SR Dim Builder prepares high-quality, validated
metadata and produces an **ACM handoff package** (change request rows, validation evidence,
readiness status, and import-ready XML) that teams can use to submit or document governed changes
in ACM. SR Dim Builder does not submit to ACM directly.

## How it complements EPMware

EPMware governs enterprise master data across many systems. SR Dim Builder produces a file-based
**EPMware handoff package** (request rows, property mapping, validation and readiness evidence,
and XML artifacts) that EPMware teams can review, map, or import through their own process. There
is no direct EPMware API integration.

## Safe demo language

- "A OneStream metadata workbench for build quality, validation, and release packaging."
- "Smart Suggestions" (not "AI").
- "ACM handoff-ready" / "EPMware handoff-ready".
- "Export-ready XML artifact" and "release evidence package".
- "Internal structural certification" for XML round-trip checks.
- "Direct OneStream deployment is planned / mock only unless configured with a real connector."

## Unsafe claims to avoid (unless technically proven)

- "Replaces ACM" / "Replaces EPMware"
- "Deploys directly to OneStream"
- "Production-ready enterprise MDM" / "AI-powered MDM"
- "Guaranteed OneStream import success" / "OneStream-certified"
- "Zero-cost replacement" / "EPMware is expensive"
- "Fully automated rollback for every change"
- "Tested against OneStream" (unless a real OneStream test environment was used)
