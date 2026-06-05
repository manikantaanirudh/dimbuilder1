export function renderPostImportSmokeChecklist(projectName: string): string {
  return [
    `# Post-Import Smoke Test Checklist - ${projectName}`,
    "",
    "Run these checks in the target OneStream environment after importing the metadata.",
    "",
    "- [ ] All expected dimensions imported.",
    "- [ ] Member counts match the change summary.",
    "- [ ] Hierarchy parent-child counts match expectations.",
    "- [ ] A sample Cube View opens without error.",
    "- [ ] A sample consolidation/calculation runs (if applicable).",
    "- [ ] Security and maintenance groups resolve (if included in scope).",
    "- [ ] No unexpected validation errors after import.",
    "",
    "> This checklist is guidance for the OneStream administrator. The tool does not execute these checks."
  ].join("\n");
}

export function renderHandoffReadme(projectName: string, changeSetName: string): string {
  return [
    `# ACM / Manual Handoff - ${projectName}`,
    "",
    `Change set: **${changeSetName}**`,
    "",
    "## Purpose",
    "",
    "This package prepares metadata and evidence for **ACM or manual OneStream import**. It complements ACM; it does not replace in-platform governance or submit to OneStream directly.",
    "",
    "## Recommended steps",
    "",
    "1. Review `validation-summary.json` and `validation-evidence.json`.",
    "2. Import metadata using your organization's ACM or Load/Extract process.",
    "3. Run `post-import-smoke-checklist.md` in the target environment.",
    "4. Keep `rollback-notes.md` and baseline references for reversal planning.",
    "",
    "## Files",
    "",
    "- `acm-change-request.csv` — row-level changes for ACM change-request style review",
    "- `acm-summary.md` — package summary",
    "- `manifest.json` — machine-readable index",
    "",
    "> Not ACM-certified. Validate against your target OneStream version before production import."
  ].join("\n");
}
