import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules") continue;
      walk(p, files);
    } else if (p.endsWith(".ts")) files.push(p);
  }
  return files;
}

let count = 0;
for (const file of walk("src")) {
  let src = readFileSync(file, "utf8");
  const next = src.replace(
    /await (repos\.\w+(?:\.\w+)*\([^)]*\))\.(\w+)/g,
    "(await $1).$2"
  );
  if (next !== src) {
    writeFileSync(file, next);
    count++;
    console.log(file);
  }
}
console.log(`fixed ${count} files`);
