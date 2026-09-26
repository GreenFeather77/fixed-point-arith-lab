// Static integrity checks for the assembled single-file build.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");

const app = read("app.js");
const template = read("template.html");
const logic = read("logic.js");
const bundle = readFileSync(join(here, "..", "index.html"), "utf8");

const problems = [];

// 1. Every id the app looks up must exist in the template.
const ids = new Set([...template.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const lookups = new Set([
  ...[...app.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)/g)].map((m) => m[1]),
  ...[...app.matchAll(/\$\{`#([A-Za-z0-9_-]+)-\$\{side\}`\}/g)].map((m) => m[1]),
]);
for (const base of ["operand", "label", "input", "pad", "forms"]) {
  lookups.add(`${base}-x`);
  lookups.add(`${base}-y`);
}
for (const id of lookups) {
  if (!ids.has(id)) problems.push(`app.js looks up #${id}, missing from template`);
}

// 2. Icons referenced by the app must be defined in the ICONS map.
const iconKeys = new Set(
  [...logic.matchAll(/^export /gm)].map(() => null).filter(Boolean),
);
const definedIcons = new Set(
  [...app.matchAll(/^\s{2}([A-Za-z]+):\s*$/gm)].map((m) => m[1]),
);
const usedIcons = new Set([...app.matchAll(/ICONS\.([A-Za-z]+)/g)].map((m) => m[1]));
for (const key of usedIcons) {
  if (!definedIcons.has(key)) problems.push(`ICONS.${key} used but not defined`);
}

// 3. Logic symbols the app calls must be exported by logic.js.
const logicSymbols = new Set(
  [...logic.matchAll(/^export (?:function|const) ([A-Za-z0-9_]+)/gm)].map((m) => m[1]),
);
const usedLogic = [
  "parseOperand",
  "toOriginalBits",
  "convertOperand",
  "runMul",
  "runDiv",
  "encodeForms",
  "formatBits",
  "formatTrue",
  "bitsToInputString",
  "clampN",
  "paperMulRows",
  "PRESETS",
];
for (const sym of usedLogic) {
  if (!logicSymbols.has(sym)) problems.push(`app.js needs ${sym}, not exported by logic.js`);
  if (!new RegExp(`\\b${sym}\\b`).test(app)) problems.push(`expected app.js to use ${sym}`);
}

// 4. The bundle must be self-contained: no local asset references, no module syntax.
for (const bad of ["__STYLES__", "__LOGIC__", "__APP__"]) {
  if (bundle.includes(bad)) problems.push(`placeholder ${bad} still present in index.html`);
}
if (/<script[^>]*\bsrc=/.test(bundle)) problems.push("bundle loads an external script");
if (/<link[^>]*rel="stylesheet"[^>]*href="(?!https:)/.test(bundle)) {
  problems.push("bundle links a local stylesheet");
}
const externals = [...bundle.matchAll(/https?:\/\/[^"'\s)]+/g)].map((m) => m[0]);
const nonFontExternals = externals.filter(
  (u) => !/fonts\.(googleapis|gstatic)\.com/.test(u) && !u.startsWith("http://www.w3.org/"),
);
if (nonFontExternals.length) {
  problems.push(`unexpected external URLs: ${nonFontExternals.join(", ")}`);
}

// 5. Basic structural sanity of the template.
for (const tag of ["div", "section", "button", "span"]) {
  const open = (template.match(new RegExp(`<${tag}\\b`, "g")) || []).length;
  const close = (template.match(new RegExp(`</${tag}>`, "g")) || []).length;
  if (tag !== "button" && open !== close) {
    problems.push(`unbalanced <${tag}>: ${open} open / ${close} close`);
  }
}
if (!/lang="zh-CN"/.test(bundle)) problems.push("missing lang attribute");

console.log(`checked ${lookups.size} id lookups, ${usedIcons.size} icons, ${usedLogic.length} logic symbols`);
console.log(`external URLs in bundle: ${externals.length === 0 ? "none" : externals.join(", ")}`);
if (problems.length) {
  console.log(`\n${problems.length} PROBLEM(S):`);
  for (const p of problems) console.log(" - " + p);
  process.exit(1);
}
console.log("\nall static checks passed");