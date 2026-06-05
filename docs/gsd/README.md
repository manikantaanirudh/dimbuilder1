# GSD (Get Shit Done) on dimbuilder

[GSD Core](https://github.com/open-gsd/gsd-core) drives spec-driven, multi-phase work with durable context under `.planning/`.

## Setup (each developer machine)

```bash
npx @opengsd/gsd-core@latest --cursor --global
```

Restart Cursor. Project routing skill: `.cursor/skills/get-shit-done/`.

## First run on this repo

1. `gsd-map-codebase` — analyze existing dimbuilder code
2. `gsd-new-project` — build roadmap (reference `docs/feature-catalog.md` and `docs/cleanup-implementation-plan.md` as needed)
3. Loop: `gsd-discuss-phase` → `gsd-plan-phase` → `gsd-execute-phase` → `gsd-verify-work` → `gsd-ship`

Or use `gsd-progress --next` to advance automatically.

## Where files go

| Path | Purpose |
|------|---------|
| `.planning/PROJECT.md` | Project vision |
| `.planning/REQUIREMENTS.md` | Scoped requirements |
| `.planning/ROADMAP.md` | Phases and status |
| `.planning/STATE.md` | Current position |
| `.planning/phases/` | Per-phase research and plans |

Commit `.planning/` when it reflects agreed project state (exclude secrets).

## Related workflows in this repo

| Workflow | Skill location |
|----------|----------------|
| GSD (roadmaps, phases) | `.cursor/skills/get-shit-done/` + global `gsd-*` |
| Superpowers (TDD feature loop) | `.cursor/skills/superpowers/` + `docs/superpowers/` |
| UI design | `.claude/skills/impeccable/` |

## Links

- [GSD User Guide](https://github.com/open-gsd/gsd-core/blob/main/docs/USER-GUIDE.md)
- [GSD Commands](https://github.com/open-gsd/gsd-core/blob/main/docs/COMMANDS.md)
- Legacy repo (archived): [gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done)
