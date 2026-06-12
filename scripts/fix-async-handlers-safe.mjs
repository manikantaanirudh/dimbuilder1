import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === "db") continue;
      walk(p, files);
    } else if (p.endsWith(".ts")) files.push(p);
  }
  return files;
}

function fixHandlers(src) {
  let next = src;

  // router.METHOD(path, (req, res) => { ... await ...}) -> async (req, res) =>
  next = next.replace(
    /(router\.(?:get|post|put|patch|delete)\([^,]+,\s*)(?!async)(\([^)]*\)\s*=>\s*\{)/g,
    (match, prefix, arrow, offset) => {
      const open = offset + match.length - 1;
      const close = findBraceClose(next, open);
      const body = next.slice(open + 1, close);
      if (!/\bawait\b/.test(body)) return match;
      return `${prefix}async ${arrow}`;
    }
  );

  // it("...", () => { await ...}) -> async () =>
  next = next.replace(
    /(\bit\s*\(\s*(?:`[^`]*`|"[^"]*"|'[^']*')\s*,\s*)(?!async)(\(\)\s*=>\s*\{)/g,
    (match, prefix, arrow, offset) => {
      const open = offset + match.length - 1;
      const close = findBraceClose(next, open);
      const body = next.slice(open + 1, close);
      if (!/\bawait\b/.test(body)) return match;
      return `${prefix}async ${arrow}`;
    }
  );

  // function helper() { await repos... } inside describe blocks
  next = next.replace(
    /(\n\s+)function (\w+)\(([^)]*)\)(:\s*[^{]+)?\s*\{/g,
    (match, indent, name, params, ret, offset) => {
      if (name === "createApp" || name.startsWith("create")) return match;
      const open = offset + match.length - 1;
      const close = findBraceClose(next, open);
      const body = next.slice(open + 1, close);
      if (!/\bawait\b/.test(body)) return match;
      const retType = ret ? (ret.includes("Promise<") ? ret : ret.replace(":", ": Promise<").replace("Promise<<", "Promise<") + ">") : "";
      // simplify: add async and Promise return only when there's an explicit return type
      if (ret && !ret.includes("Promise<")) {
        const rt = ret.trim().slice(1).trim();
        return `${indent}async function ${name}(${params}): Promise<${rt === "void" ? "void" : rt}> {`;
      }
      return `${indent}async function ${name}(${params})${ret ?? ""} {`;
    }
  );

  return next;
}

function findBraceClose(src, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return src.length;
}

let count = 0;
for (const root of ["src/server", "src/test"]) {
  for (const file of walk(root)) {
    if (file.includes("repositories.ts")) continue;
    const src = readFileSync(file, "utf8");
    const next = fixHandlers(src);
    if (next !== src) {
      writeFileSync(file, next);
      count++;
      console.log("fixed", file);
    }
  }
}
console.log(`fixed ${count} files`);
