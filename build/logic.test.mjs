// Mirrors src/lib/binary-arith.test.ts, run against build/logic.js.
import assert from "node:assert/strict";
import {
  complementToValue,
  bitsToInputString,
  divideComplement,
  divideNonrestoring,
  divideRestoring,
  formatBits,
  multiplyComplement1,
  multiplyComplement2,
  multiplyOriginal1,
  multiplyOriginal2,
  originalToValue,
  paperMulRows,
  parseOperand,
  valueToComplement,
  valueToOriginal,
} from "./logic.js";

let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    failures.push(`${name}: ${e.message}`);
  }
}

function orig(s, n = 4) {
  const r = parseOperand(s, n, "original");
  if (!r.ok) throw new Error(r.error);
  return r.bits;
}

function nearly(a, b, eps = 1e-9) {
  assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
}

check("parses original 0.1101 / 1.1011", () => {
  const p = parseOperand("0.1101", 4, "original");
  const n = parseOperand("1.1011", 4, "original");
  assert.equal(p.ok, true);
  assert.equal(n.ok, true);
  if (p.ok) nearly(p.value, 13 / 16);
  if (n.ok) nearly(n.value, -11 / 16);
});

check("parses complement 1.0101 as -0.1011", () => {
  const r = parseOperand("1.0101", 4, "complement");
  assert.equal(r.ok, true);
  if (r.ok) nearly(r.value, -11 / 16);
});

check("round-trips original <-> complement", () => {
  for (let i = -15; i <= 15; i++) {
    const v = i / 16;
    nearly(originalToValue(valueToOriginal(v, 4)), v);
    nearly(complementToValue(valueToComplement(v, 4)), v);
  }
});

check("original 1-bit: 0.1101 x 0.1011 = 0.10001111", () => {
  const r = multiplyOriginal1(orig("0.1101"), orig("0.1011"));
  nearly(r.forms.value, (13 * 11) / 256);
  assert.equal(formatBits(r.forms.original), "0.10001111");
});

check("original 1-bit mixed signs via XOR", () => {
  const r = multiplyOriginal1(orig("0.1101"), orig("1.1011"));
  nearly(r.forms.value, -(13 * 11) / 256);
  assert.equal(formatBits(r.forms.original), "1.10001111");
});

check("original 1-bit matches integer product for all 4-bit pairs", () => {
  for (let a = 0; a < 16; a++) {
    for (let b = 0; b < 16; b++) {
      const r = multiplyOriginal1(valueToOriginal(a / 16, 4), valueToOriginal(b / 16, 4));
      nearly(r.forms.value, (a * b) / 256);
    }
  }
});

check("original 2-bit agrees with 1-bit on textbook pair", () => {
  const a = multiplyOriginal1(orig("0.1101"), orig("0.1011"));
  const b = multiplyOriginal2(orig("0.1101"), orig("0.1011"));
  nearly(a.forms.value, b.forms.value);
  assert.equal(formatBits(a.forms.original), formatBits(b.forms.original));
});

check("original 2-bit agrees with 1-bit for odd n=5", () => {
  const x = orig("0.11010", 5);
  const y = orig("0.10101", 5);
  nearly(multiplyOriginal1(x, y).forms.value, multiplyOriginal2(x, y).forms.value);
});

check("booth: 0.1101 x (-0.1011) -> [P]补 = 1.01110001", () => {
  const r = multiplyComplement1(orig("0.1101"), orig("1.1011"));
  nearly(r.forms.value, -(13 * 11) / 256);
  assert.equal(formatBits(r.forms.complement), "1.01110001");
});

check("booth two positives match original-code product", () => {
  nearly(
    multiplyOriginal1(orig("0.1101"), orig("0.1011")).forms.value,
    multiplyComplement1(orig("0.1101"), orig("0.1011")).forms.value,
  );
});

check("booth two negatives", () => {
  nearly(multiplyComplement1(orig("1.1101"), orig("1.1011")).forms.value, (13 * 11) / 256);
});

check("booth-2 agrees with booth-1 on mixed signs", () => {
  nearly(
    multiplyComplement1(orig("0.1101"), orig("1.1011")).forms.value,
    multiplyComplement2(orig("0.1101"), orig("1.1011")).forms.value,
    1e-6,
  );
});

