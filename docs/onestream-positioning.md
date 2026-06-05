# OneStream Positioning

SR Onestream Dim Builder is a **OneStream Metadata Workbench**: a local-first tool for consultants and metadata engineers to build, import, validate, diff, analyze, export, and package dimension hierarchy changes **before** they are handed off to OneStream XF, ACM, or manual Load/Extract workflows.

## What this tool is

- Pre-OneStream metadata engineering, validation, impact analysis, XML readiness, and ACM/manual handoff workbench
- A trusted place to edit metadata with audit trails, baselines, change sets, and release evidence packages
- A complement to ACM and in-platform governance—not a replacement

## What this tool is not

- A replacement for OneStream ACM
- A direct OneStream deployment or write-back tool
- A multi-tenant SaaS platform
- An enterprise MDM platform
- An AI-first product (Smart Checks are optional and off by default)
- A guaranteed OneStream-certified import engine

## Preferred language

| Use | Avoid |
|-----|-------|
| OneStream Metadata Workbench | Production SaaS |
| Import Readiness | Guaranteed import |
| XML Round-Trip Check | OneStream certified |
| ACM Handoff Package | Deploy to OneStream |
| Release Evidence Package | Replace ACM |
| Smart Checks | AI-powered deployment |
| Validation Waiver | Mark as safe (without reason) |
| Target Environment Label | Multi-tenant ready |

## ACM relationship

This tool prepares metadata, validation evidence, impact analysis, and handoff artifacts that can **support** ACM or manual OneStream metadata import workflows. File-based packages (`acm-change-request.csv`, evidence JSON, smoke checklists) are for review and governance; they do not submit to ACM automatically.

## Downstream workflow

```text
Edit metadata → Validate → Baseline/Diff → Change set → Release evidence → ACM/manual handoff → OneStream import
```

See [acm-handoff-guide.md](acm-handoff-guide.md) and [xml-round-trip-readiness.md](xml-round-trip-readiness.md).
