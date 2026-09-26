// Runs the same extra sweeps against the ORIGINAL TypeScript source, to check
// whether mismatches are port bugs or pre-existing behaviour of the original.
import {
  complementToValue,
  divideComplement,
  divideNonrestoring,
  divideRestoring,
  multiplyComplement1,
  multiplyComplement2,
  multiplyOriginal1,
  multiplyOriginal2,
  originalToValue,
  valueToOriginal,
} from "file:///C:/Users/Yumao/Desktop/grok-workspace/src/lib/binary-arith.ts";

const ORIG = {
  multiplyOriginal1,
  multiplyOriginal2,
  multiplyComplement1,
  multiplyComplement2,
  divideRestoring,
  divideNonrestoring,
  divideComplement,
};

const PORT = await import("./logic.js");

function collect(fns, tag) {
  const bad = [];
  for (const n of [2, 3, 4, 5, 6]) {
    for (let a = -15; a <= 15; a++) {
      for (let b = -15; b <= 15; b++) {
        const x = valueToOriginal(a / 16, n);
        const y = valueToOriginal(b / 16, n);
        const exact = originalToValue(x) * originalToValue(y);
        const eps = n === 2 ? 1e-6 : 1e-6;
        for (const key of ["multiplyOriginal1", "multiplyOriginal2", "multiplyComplement1", "multiplyComplement2"]) {
          const got = fns[key](x, y).forms.value;
          if (Math.abs(got - exact) > eps) bad.push({ n, a, b, key, got, exact });
        }
      }
    }
  }
  return bad;
}

const badOrig = collect(ORIG, "orig");
const badPort = collect(PORT, "port");
console.log("ORIGINAL mismatches:", badOrig.length);
console.log("PORTED   mismatches:", badPort.length);
console.log("first 8 (original):");
for (const b of badOrig.slice(0, 8)) console.log("  ", JSON.stringify(b));
console.log("first 8 (ported):");
for (const b of badPort.slice(0, 8)) console.log("  ", JSON.stringify(b));

// Division identity sweep, both implementations.
function divSweep(mod, tag) {
  const bad = [];
  for (const n of [3, 4, 5]) {
    const scale = 2 ** n;
    for (let a = -Math.floor(scale / 2); a < scale / 2; a++) {
      for (let b = 1; b < scale / 2; b++) {
        const x = valueToOriginal(a / scale, n);
        const y = valueToOriginal(b / scale, n);
        for (const key of ["divideRestoring", "divideNonrestoring", "divideComplement"]) {
          const r = mod[key](x, y);
          if (!r.ok || r.warning) continue;
          const lhs = originalToValue(x);
          const rhs = r.forms.value * originalToValue(y) + (r.remainder?.value ?? 0);
          if (Math.abs(lhs - rhs) > 1e-6) bad.push({ n, a, b, key, lhs, rhs });
        }
      }
    }
  }
  return bad;
}

const dOrig = divSweep(ORIG, "orig");
const dPort = divSweep(PORT, "port");
console.log("division ORIGINAL mismatches:", dOrig.length);
console.log("division PORTED   mismatches:", dPort.length);
for (const b of dOrig.slice(0, 8)) console.log("  ", JSON.stringify(b));

// Behavioural diff: compare full outputs of both implementations on a grid.
let diffs = 0;
const samples = [];
for (const n of [2, 3, 4, 5, 6]) {
  for (let a = -16; a <= 15; a++) {
    for (let b = -16; b <= 15; b++) {
      const x = valueToOriginal(a / 16, n);
      const y = valueToOriginal(b / 16, n);
      for (const key of Object.keys(ORIG)) {
        const o = ORIG[key](x, y);
        const p = PORT[key](x, y);
        const so = JSON.stringify(o);
        const sp = JSON.stringify(p);
        if (so !== sp) {
          diffs++;
          if (samples.length < 3) samples.push({ n, a, b, key });
        }
      }
    }
  }
}
console.log("deep JSON diffs between original and ported:", diffs);
for (const s of samples) console.log("  ", JSON.stringify(s));