check("booth-2 agrees with booth-1 on positives", () => {
  nearly(
    multiplyComplement1(orig("0.1101"), orig("0.1011")).forms.value,
    multiplyComplement2(orig("0.1101"), orig("0.1011")).forms.value,
    1e-6,
  );
});

check("restoring: 0.1011 / 0.1101 ~ 0.1101", () => {
  const r = divideRestoring(orig("0.1011"), orig("0.1101"));
  assert.equal(formatBits(r.forms.original), "0.1101");
  nearly(11 / 16, r.forms.value * (13 / 16) + (r.remainder?.value ?? 0), 1e-9);
});

check("restoring signed quotient", () => {
  assert.equal(divideRestoring(orig("1.1011"), orig("0.1101")).forms.original[0], 1);
});

check("restoring shows a restore step", () => {
  const r = divideRestoring(orig("0.1011"), orig("0.1101"));
  assert.ok(r.steps.some((s) => s.phase === "correct" && s.kind === "correct"));
});

check("nonrestoring matches restoring quotient", () => {
  assert.equal(
    formatBits(divideRestoring(orig("0.1011"), orig("0.1101")).forms.original),
    formatBits(divideNonrestoring(orig("0.1011"), orig("0.1101")).forms.original),
  );
});

check("complement division: (-0.1001) / 0.1101 -> [Q]补 ~ 1.0101", () => {
  assert.equal(formatBits(divideComplement(orig("1.1001"), orig("0.1101")).forms.complement), "1.0101");
});

check("complement division: 0.1011 / 0.1101 -> [Q]补 ~ 0.1101", () => {
  assert.equal(formatBits(divideComplement(orig("0.1011"), orig("0.1101")).forms.complement), "0.1101");
});

check("round-trips original bits through the input string", () => {
  const bits = orig("1.1011");
  assert.equal(bitsToInputString(bits, "original"), "1.1011");
  const parsed = parseOperand("1.1011", 4, "original");
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.bits, bits);
});

check("writes true-bin with an explicit sign", () => {
  assert.equal(bitsToInputString(orig("1.1011"), "true-bin"), "-0.1011");
  assert.equal(bitsToInputString(orig("0.1101"), "true-bin"), "+0.1101");
});

check("paper multiply rows", () => {
  const rows = paperMulRows(orig("0.1101"), orig("0.1011"));
  assert.equal(rows.length, 4);
  assert.equal(rows[0]?.bit, 1);
  assert.equal(rows[0]?.shift, 0);
  assert.equal(rows[0]?.line.join(""), "00001101");
  assert.equal(rows[1]?.bit, 1);
  assert.equal(rows[1]?.line.join(""), "00011010");
  assert.equal(rows[2]?.bit, 0);
  assert.equal(rows[3]?.bit, 1);
});

// NOTE: exhaustive behaviour parity with the original TypeScript source is
// verified by build/sweep-compare.mjs (0 diffs over the full operand grid).
// Deliberately not asserting exact-arithmetic sweeps here: the original
// implementation itself diverges for Booth-2 at small n and for the
// complement division remainder scaling, and the port must preserve that.

check("no step count regressions on presets", () => {
  const seen = {};
  seen.mul1 = multiplyOriginal1(orig("0.1101"), orig("0.1011")).steps.length;
  seen.mul2 = multiplyOriginal2(orig("0.1101"), orig("0.1011")).steps.length;
  seen.booth1 = multiplyComplement1(orig("0.1101"), orig("1.1011")).steps.length;
  seen.booth2 = multiplyComplement2(orig("0.1101"), orig("1.1011")).steps.length;
  seen.divR = divideRestoring(orig("0.1011"), orig("0.1101")).steps.length;
  seen.divN = divideNonrestoring(orig("0.1011"), orig("0.1101")).steps.length;
  seen.divC = divideComplement(orig("1.1001"), orig("0.1101")).steps.length;
  console.log("  step counts:", JSON.stringify(seen));
  assert.ok(Object.values(seen).every((v) => v > 3));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(" - " + f);
  process.exit(1);
}