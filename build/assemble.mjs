// Assembles build/{template.html,styles.css,logic.js,app.js} into ONE
// self-contained HTML file at the workspace root.
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const read = (p) => readFileSync(join(here, p), "utf8");

const template = read("template.html");
const styles = read("styles.css");
const logic = read("logic.js");
const app = read("app.js");

// logic.js carries `export` only so node can test it; inline as a classic script.
const logicPlain = logic.replace(/^export /gm, "");

for (const [name, body] of [
  ["logic", logicPlain],
  ["app", app],
]) {
  if (/^\s*(import|export)\s/m.test(body)) {
    throw new Error(`${name} still contains import/export after inlining`);
  }
}

// Parse-only syntax check (constructing a Function compiles but never runs it).
for (const [name, body] of [
  ["logic", logicPlain],
  ["app", app],
]) {
  try {
    // eslint-disable-next-line no-new-func
    new Function(body);
  } catch (err) {
    throw new Error(`${name} failed to parse: ${err.message}`);
  }
}

let out = template
  .replace("/*__STYLES__*/", () => styles.trimEnd())
  .replace("/*__LOGIC__*/", () => logicPlain.trimEnd())
  .replace("/*__APP__*/", () => app.trimEnd());

if (/\/\*__(STYLES|LOGIC|APP)__\*\//.test(out)) {
  throw new Error("a placeholder was left unreplaced");
}
if (/^\s*export /m.test(out)) {
  throw new Error("export leaked into the bundle");
}

const target = join(root, "index.html");
writeFileSync(target, out, "utf8");
const kb = (statSync(target).size / 1024).toFixed(1);
console.log(`wrote ${target} (${kb} KB)`);
console.log(`styles: ${styles.length} B, logic: ${logicPlain.length} B, app: ${app.length} B`);