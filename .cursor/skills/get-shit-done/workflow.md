# GSD workflow — dimbuilder

Source: [open-gsd/gsd-core](https://github.com/open-gsd/gsd-core).

## 1. Map the codebase (required)

**Skill:** `gsd-map-codebase`

Run in the dimbuilder repo root. Produces intelligence GSD uses for planning (stack, modules, conventions).

Existing human docs to reference during later steps:

- `docs/feature-catalog.md` — capability inventory
- `docs/cleanup-implementation-plan.md` — cleanup phases and scope

## 2. Initialize project context

**Skill:** `gsd-new-project`

Creates `.planning/PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `config.json`.

Approve the roadmap before implementation. For cleanup work, align phases with `docs/cleanup-implementation-plan.md` or decompose into GSD phases explicitly.

## 3. Per phase

### Discuss (`gsd-discuss-phase N`)

Lock implementation choices (APIs, UX, error handling, migration strategy) before plans.

### Plan (`gsd-plan-phase N`)

Small, verified plans per context window. Output under `.planning/phases/<N>/`.

### Execute (`gsd-execute-phase N`)

- Parallel waves where plans are independent
- `Task` subagents per plan; atomic commits per task
- Keep main thread on artifacts, not full file dumps

### Verify (`gsd-verify-work N`)

Walk through acceptance criteria. Failures → fix plans → re-execute.

### Ship

`gsd-ship N` → PR; `gsd-complete-milestone` when the milestone is done.

## 4. Resume a session

1. Read `.planning/STATE.md` and `ROADMAP.md`
2. Run `gsd-progress --next` or invoke the skill for the current phase step

## 5. Config

`.planning/config.json` — `interactive` vs `yolo`, model profiles, `parallelization.enabled`.

See [GSD configuration](https://github.com/open-gsd/gsd-core/blob/main/docs/CONFIGURATION.md).
