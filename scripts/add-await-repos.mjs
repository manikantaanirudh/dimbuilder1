import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SYNC_REPO_METHODS = new Set([
  "getEffectivePropertyValue"
]);

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === "db") continue;
      walk(p, files);
    } else if (p.endsWith(".ts") && !p.endsWith(".d.ts")) {
      files.push(p);
    }
  }
  return files;
}

function shouldSkipAwait(line, matchIndex) {
  const before = line.slice(0, matchIndex).trimEnd();
  if (before.endsWith("await")) return true;
  if (before.endsWith("void")) return true;
  if (/\breturn\s*$/.test(before)) return false; // return repos -> return await repos
  if (before.endsWith("return")) return false;
  if (before.includes("const ") || before.includes("let ") || before.includes("=")) return false;
  return false;
}

function transformFile(path) {
  if (path.includes("repositories.ts")) return false;
  let src = readFileSync(path, "utf8");
  let changed = false;
  const lines = src.split("\n");
  const out = lines.map((line) => {
    if (!line.includes("repos.")) return line;
    // Skip if already has await repos
    if (/\bawait\s+repos\./.test(line)) return line;

    let result = line;
    const regex = /\brepos\.(\w+)/g;
    let m;
    const inserts = [];
    while ((m = regex.exec(line)) !== null) {
      const methodChain = line.slice(m.index);
      const methodMatch = methodChain.match(/^repos\.(\w+)/);
      if (!methodMatch) continue;
      if (SYNC_REPO_METHODS.has(methodMatch[1])) continue;

      const before = line.slice(0, m.index).trimEnd();
      if (before.endsWith("await") || before.endsWith("void")) continue;
      // Don't add await in type positions
      if (/\btype\s+\w+\s*=/.test(line) || line.trim().startsWith("import ")) continue;

      inserts.push(m.index);
    }

    if (inserts.length === 0) return line;

    // Only add one await before repos. at first occurrence if line is assignment/return/expr
    const firstIdx = inserts[0];
    const before = line.slice(0, firstIdx).trimEnd();
    if (before.endsWith("await")) return line;

    // Skip db.prepare health check patterns
    if (line.includes("repos = createRepositories")) return line;

    const needsAwait =
      /=\s*repos\./.test(line) ||
      /return\s+repos\./.test(line) ||
      /^\s*repos\./.test(line) ||
      /\(repos\./.test(line) ||
      /,\s*repos\./.test(line) ||
      /\?\s*repos\./.test(line) ||
      /:\s*repos\./.test(line);

    if (!needsAwait && !/^\s+repos\./.test(line)) return line;

    // Insert await before repos.
    result = line.slice(0, firstIdx) + "await " + line.slice(firstIdx);
    changed = true;
    return result;
  });

  if (changed) {
    writeFileSync(path, out.join("\n"));
    return true;
  }
  return false;
}

const roots = ["src/server", "src/shared", "src/test"];
let count = 0;
for (const root of roots) {
  for (const file of walk(root)) {
    if (transformFile(file)) {
      count++;
      console.log("updated", file);
    }
  }
}
console.log(`Updated ${count} files`);
