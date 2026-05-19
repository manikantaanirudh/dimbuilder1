# Change Set Guide

Change sets turn reviewed metadata diffs into a release-control workflow.

## Workflow

1. Create a metadata baseline.
2. Run a diff against the current project.
3. Create a change set from the latest diff run or a selected diff run.
4. Validate the change set.
5. Approve or reject with a comment.
6. Package the approved change set.

The workspace exposes this flow in the `Change Sets` tab.

## Lifecycle Statuses

- `draft`: created from diff items and still being reviewed.
- `validated`: validation has been run with no blocking issues.
- `approved`: approved for packaging.
- `rejected`: rejected with a recorded comment.
- `exported`: release package has been generated.

Approval re-runs project validation. Blocking validation severities prevent approval unless `bypassValidation` is explicitly sent and recorded in the approval comment.

## Package Contents

Packages are written under `paths.exportsDirectory/release-packages` as directories. Each package contains:

- `01-summary.md`: human-readable release notes.
- `02-change-set.json`: full persisted change set detail.
- `03-diff-report.csv`: copied diff items.
- `04-validation-report.csv`: latest validation results.
- `05-metadata.xml`: full current OneStream XML.
- `06-rollback-notes.md`: manual rollback guidance.
- `manifest.json`: package metadata, mode, files, validation summary, and change set summary.

## Package Modes

The API accepts these modes:

- `full`
- `additive`
- `propertyUpdate`
- `relationshipDelete`
- `breakBuild`

The first implementation records the selected mode in `manifest.json` but exports full current XML for every mode. Mode-specific XML subsets are future work.

## Source Map

- `src/shared/releasePackage.ts`: release notes, manifests, CSV reports, rollback notes.
- `src/server/routes/projects.ts`: lifecycle and package endpoints.
- `src/server/db/repositories.ts`: persistence.
- `src/client/components/ChangeSetsPanel.tsx`: workspace UI.
