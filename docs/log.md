# Project Log

A running changelog for day-to-day work on SR OneStream Dim Builder. This is the lightweight "what happened, when" memory layer described in the workflow system.

Format: `date | type | description`

- **date**: `DD-MM-YYYY`
- **type**: `feature` | `fix` | `refactor` | `docs` | `test` | `chore` | `summary`
- **description**: one line, present-tense, specific

Architecture-level rationale belongs in `decisions.md`. Implemented-capability status belongs in `current-state-baseline.md`. This file is the quick chronological trail between them.

## Entries

```
31-05-2026 | fix     | impeccable audit: removed 9 hardcoded color leaks in styles.css, fixed dark-mode theming (17/20 -> 20/20)
31-05-2026 | docs    | updated current-state-baseline, feature-catalog, testing-strategy for the UI polish / a11y / theming pass
31-05-2026 | chore   | added docs/raw intake folder, docs/log.md, and Do-Not-Touch / naming / response-format sections in .cortex/instructions.md
31-05-2026 | feature | Project Assistant now context-aware: added projectContext.ts + summary/issues/export-ready NL intents fed by validation summary and counts
```
