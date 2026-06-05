---
name: superpowers
description: >-
  Applies the Superpowers agentic development methodology (brainstorm → design
  spec → implementation plan → TDD execution → review → branch finish). Use when
  building features, fixing bugs, planning multi-step work, writing tests first,
  debugging systematically, requesting code review, using git worktrees, or when
  the user mentions superpowers, obra/superpowers, or structured agent workflows.
---

# Superpowers (Cursor)

Orchestrates the [Superpowers](https://github.com/obra/superpowers) methodology in Cursor. This skill routes work; detailed procedures live in upstream Superpowers skills.

Project skill path: `.cursor/skills/superpowers/`

## Install (recommended)

Install the official plugin once so all skills load automatically:

```
/add-plugin superpowers
```

Or search **superpowers** in the Cursor plugin marketplace. Upstream: [obra/superpowers](https://github.com/obra/superpowers) (MIT, v5.1.0+).

Without the plugin, load a specific skill by reading:

`https://raw.githubusercontent.com/obra/superpowers/main/skills/<skill-name>/SKILL.md`

## The rule

**Before responding or acting**, if any Superpowers skill might apply (even ~1% chance), load and follow it.

Announce briefly: *"Using &lt;skill-name&gt; to …"*

Process skills (brainstorming, debugging) beat implementation skills. User instructions in project rules or direct requests override Superpowers when they conflict.

## How to load skills in Cursor

1. **Plugin installed** — Superpowers skills appear in available skills; read the matching `SKILL.md` when routed here (do not improvise the workflow).
2. **No plugin** — `Read` the raw GitHub URL for the skill named in [skill-index.md](skill-index.md).
3. **Checklists** — Mirror checklist items with `TodoWrite`; complete in order.
4. **Subagents** — Use Cursor `Task` tool where upstream skills say "dispatch subagent".

## Workflow (mandatory order)

Do not skip phases. Do not write production code before design approval.

| Phase | When | Next skill |
|-------|------|------------|
| 1. Brainstorm | New feature, behavior change, non-trivial fix | `brainstorming` |
| 2. Worktree | After design approval, before implementation | `using-git-worktrees` |
| 3. Plan | Approved spec exists | `writing-plans` |
| 4. Execute | Approved plan exists | `subagent-driven-development` (preferred) or `executing-plans` |
| 5. Implement | During execution | `test-driven-development` |
| 6. Review | Between tasks or before merge | `requesting-code-review` |
| 7. Finish | All tasks done | `finishing-a-development-branch` |

Cross-cutting: `systematic-debugging` (bugs), `verification-before-completion` (before claiming done), `receiving-code-review` (when addressing review).

Full phase detail: [workflow.md](workflow.md). Skill triggers and upstream paths: [skill-index.md](skill-index.md).

## Artifacts (this project)

| Artifact | Path |
|----------|------|
| Design spec | `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` |
| Implementation plan | `docs/superpowers/plans/YYYY-MM-DD-<topic>.md` |

Commit the design spec after user approval. Plans must use checkbox tasks, exact file paths, real code in steps, and TDD micro-steps (see `writing-plans`).

## Red flags (stop rationalizing)

| Thought | Do this instead |
|---------|-----------------|
| "Too simple for design" | Run `brainstorming` anyway (short design is fine) |
| "Need context first" | Load the relevant skill first |
| "I'll explore the codebase first" | Skills define how to explore |
| "Skill is overkill" | Use it if it exists |
| "I'll do one quick thing first" | Skill check comes first |

## Philosophy

- **TDD** — Red → green → refactor; delete code written before tests
- **Evidence** — Run commands; verify before claiming success
- **YAGNI / DRY** — Simplest design that meets the spec
- **Plans** — Bite-sized tasks (2–5 min); no placeholders ("TBD", "add tests later")

## Subagent execution (Cursor)

When executing a plan with `subagent-driven-development`:

1. One fresh `Task` subagent per plan task
2. Two-stage review: spec compliance, then code quality
3. Critical review issues block the next task
4. Parallel independent tasks → `dispatching-parallel-agents`

## Updating

Plugin: reinstall or update from marketplace. Manual: skills track [main branch](https://github.com/obra/superpowers/tree/main/skills).
