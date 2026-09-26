// Renders the assembled index.html in jsdom and drives the UI, so the DOM
// layer is verified by execution rather than by eye. Needs `npm i jsdom`.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "index.html");

const problems = [];
const jsdomErrors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => jsdomErrors.push(e.message));
vc.on("error", (m) => jsdomErrors.push(String(m)));

const dom = new JSDOM(readFileSync(FILE, "utf8"), {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: vc,
  url: "file:///index.html",
});
const { window } = dom;
const doc = window.document;
window.addEventListener("error", (e) => jsdomErrors.push(`window.onerror: ${e.message}`));

// jsdom fires DOMContentLoaded/load asynchronously; the app renders on it.
await new Promise((resolve) => {
  if (doc.readyState === "complete") return resolve();
  window.addEventListener("load", () => resolve());
});

function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    problems.push(`${name} -> ${e.message}`);
    console.log(`  FAIL ${name}: ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || "value"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const txt = (sel) => (doc.querySelector(sel)?.textContent || "").replace(/\s+/g, " ").trim();
const $ = (sel) => doc.querySelector(sel);
const $$ = (sel) => [...doc.querySelectorAll(sel)];

function buttonByText(text, scope = doc) {
  const btn = [...scope.querySelectorAll("button")].find((b) =>
    (b.textContent || "").replace(/\s+/g, "").includes(text.replace(/\s+/g, "")),
  );
  assert(btn, `no button containing "${text}"`);
  return btn;
}

console.log("\n[static render]");
check("document title and language", () => {
  eq(doc.title, "定点演算纸", "title");
  eq(doc.documentElement.getAttribute("lang"), "zh-CN", "lang");
});
check("three operation tabs, 乘法 active", () => {
  const tabs = $$("#op-tabs .op-tab");
  eq(tabs.length, 3, "op tab count");
  eq(txt("#op-tabs .op-tab.is-active"), "乘法", "active tab");
});
check("operand X shows 原码 0.1101 and 真值 0.8125", () => {
  const t = txt("#forms-x");
  assert(t.includes("0.1101"), `forms-x missing 0.1101: ${t}`);
  assert(t.includes("0.8125"), `forms-x missing 0.8125: ${t}`);
  assert(t.includes("13/16"), `forms-x missing fraction label: ${t}`);
});
check("operand Y shows 0.1011 / 0.6875", () => {
  const t = txt("#forms-y");
  assert(t.includes("0.1011") && t.includes("0.6875"), `forms-y: ${t}`);
});
check("bit pads rendered with n+1 cells", () => {
  eq($$("#pad-x .bit").length, 5, "pad-x bits");
  eq($$("#pad-y .bit").length, 5, "pad-y bits");
});
check("algo grid lists 4 multiply algorithms, 原码一位 active", () => {
  eq($$("#algo-grid .algo").length, 4, "algo count");
  eq(txt("#algo-grid .algo.is-active .algo-name"), "原码一位", "active algo");
});
check("result card: 乘积 0.10001111", () => {
  eq(txt("#right-col .card-title"), "乘积", "card title");
  eq(txt("#right-col .card-eyebrow"), "原码一位乘法", "algorithm title");
  const t = txt("#right-col");
  assert(t.includes("0.10001111"), "missing product bits");
  assert(t.includes("0.55859375"), "missing decimal product");
  assert(t.includes("143/256"), "missing fraction label");
  assert(t.includes("与机器结果一致"), "missing truth-check verdict");
});
check("compare table has 4 rows", () => {
  eq($$("#right-col .compare-table tbody tr").length, 4, "compare rows");
  assert(txt("#right-col").includes("原码 / 补码乘法对照"), "compare title");
});
check("paper multiplication card present", () => {
  assert(txt("#right-col").includes("原码尾数竖式"), "missing paper card");
  eq($$("#right-col .paper-line").length, 4 + 2 + 1, "paper line count");
});
check("rules aside lists 4 rules", () => {
  eq($$("#right-col .rules-list li").length, 4, "rule count");
  assert(txt("#right-col .rules-card").includes("原码一位乘法 · 规则"), "rules title");
});
check("steps section: 10 steps, all expanded", () => {
  assert(txt("#steps-host").includes("共 10 步"), `steps meta: ${txt("#steps-host .steps-meta")}`);
  eq($$("#steps-host .step").length, 10, "rendered steps");
  assert(txt("#steps-host .steps-meta").includes("全部展开"), "expand mode");
});
check("presets rendered", () => {
  eq($$("#presets .preset").length, 6, "preset count");
});

console.log("\n[interaction: 码制]");
buttonByText("码制").click();
check("convert mode hides Y operand and algo grid, title 机器码", () => {
  eq($("#operand-y").hidden, true, "operand-y hidden");
  eq($("#swap-row").hidden, true, "swap-row hidden");
  eq($("#algo-grid").hidden, true, "algo grid hidden");
  eq(txt("#right-col .card-title"), "机器码", "card title");
  assert(txt("#right-col").includes("原码 · 反码 · 补码 转换"), "convert algorithm title");
});
check("convert mode renders 2 steps", () => {
  eq($$("#steps-host .step").length, 2, "convert steps");
});
check("convert hides the compare table", () => {
  eq($$("#right-col .compare-table").length, 0, "no compare table");
});

console.log("\n[interaction: 除法 + 预设]");
buttonByText("除法").click();
check("division mode shows 商 and Y operand again", () => {
  eq(txt("#right-col .card-title"), "商", "card title");
  eq($("#operand-y").hidden, false, "operand-y visible");
  eq($$("#algo-grid .algo").length, 3, "division algo count");
  eq($$("#right-col .compare-table tbody tr").length, 3, "division compare rows");
});
buttonByText("0.1011 ÷ 0.1101").click();
check("preset 0.1011 ÷ 0.1101 yields quotient 0.1101 and a remainder", () => {
  const t = txt("#right-col");
  assert(t.includes("0.1101"), `missing quotient bits: ${t.slice(0, 200)}`);
  assert(t.includes("余数（权值 2⁻²ⁿ）"), "missing remainder section");
  eq($("#input-x").value, "0.1011", "input x");
  eq($("#input-y").value, "0.1101", "input y");
  eq(txt("#n-value"), "4", "n value");
});
check("restoring division flags an overflow-free 14-step trace", () => {
  assert(txt("#steps-host").includes("共 14 步"), `steps: ${txt("#steps-host .steps-meta")}`);
});

console.log("\n[interaction: 逐步导航]");
buttonByText("改为逐步").click();
check("step mode starts at step 1 with one visible step", () => {
  assert(txt("#steps-host .steps-meta").includes("看到第 1 步"), txt("#steps-host .steps-meta"));
  eq($$("#steps-host .step").length, 1, "visible steps");
  eq($$("#steps-host .step.is-active").length, 1, "active step");
});
check("next step advances to step 2", () => {
  const next = $$("#steps-host .btn-icon")[1];
  assert(next, "next button missing");
  next.click();
  assert(txt("#steps-host .steps-meta").includes("看到第 2 步"), txt("#steps-host .steps-meta"));
  eq($$("#steps-host .step").length, 2, "visible steps");
});
check("previous step goes back to step 1", () => {
  const prev = $$("#steps-host .btn-icon")[0];
  prev.click();
  assert(txt("#steps-host .steps-meta").includes("看到第 1 步"), txt("#steps-host .steps-meta"));
});
buttonByText("一次展开").click();
check("expand again restores all steps", () => {
  assert(txt("#steps-host .steps-meta").includes("全部展开"), txt("#steps-host .steps-meta"));
  eq($$("#steps-host .step").length, 14, "visible steps");
});

console.log("\n[interaction: 操作数编辑]");
// The section asserts against the stock operands, so pin the state first —
// the preset run above leaves 0.1011 / 0.1101 behind.
$("#reset").click();
buttonByText("乘法").click();
check("bit flip toggles the sign bit into the input", () => {
  const firstBit = $$("#pad-x .bit-btn")[0];
  assert(firstBit, "pad-x bit button missing");
  firstBit.click();
  eq($("#input-x").value, "1.1101", "input after sign flip");
  assert(txt("#forms-x").includes("−0.8125"), `negated true value: ${txt("#forms-x")}`);
});
check("取负 negates Y", () => {
  buttonByText("取负", $("#operand-y")).click();
  eq($("#input-y").value, "1.1011", "input y after negate");
});
check("交换 X / Y swaps the operands", () => {
  $("#swap").click();
  eq($("#input-x").value, "1.1011", "x after swap");
  eq($("#input-y").value, "1.1101", "y after swap");
});
check("typed input re-derives the result", () => {
  const input = $("#input-x");
  input.value = "0.1010";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert(txt("#right-col").includes("0.1010"), "result not re-derived");
  assert(txt("#right-col").includes("乘积"), "title lost after typing");
});
check("n stepper pads operands to 5 bits", () => {
  $("#n-inc").click();
  eq(txt("#n-value"), "5", "n value");
  eq($("#input-x").value, "0.10100", "x padded");
  eq($$("#pad-x .bit").length, 6, "pad-x bits");
  $("#n-dec").click();
  eq(txt("#n-value"), "4", "n value restored");
  eq($("#input-x").value, "0.1010", "x truncated back");
});
check("encoding switch updates the hint and re-renders", () => {
  buttonByText("补码输入").click();
  assert(txt("#encoding-hint").includes("符号位参与"), txt("#encoding-hint"));
  assert(txt("#encoding-hint").includes("0.6875"), "hint lost the decimal example");
  assert($("#forms-x").textContent.length > 0, "forms-x empty after encoding switch");
});
check("reset restores the initial state", () => {
  $("#reset").click();
  eq($("#input-x").value, "0.1101", "x after reset");
  eq($("#input-y").value, "0.1011", "y after reset");
  eq(txt("#op-tabs .op-tab.is-active"), "乘法", "op after reset");
  eq(txt("#right-col .card-title"), "乘积", "title after reset");
  assert(txt("#steps-host").includes("共 10 步"), "steps after reset");
});

console.log("\n[error paths]");
check("invalid input surfaces a message instead of crashing", () => {
  const input = $("#input-x");
  input.value = "0.1x1";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert(txt("#forms-x").includes("二进制只允许 0 / 1"), txt("#forms-x"));
  assert(txt("#right-col").includes("二进制只允许 0 / 1"), "right column should show the error");
  eq($$("#steps-host .step").length, 0, "no steps for invalid input");
});
check("division by zero is reported", () => {
  $("#reset").click();
  buttonByText("除法").click();
  const input = $("#input-y");
  input.value = "0.0000";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert(txt("#right-col").includes("除数为 0"), txt("#right-col").slice(0, 200));
});
check("out-of-range decimal is rejected", () => {
  $("#reset").click();
  const input = $("#input-x");
  input.value = "1.5";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert(txt("#forms-x").includes("定点小数要求"), txt("#forms-x"));
});

console.log("\n[console health]");
check("no jsdom / window errors during the whole session", () => {
  eq(jsdomErrors.length, 0, `errors: ${jsdomErrors.join(" | ")}`);
});

console.log(`\n${problems.length === 0 ? "ALL UI CHECKS PASSED" : `${problems.length} FAILURE(S)`}`);
if (problems.length) {
  for (const p of problems) console.log(" - " + p);
  process.exit(1);
}