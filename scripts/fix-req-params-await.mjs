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

function repair(src) {
  let next = src;
  next = next.replace(
    /\(await (repos\.\w+(?:\.\w+)*\(([^)]*\(req\.params as Record<string, string>\)))\)\.(\w+)\)/g,
    "await $1.$3)"
  );
  next = next.replace(
    /\(await (repos\.\w+(?:\.\w+)*\(([^)]*\(req\.params as Record<string, string>\)),)/g,
    "await $1,"
  );
  next = next.replace(
    /const changeSet = \(await repos\.changeSets\.create\(\{([\s\S]*?)\}\);/g,
    "const changeSet = await repos.changeSets.create({$1});"
  );
  next = next.replace(
    /const diffItems = await repos\.diffRuns\.listItems\(diffRun\.id\)\s*\n\s*\.filter/g,
    "const diffItems = (await repos.diffRuns.listItems(diffRun.id))\n      .filter"
  );
  return next;
}

let count = 0;
for (const file of walk("src/server/routes")) {
  const src = readFileSync(file, "utf8");
  const next = repair(src);
  if (next !== src) {
    writeFileSync(file, next);
    count++;
    console.log(file);
  }
}
console.log(`fixed ${count} files`);
