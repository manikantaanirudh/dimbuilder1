import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";

const requiredDocs = [
  "docs/README.md",
  "docs/application-summary.md",
  "docs/application-summary-checklist.md",
  "docs/architecture.md",
  "docs/developer-quickstart.md",
  "docs/configuration-guide.md",
  "docs/dimension-blueprints.md",
  "docs/api-reference.md",
  "docs/database-architecture.md",
  "docs/import-seeding-guide.md",
  "docs/export-modes.md",
  "docs/xml-generation-guide.md",
  "docs/validation-rules.md",
  "docs/security-model.md",
  "docs/audit-reliability.md",
  "docs/testing-strategy.md",
  "docs/deployment-guide.md",
  "docs/production-readiness-checklist.md",
  "docs/current-state-baseline.md",
  "docs/implementation-map.md",
  "docs/decisions.md",
  "docs/feature-catalog.md",
  "docs/enhancement-roadmap-prompts.md"
];

const requiredSupportFiles = [
  ".codex/skills/docs-maintainer/SKILL.md",
  "scripts/check-docs.mjs"
];

const errors = [];

for (const docPath of requiredDocs) {
  if (!existsSync(docPath)) {
    errors.push(`Missing required documentation file: ${docPath}`);
    continue;
  }
  const content = readFileSync(docPath, "utf8");
  if (!content.startsWith("# ")) {
    errors.push(`Documentation file must start with an H1 heading: ${docPath}`);
  }
}

for (const supportPath of requiredSupportFiles) {
  if (!existsSync(supportPath)) {
    errors.push(`Missing docs maintenance support file: ${supportPath}`);
  }
}

const readme = existsSync("docs/README.md") ? readFileSync("docs/README.md", "utf8") : "";
for (const docPath of requiredDocs.filter((path) => path !== "docs/README.md")) {
  const fileName = docPath.replace(/^docs\//, "");
  if (!readme.includes(`](${fileName})`)) {
    errors.push(`docs/README.md must link to ${fileName}`);
  }
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
if (packageJson.scripts?.["docs:check"] !== "node scripts/check-docs.mjs") {
  errors.push("package.json must define scripts.docs:check as 'node scripts/check-docs.mjs'");
}

const changedFiles = getChangedFiles();
const changedSourceFiles = changedFiles.filter((file) =>
  /^(src|config)\//.test(file) ||
  file === "package.json" ||
  file === "index.html" ||
  file === "vite.config.ts" ||
  file === "vitest.config.ts"
);
const changedDocFiles = changedFiles.filter((file) =>
  /^docs\//.test(file) ||
  /^\.codex\/skills\/docs-maintainer\//.test(file) ||
  file === "scripts/check-docs.mjs" ||
  file === "package.json"
);

if (changedSourceFiles.length > 0 && changedDocFiles.length === 0) {
  errors.push(
    [
      "Source/config files changed but no docs maintenance files changed.",
      "Update the relevant docs in docs/ or the docs-maintainer skill.",
      `Changed source files: ${changedSourceFiles.slice(0, 12).join(", ")}`
    ].join("\n")
  );
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Documentation check passed for ${requiredDocs.length} required docs.`);

function getChangedFiles() {
  try {
    const output = execFileSync("git", ["status", "--short"], { encoding: "utf8" });
    return output
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .map((line) => normalizeStatusPath(line))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeStatusPath(line) {
  const rawPath = line.slice(3).trim();
  const renamedPath = rawPath.includes(" -> ") ? rawPath.split(" -> ").pop() : rawPath;
  return relative(process.cwd(), renamedPath).replace(/\\/g, "/").replace(/^\.\//, "");
}
