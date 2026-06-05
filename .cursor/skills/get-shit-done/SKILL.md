---
name: get-shit-done
description: >-
  Routes GSD (Get Shit Done) spec-driven development for dimbuilder — context
  engineering, phased roadmaps, parallel execution, and verification. Use when
  starting milestones, planning cleanup or feature phases, executing with
  subagents, verifying work, or when the user mentions GSD, get-shit-done,
  gsd-core, or gsd-* commands.
---

# Get Shit Done (GSD) — dimbuilder

Orchestrates [GSD Core](https://github.com/open-gsd/gsd-core) for this repo. Workflow skills install **globally** (`~/.cursor/skills/gsd-*`); this folder is the project entry point and team reference.

Project skill path: `.cursor/skills/get-shit-done/`

## Prerequisites

Global Cursor install (once per machine):

```bash
npx @opengsd/gsd-core@latest --cursor --global
```

Restart Cursor after install. Update: re-run the same command.

## The rule

For GSD work, **invoke the matching `gsd-*` skill** from `~/.cursor/skills/` and follow its `@$HOME/.cursor/get-shit-done/...` workflow refs. Do not improvise the pipeline.

## Brownfield: start here

dimbuilder is an existing codebase. Before `gsd-new-project`:

1. **`gsd-map-codebase`** — index stack, architecture, conventions
2. **`gsd-new-project`** — roadmap informed by the map

Point GSD at existing planning docs when useful (`@docs/cleanup-implementation-plan.md`, `@docs/feature-catalog.md`).

## Core loop

| Step | Invoke | Purpose |
|------|--------|---------|
| 0. Map | `gsd-map-codebase` | Required first for this repo |
| 1. Initialize | `gsd-new-project` | Requirements + roadmap |
| 2. Discuss | `gsd-discuss-phase N` | Implementation decisions |
| 3. Plan | `gsd-plan-phase N` | Research + verified plans |
| 4. Execute | `gsd-execute-phase N` | Parallel waves, subagents |
| 5. Verify | `gsd-verify-work N` | Acceptance + fix plans |
| 6. Ship | `gsd-ship N` / `gsd-complete-milestone` | PR, tag, next milestone |

Shortcut: **`gsd-progress --next`**

Details: [workflow.md](workflow.md). Command index: [command-index.md](command-index.md).

## Artifacts (this repo)

GSD state lives at **`.planning/`** (commit with the repo):

| File | Role |
|------|------|
| `PROJECT.md` | Vision and context |
| `REQUIREMENTS.md` | Scoped requirements |
| `ROADMAP.md` | Phases and status |
| `STATE.md` | Session memory, decisions |
| `config.json` | Mode, models, parallelization |
| `phases/<N>/` | Per-phase plans and research |

Human-readable notes: [docs/gsd/README.md](docs/gsd/README.md) (repo root).

Load `STATE.md` + `ROADMAP.md` when resuming GSD work on dimbuilder.

## GSD vs Superpowers (this repo)

| Situation | Prefer |
|-----------|--------|
| Multi-phase cleanup, roadmap, milestone shipping | **GSD** (`gsd-*`) |
| Single feature, design spec + TDD micro-plan | **Superpowers** (`.cursor/skills/superpowers/`) |
| UI polish / design system | **impeccable** (`.claude/skills/impeccable/`) |

## Cursor tools

- Subagents: `Task(subagent_type="generalPurpose", ...)`
- Shell, Read, Write, StrReplace, Glob, Grep, TodoWrite
- User choices: numbered list in chat

## Upstream docs

- [User Guide](https://github.com/open-gsd/gsd-core/blob/main/docs/USER-GUIDE.md)
- [Commands](https://github.com/open-gsd/gsd-core/blob/main/docs/COMMANDS.md)
