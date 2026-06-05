# Superpowers workflow (detail)

Source methodology: [obra/superpowers](https://github.com/obra/superpowers).

## 1. Brainstorming

**Skill:** `brainstorming`

1. Explore project context (files, docs, recent commits)
2. Ask clarifying questions — **one per message**; prefer multiple choice
3. Propose 2–3 approaches with trade-offs and a recommendation
4. Present design in sections; get approval per section
5. Write spec → `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
6. Self-review spec (no TBD, no contradictions, clear scope)
7. User reviews spec file; only proceed after approval
8. Invoke `writing-plans` — **not** any implementation skill yet

**Hard stop:** No code, scaffolding, or implementation skills until design is approved.

## 2. Git worktree (optional but recommended)

**Skill:** `using-git-worktrees`

After design approval, before heavy implementation:

- New branch / worktree for isolation
- Run project setup
- Confirm tests pass on a clean baseline

## 3. Writing plans

**Skill:** `writing-plans`

- Plan path: `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`
- Header: goal, architecture, tech stack, execution sub-skill note
- Tasks: 2–5 minute steps with exact paths, full code, exact commands, expected output
- Every code change step includes the actual code
- Self-review: spec coverage, no placeholders, consistent names
- Offer: **subagent-driven-development** (recommended) vs **executing-plans**

## 4. Execution

### Subagent-driven (recommended)

**Skill:** `subagent-driven-development`

- Fresh subagent per task
- Review 1: matches plan/spec
- Review 2: code quality
- Block on critical issues

### Inline

**Skill:** `executing-plans`

- Batch tasks with checkpoints for human review

### Parallel

**Skill:** `dispatching-parallel-agents` when tasks are independent.

## 5. Test-driven development

**Skill:** `test-driven-development` during implementation.

1. Write failing test
2. Run — confirm fail for the right reason
3. Minimal implementation
4. Run — confirm pass
5. Refactor if needed
6. Commit

Delete production code written before tests existed.

## 6. Debugging (when needed)

**Skill:** `systematic-debugging`

Four phases: reproduce → isolate → fix → verify. Use `verification-before-completion` before closing the bug.

## 7. Code review

**Skill:** `requesting-code-review` between tasks or before merge.

**Skill:** `receiving-code-review` when applying feedback.

## 8. Finish branch

**Skill:** `finishing-a-development-branch`

- Run full test suite
- Present options: merge locally, open PR, keep branch, discard
- Clean up worktree if used
