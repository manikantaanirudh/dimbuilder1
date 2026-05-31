# SR OneStream Dim Builder — Project Instructions

## What This Is

An enterprise metadata management platform for OneStream XF dimension building. TypeScript monorepo with Express backend (SQLite via `node:sqlite` DatabaseSync) and React 18 frontend (Vite, custom CSS, Lucide icons).

## Architecture

```
src/
  server/         Express API (port 8787)
    routes/       REST endpoints (projects.ts is the main router)
    db/           SQLite repositories (repositories.ts - single file, ~3400 lines)
    ai/           Natural language query engine
    workflow/     Multi-step approval engine
  client/         React SPA (Vite dev on port 5173)
    components/   UI components (AppShell, DimensionWorkspace, EditableGrid, etc.)
    styles.css    All styles (no Tailwind)
  shared/         Shared between server and client
    validationEngine.ts   56 validation rules
    xmlExport.ts          OneStream XML generation
    workbookParser.ts     XLSX import
    hierarchy.ts          Hierarchy analysis
  test/           Vitest test suite (557+ tests)
config/
  dimbuilder.yaml   Central app configuration
docs/               Maintained documentation (23 files, verified by npm run docs:check)
```

## Critical Patterns

- **Repository pattern**: `repos.members.update(id, { memberKey, properties })` requires BOTH fields. Partial updates must fetch existing record first and merge.
- **Validation**: Per-dimension rules in `validationEngine.ts`, project-level rules in `projects.ts:runProjectValidation()`.
- **No Tailwind**: All CSS is in `src/client/styles.css`. Use CSS variables (e.g., `var(--surface-subtle)`).
- **Icons**: Use `lucide-react` only. No other icon libraries.
- **Tooltips**: Grid rows use native `title` attribute, not custom tooltip components.
- **Issue dismissal**: Client-side state only (`Set<string>`), not persisted to backend.
- **Export blocking**: Controlled by `validation.exportBlockedBySeverities` config. Server enforces in `exportGuards.ts`.

## Do Not Touch

- `data/` — runtime SQLite database, exports, and logs. Never edit or commit generated contents.
- `dist/`, `node_modules/` — build output and dependencies.
- Design tokens in `src/client/styles.css` (the `:root` and `[data-theme="dark"]` OKLCH values) and the `<title>` in `index.html` are pinned by `src/test/notionDesignSystem.test.ts`. Changing them breaks tests; update the test deliberately if a token change is intended.
- The 4 known-failing `workbookParser.test.ts` cases (missing fixture) — do not "fix" by deleting assertions; the fixture is intentionally absent.
- `config/dimbuilder.yaml` — central config. Change only when the task is about configuration, and update `configuration-guide.md`.
- Pre-existing dead code — leave it unless removal is requested.

## File & Naming Conventions

- React components: `PascalCase.tsx` under `src/client/components/`. One component per file.
- Hooks: `useX.ts` / camelCase helpers under `src/client/hooks/`.
- Shared and server modules: `camelCase.ts` (e.g., `validationEngine.ts`, `exportGuards.ts`).
- Tests: `src/test/<feature>.test.ts`, matching the module under test.
- Docs: `kebab-case.md` under `docs/`, linked from `docs/README.md`.
- CSS: classes are kebab-case; colors come from CSS variables only, never raw hex/rgb.

## Response Format

- Be concise. Reference code as `file_path:line` so it is navigable.
- Before multi-file or behavioral changes, present the plan/options; don't pick silently.
- After changes: state what changed, the verification run, and the result (pass/fail counts).
- No em dashes in code or UI copy; use commas, colons, or periods.

## Commands

| Action | Command |
|--------|---------|
| Type check | `npx tsc --noEmit` |
| Build frontend | `npx vite build` |
| Run all tests | `npx vitest run` |
| Run specific test | `npx vitest run src/test/<name>.test.ts` |
| Start server | `npx tsx src/server/index.ts` |
| Start frontend dev | `npx vite --port 5173` |
| Check docs | `npm.cmd run docs:check` |

## PowerShell Notes

- Always prefix with `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` if scripts fail
- Use `` `n `` for newlines in strings (not `\n`)
- `$pid` is reserved — use `$projId` instead
- Use `@"..."@` for multiline strings (heredoc)
- Chain commands with `;` (not `&&`)

## Testing

- 4 tests in `workbookParser.test.ts` fail due to missing fixture file — this is a known pre-existing issue
- After any validation engine changes, run: `npx vitest run src/test/validationEngine.test.ts`
- After route changes, run: `npx vitest run src/test/projectRoutes.test.ts`

## Documentation

After any behavior change, update docs using the `$docs-maintainer` skill. The source-to-docs mapping is defined in `.cortex/skills/docs-maintainer/SKILL.md`. Always run `npm.cmd run docs:check` to verify.

## Branch

Active development branch: `feature/v2-platform`

## Coding Discipline

### 1. Think Before Coding

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

### 3. Surgical Changes

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.
- Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

Transform tasks into verifiable goals with success criteria:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

- "Add validation" → write test, make it pass
- "Fix the bug" → reproduce it, then fix
- "Refactor X" → ensure tests pass before and after
- Always run `npx tsc --noEmit` after changes. Always.
