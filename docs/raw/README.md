# Raw Intake

Drop unprocessed source material here as-is: OneStream specification excerpts, customer interview notes, error dumps, pasted requirements, screenshots-as-text, exported logs.

This folder is the inbox in a three-layer knowledge flow:

```
docs/raw/   raw, unedited source material (this folder)
   |        distill / summarize
docs/*.md   structured, maintained knowledge pack (the "wiki")
.cortex/instructions.md   standing operating rules for the agent
```

## How to use it

1. Paste or save the raw material into `docs/raw/` with a dated, descriptive name, for example `2026-05-31-onestream-uda-spec.md`.
2. Ask the agent to process it into the relevant maintained doc under `docs/` (see the source-to-docs map in `.cortex/skills/docs-maintainer/SKILL.md`).
3. Once distilled and the facts live in a maintained doc, the raw file can be archived or deleted. Raw files are not verified by `npm.cmd run docs:check`.

## Rules

- Raw files are inputs, not the source of truth. Never cite `docs/raw/` from application code or other docs.
- Do not put secrets or credentials here. This folder is committed to the repo.
- Keep one topic per file so distillation stays clean.
