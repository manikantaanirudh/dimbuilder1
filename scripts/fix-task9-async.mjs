import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules") continue;
      walk(p, files);
    } else if (p.endsWith(".ts") && !p.endsWith(".d.ts")) {
      files.push(p);
    }
  }
  return files;
}

function fixAwaitPrecedence(src) {
  let next = src;
  // await expr.prop / await expr?.prop / await expr[index]
  next = next.replace(
    /await (repos\.\w+(?:\.\w+)*\([^)]*\))(\?\.[a-zA-Z_]\w*|\[[^\]]+\]|\.[a-zA-Z_]\w*)/g,
    "(await $1)$2"
  );
  return next;
}

function fixAsyncFunctions(src) {
  let next = src;

  // export function name(...) { with await inside body before closing brace at same indent
  next = next.replace(
    /export function (\w+)\(([^)]*)\): ([^{]+)\{/g,
    (match, name, params, ret, offset) => {
      const bodyStart = offset + match.length;
      const bodyEnd = findMatchingBrace(next, bodyStart - 1);
      const body = next.slice(bodyStart, bodyEnd);
      if (!body.includes("await ")) return match;
      const rt = ret.trim();
      const promiseRet = rt.startsWith("Promise<") ? rt : `Promise<${rt === "void" ? "void" : rt}>`;
      return `export async function ${name}(${params}): ${promiseRet} {`;
    }
  );

  // function name(...) { with await
  next = next.replace(
    /(\n\s+)function (\w+)\(([^)]*)\)(?:: ([^{]+))?\{/g,
    (match, indent, name, params, ret, offset) => {
      const bodyStart = offset + match.length;
      const bodyEnd = findMatchingBrace(next, bodyStart - 1);
      const body = next.slice(bodyStart, bodyEnd);
      if (!body.includes("await ")) return match;
      const rt = ret ? ret.trim() : "";
      let retType = "";
      if (rt) {
        retType = rt.startsWith("Promise<") ? `: ${rt}` : `: Promise<${rt === "void" ? "void" : rt}>`;
      }
      return `${indent}async function ${name}(${params})${retType} {`;
    }
  );

  // router handlers: (req, res) => { or (req, res, next) => {
  next = next.replace(
    /(\w+\.(?:get|post|put|patch|delete)\([^,]+,\s*)(\([^)]*\)\s*=>)\s*\{/g,
    (match, prefix, arrow, offset) => {
      if (arrow.includes("async")) return match;
      const bodyStart = offset + match.length;
      const bodyEnd = findMatchingBrace(next, bodyStart - 1);
      const body = next.slice(bodyStart, bodyEnd);
      if (!body.includes("await ")) return match;
      return `${prefix}async ${arrow} {`;
    }
  );

  // it("name", () => { with await
  next = next.replace(
    /(\bit\s*\(\s*(?:`[^`]*`|"[^"]*"|'[^']*')\s*,\s*)(\([^)]*\)\s*=>|\(\)\s*=>|\(\)\s*\{)/g,
    (match, prefix, handler, offset) => {
      if (handler.includes("async")) return match;
      const openBrace = next.indexOf("{", offset);
      if (openBrace === -1) return match;
      const bodyEnd = findMatchingBrace(next, openBrace);
      const body = next.slice(openBrace + 1, bodyEnd);
      if (!body.includes("await ")) return match;
      if (handler.trim() === "() =>") return `${prefix}async () =>`;
      if (handler.trim() === "()") return `${prefix}async ()`;
      return `${prefix}async ${handler}`;
    }
  );

  // it("name", function() { with await
  next = next.replace(
    /(\bit\s*\(\s*(?:`[^`]*`|"[^"]*"|'[^']*')\s*,\s*)(function\s*\([^)]*\)\s*\{)/g,
    (match, prefix, handler, offset) => {
      if (handler.includes("async")) return match;
      const bodyStart = offset + match.length;
      const bodyEnd = findMatchingBrace(next, bodyStart - 1);
      const body = next.slice(bodyStart, bodyEnd);
      if (!body.includes("await ")) return match;
      return `${prefix}async ${handler}`;
    }
  );

  return next;
}

function findMatchingBrace(src, openIndex) {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  for (let i = openIndex; i < src.length; i++) {
    const ch = src[i];
    const prev = src[i - 1];
    if (inSingle) {
      if (ch === "'" && prev !== "\\") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"' && prev !== "\\") inDouble = false;
      continue;
    }
    if (inTemplate) {
      if (ch === "`" && prev !== "\\") inTemplate = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === "`") {
      inTemplate = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return src.length;
}

const roots = ["src/server", "src/shared", "src/test"];
let changedFiles = 0;

for (const root of roots) {
  for (const file of walk(root)) {
    if (file.includes("repositories.ts")) continue;
    let src = readFileSync(file, "utf8");
    if (!src.includes("await ")) continue;
    const original = src;
    src = fixAwaitPrecedence(src);
    src = fixAsyncFunctions(src);
    if (src !== original) {
      writeFileSync(file, src);
      changedFiles++;
      console.log("fixed", file);
    }
  }
}

console.log(`fixed ${changedFiles} files`);
