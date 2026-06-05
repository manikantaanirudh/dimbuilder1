# ACM Handoff Guide

The ACM handoff workflow produces a **file-based evidence package** for governance and manual import. It does not submit changes to ACM or OneStream directly.

## When to use

After: validate → baseline/diff → change set → (optional) release evidence package → **ACM handoff**.

Use when your client uses ACM for metadata change control or when you need a structured CSV plus validation evidence for manual OneStream import.

## API

```http
POST /api/projects/:projectId/change-sets/:changeSetId/handoff/acm
```

Requires an approved or packaged change set context. Output directory: `paths.exportsDirectory/handoff/acm/<changeSetId>/`.

Source: `src/server/routes/handoff.ts`, `src/shared/acmHandoff.ts`.

## Package contents

| File | Purpose |
|------|---------|
| `acm-change-request.csv` | Row-level changes for ACM change-request style review |
| `acm-summary.md` | Human-readable package summary |
| `handoff-readme.md` | Steps for ACM/manual import (complements ACM) |
| `post-import-smoke-checklist.md` | Post-import verification steps |
| `rollback-notes.md` | Rollback guidance from baseline/change context |
| `validation-summary.json` | Counts by severity and validation profile |
| `validation-evidence.json` | Full issue list at handoff time |
| `impact-summary.json` | Artifact impact scanner summary (when available) |
| `source-change-set.json` | Machine-readable change set |
| `manifest.json` | File list, disclaimer, warnings |

## Configuration

```yaml
integrations:
  acm:
    enabled: true
    exportFields: [...]   # optional column subset
    fieldLabels: {}       # optional display labels
```

## Disclaimers

- Not ACM-certified or guaranteed to import without review
- Consultants must validate against target OneStream version and DEV import testing
- Complements ACM; does not replace in-platform approval

See [onestream-positioning.md](onestream-positioning.md).
