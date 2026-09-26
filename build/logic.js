// Ported from src/lib/binary-arith.ts (定点演算纸) — plain JS, no TS syntax.
// `export` keywords are stripped when inlined into the single-file HTML build.

export const MAX_N = 12;
export const MIN_N = 2;

export function clampN(n) {
  return Math.min(MAX_N, Math.max(MIN_N, Math.round(n)));
}

export function intToBits(value, width) {
  const bits = [];
  const mask = width >= 31 ? 0x7fffffff : (1 << width) - 1;
  const v = value & mask;
  for (let i = width - 1; i >= 0; i--) {
    bits.push((v >> i) & 1);
  }
  return bits;
}

export function bitsToInt(bits) {
  let v = 0;
  for (const b of bits) v = (v << 1) | b;
  return v >>> 0;
}

export function formatBits(bits, point = 1) {
  if (bits.length === 0) return "";
  const p = Math.min(Math.max(point, 0), bits.length);
  return `${bits.slice(0, p).join("")}.${bits.slice(p).join("")}`;
}

export function bitsToInputString(bits, encoding) {
  if (bits.length === 0) return "";
  const frac = bits.slice(1).join("");
  if (encoding === "true-bin") {
    return `${bits[0] === 1 ? "-" : "+"}0.${frac}`;
  }
  return `${bits[0]}.${frac}`;
}

export function paperMulRows(x, y) {
  const n = x.length - 1;
  const xMag = x.slice(1);
  const yMag = y.slice(1);
  const width = 2 * n;
  return [...yMag].reverse().map((bit, shift) => {
    const line = Array(width).fill(0);
    const mag = bit === 1 ? xMag : xMag.map(() => 0);
    for (let i = 0; i < n; i++) {
      line[width - n - shift + i] = mag[i];
    }
    return { bit, shift, line };
  });
}

function maskW(width) {
  if (width <= 0) return 0;
  if (width >= 31) return 0x7fffffff;
  return (1 << width) - 1;
}

function addW(a, b, width) {
  return (a + b) & maskW(width);
}

function negW(a, width) {
  return addW(~a, 1, width);
}

function signExtend(value, from, to) {
  const sign = (value >> (from - 1)) & 1;
  if (!sign) return value & maskW(from);
  const high = maskW(to) ^ maskW(from);
  return (value & maskW(from)) | high;
}

function sameSign(a, b, width) {
  const bit = 1 << (width - 1);
  return (a & bit) === (b & bit);
}

export function originalToValue(bits) {
  const n = bits.length - 1;
  const sign = bits[0];
  const mag = bitsToInt(bits.slice(1));
  const v = mag / 2 ** n;
  return sign ? -v : v;
}

export function complementToValue(bits) {
  const n = bits.length - 1;
  const raw = bitsToInt(bits);
  const signBit = bits[0];
  if (!signBit) return raw / 2 ** n;
  return (raw - 2 ** (n + 1)) / 2 ** n;
}

export function onesToValue(bits) {
  const n = bits.length - 1;
  if (bits[0] === 0) return bitsToInt(bits.slice(1)) / 2 ** n;
  const mag = bitsToInt(bits.slice(1).map((b) => (b ? 0 : 1)));
  return -mag / 2 ** n;
}

export function valueToOriginal(value, n) {
  const scale = 2 ** n;
  const sign = value < 0 ? 1 : 0;
  let mag = Math.round(Math.abs(value) * scale);
  if (mag >= scale) mag = scale - 1;
  return [sign, ...intToBits(mag, n)];
}

export function valueToComplement(value, n) {
  const scale = 2 ** n;
  let int = Math.round(value * scale);
  const min = -scale;
  const max = scale - 1;
  if (int < min) int = min;
  if (int > max) int = max;
  if (int < 0) int += 2 * scale;
  return intToBits(int, n + 1);
}

export function valueToOnes(value, n) {
  const orig = valueToOriginal(value, n);
  if (orig[0] === 0) return orig;
  return [1, ...orig.slice(1).map((b) => (b ? 0 : 1))];
}

export function originalToComplement(orig) {
  return valueToComplement(originalToValue(orig), orig.length - 1);
}

export function complementToOriginal(comp) {
  return valueToOriginal(complementToValue(comp), comp.length - 1);
}

export function originalToOnes(orig) {
  if (orig[0] === 0) return [...orig];
  return [1, ...orig.slice(1).map((b) => (b ? 0 : 1))];
}

export function encodeForms(value, n, overflow = false) {
  return {
    n,
    value,
    original: valueToOriginal(value, n),
    complement: valueToComplement(value, n),
    ones: valueToOnes(value, n),
    overflow,
  };
}

function padFrac(frac, n) {
  if (frac.length === n) return { bits: frac };
  if (frac.length < n) {
    return {
      bits: [...frac, ...Array(n - frac.length).fill(0)],
      note: `尾数不足 ${n} 位，右侧补 0`,
    };
  }
  return {
    bits: frac.slice(0, n),
    note: `尾数超过 ${n} 位，截取高 ${n} 位`,
  };
}

export function parseOperand(raw, n, encoding) {
  const text = raw.trim().replace(/\s+/g, "");
  if (!text) return { ok: false, error: "请输入操作数" };

  if (/[2-9]/.test(text) || /e/i.test(text) || text.includes("E")) {
    const num = Number(text);
    if (!Number.isFinite(num)) return { ok: false, error: "无法解析十进制数" };
    if (Math.abs(num) >= 1) {
      return { ok: false, error: "定点小数要求 |真值| < 1（补码可表示 −1）" };
    }
    const bits =
      encoding === "complement" ? valueToComplement(num, n) : valueToOriginal(num, n);
    return {
      ok: true,
      bits,
      n,
      value: encoding === "complement" ? complementToValue(bits) : originalToValue(bits),
      encoding,
      note: "已按十进制真值量化到定点格式",
    };
  }

  const minus = text.startsWith("-");
  const plus = text.startsWith("+");
  const body = minus || plus ? text.slice(1) : text;
  const cleaned = body.replace(/^0+b/i, "");
  const parts = cleaned.split(".");
  if (parts.length > 2) return { ok: false, error: "二进制格式应为 s.xxxx 或 ±0.xxxx" };

  const intPart = parts[0] ?? "";
  const fracPart = parts[1] ?? "";
  if (![...intPart, ...fracPart].every((c) => c === "0" || c === "1")) {
    return { ok: false, error: "二进制只允许 0 / 1" };
  }

  if (encoding === "true-bin" || minus || plus) {
    const fracBits = fracPart.split("").map((c) => (c === "1" ? 1 : 0));
    const { bits: padded, note } = padFrac(fracBits, n);
    const sign = minus ? 1 : 0;
    const bits = [sign, ...padded];
    return { ok: true, bits, n, value: originalToValue(bits), encoding: "true-bin", note };
  }

  let signBits;
  if (intPart.length === 0) signBits = [0];
  else signBits = intPart.split("").map((c) => (c === "1" ? 1 : 0));
  const sign = signBits[signBits.length - 1] ?? 0;
  const fracBits = fracPart.split("").map((c) => (c === "1" ? 1 : 0));
  const { bits: padded, note } = padFrac(fracBits, n);
  const bits = [sign, ...padded];
  const value =
    encoding === "complement" ? complementToValue(bits) : originalToValue(bits);
  return { ok: true, bits, n, value, encoding, note };
}

function reg(name, value, width, point, extra) {
  return { name, bits: intToBits(value, width), point, extra };
}

function magOfOriginal(bits) {
  return bitsToInt(bits.slice(1));
}

export function multiplyOriginal1(x, y) {
  const n = x.length - 1;
  const xs = x[0];
  const ys = y[0];
  const ps = xs ^ ys;
  const M = magOfOriginal(x);
  let A = 0;
  let Q = magOfOriginal(y);
  const aWidth = n + 1;
  const steps = [
    {
      i: 0,
      phase: "init",
      judge: "—",
      operation: "置初值",
      registers: [reg("A 部分积", A, aWidth, 1), reg("|Y| 乘数", Q, n, 0)],
      note: "原码一位乘法只对尾数绝对值运算。符号单独处理：Ps = Xs ⊕ Ys。A 多留 1 位整数位，防止加法进位。",
      kind: "info",
    },
  ];

  for (let i = 1; i <= n; i++) {
    const ybit = Q & 1;
    if (ybit === 1) {
      A = addW(A, M, aWidth);
      steps.push({
        i,
        phase: "operate",
        judge: "yn = 1",
        operation: "A ← A + |X|",
        registers: [reg("A 部分积", A, aWidth, 1), reg("|Y| 乘数", Q, n, 0)],
        note: `第 ${i} 步：乘数最低位为 1，部分积加上被乘数绝对值。`,
        kind: "add",
      });
    } else {
      steps.push({
        i,
        phase: "operate",
        judge: "yn = 0",
        operation: "A ← A + 0",
        registers: [reg("A 部分积", A, aWidth, 1), reg("|Y| 乘数", Q, n, 0)],
        note: `第 ${i} 步：乘数最低位为 0，部分积保持不变。`,
        kind: "zero",
      });
    }
    const combined = (A << n) | Q;
    const shifted = combined >> 1;
    A = shifted >> n;
    Q = shifted & maskW(n);
    steps.push({
      i,
      phase: "shift",
      judge: "—",
      operation: "逻辑右移 1 位",
      registers: [reg("A 部分积", A, aWidth, 1), reg("|Y| 乘数", Q, n, 0)],
      note: "A 与乘数寄存器拼接后逻辑右移，高位补 0。移出的 yn 不再使用。",
      kind: "shift",
    });
  }

  const productMag = ((A << n) | Q) & maskW(2 * n);
  const magBits = intToBits(productMag, 2 * n);
  const value = (ps ? -1 : 1) * (productMag / 2 ** (2 * n));
  steps.push({
    i: n + 1,
    phase: "done",
    judge: `Ps = ${xs} ⊕ ${ys} = ${ps}`,
    operation: "拼接符号与尾数",
    registers: [
      {
        name: "[P]原",
        bits: [ps, ...magBits],
        point: 1,
      },
    ],
    note: `乘积原码 = ${formatBits([ps, ...magBits])}，共 1 位符号 + ${2 * n} 位尾数。`,
    kind: "info",
  });

  return {
    ok: true,
    forms: encodeForms(value, 2 * n),
    steps,
    algorithm: "original-1",
    algorithmTitle: "原码一位乘法",
    ruleLines: [
      "符号位单独计算：乘积符号 = Xs ⊕ Ys。",
      "尾数按无符号数做移位加：yn=1 则部分积加 |X|，yn=0 则加 0。",
      "每步结束后，部分积与乘数逻辑右移 1 位，共做 n 步。",
      "结果为 2n 位尾数的原码定点小数。",
    ],
  };
}

export function multiplyOriginal2(x, y) {
  const n = x.length - 1;
  const xs = x[0];
  const ys = y[0];
  const ps = xs ^ ys;
  const M = magOfOriginal(x);
  const twoM = M << 1;
  const threeM = twoM + M;
  let magBitsY = y.slice(1);
  let workN = n;
  let padNote;
  if (n % 2 === 1) {
    magBitsY = [0, ...magBitsY];
    workN = n + 1;
    padNote = "尾数位数为奇数，乘数高位补 0，按两位一组处理。";
  }
  let A = 0;
  let Q = bitsToInt(magBitsY);
  const aWidth = workN + 3;
  const steps = [
    {
      i: 0,
      phase: "init",
      judge: "—",
      operation: "置初值",
      registers: [reg("A 部分积", A, aWidth, 1), reg("|Y| 乘数", Q, workN, 0)],
      note:
        "原码两位乘法每次取乘数最低两位。00→+0，01→+|X|，10→+2|X|，11→+3|X|，然后逻辑右移 2 位。" +
        (padNote ? ` ${padNote}` : ""),
      kind: "info",
    },
  ];

  const groups = workN / 2;
  for (let i = 1; i <= groups; i++) {
    const pair = Q & 3;
    let addend = 0;
    let op = "A ← A + 0";
    let judge = "yn+1 yn = 00";
    let kind = "zero";
    if (pair === 1) {
      addend = M;
      op = "A ← A + |X|";
      judge = "yn+1 yn = 01";
      kind = "add";
    } else if (pair === 2) {
      addend = twoM;
      op = "A ← A + 2|X|";
      judge = "yn+1 yn = 10";
      kind = "add";
    } else if (pair === 3) {
      addend = threeM;
      op = "A ← A + 3|X|";
      judge = "yn+1 yn = 11";
      kind = "add";
    }
    A = addW(A, addend, aWidth);
    steps.push({
      i,
      phase: "operate",
      judge,
      operation: op,
      registers: [reg("A 部分积", A, aWidth, 1), reg("|Y| 乘数", Q, workN, 0)],
      note: `第 ${i} 组：根据乘数最低两位 ${intToBits(pair, 2).join("")} 选择加数。`,
      kind,
    });
    const combined = (A << workN) | Q;
    const shifted = combined >> 2;
    A = shifted >> workN;
    Q = shifted & maskW(workN);
    steps.push({
      i,
      phase: "shift",
      judge: "—",
      operation: "逻辑右移 2 位",
      registers: [reg("A 部分积", A, aWidth, 1), reg("|Y| 乘数", Q, workN, 0)],
      note: "部分积与乘数一起右移两位，相当于处理完这一组。",
      kind: "shift",
    });
  }

  const productMag = ((A << workN) | Q) & maskW(2 * n);
  const magBits = intToBits(productMag, 2 * n);
  const value = (ps ? -1 : 1) * (productMag / 2 ** (2 * n));
  steps.push({
    i: groups + 1,
    phase: "done",
    judge: `Ps = ${xs} ⊕ ${ys} = ${ps}`,
    operation: "拼接符号与尾数",
    registers: [{ name: "[P]原", bits: [ps, ...magBits], point: 1 }],
    note: `乘积原码 = ${formatBits([ps, ...magBits])}。`,
    kind: "info",
  });

  return {
    ok: true,
    forms: encodeForms(value, 2 * n),
    steps,
    algorithm: "original-2",
    algorithmTitle: "原码两位乘法",
    ruleLines: [
      "符号位：Ps = Xs ⊕ Ys，与一位乘法相同。",
      "乘数两位一组，从低位开始：00 加 0，01 加 |X|，10 加 2|X|，11 加 3|X|。",
      "每组运算后逻辑右移 2 位，步数约为 n/2。",
      "硬件上通常预置 |X| 与 2|X|，3|X| 由二者相加得到。",
    ],
  };
}

export function multiplyComplement1(xOrig, yOrig) {
  const n = xOrig.length - 1;
  const xComp = originalToComplement(xOrig);
  const yComp = originalToComplement(yOrig);
  const width = n + 1;
  const aWidth = n + 2;
  const M = signExtend(bitsToInt(xComp), width, aWidth);
  const minusM = negW(M, aWidth);
  let A = 0;
  let Q = bitsToInt(yComp);
  let qMinus = 0;
  const steps = [
    {
      i: 0,
      phase: "init",
      judge: "yₙ yₙ₊₁ = " + `${Q & 1}${qMinus}`,
      operation: "置初值，附加位 = 0",
      registers: [
        reg("A 部分积", A, aWidth, 2),
        { ...reg("[Y]补", Q, width, 1), extra: qMinus },
      ],
      note: `先把 X、Y 转成补码：[X]补=${formatBits(xComp)}，[Y]补=${formatBits(yComp)}。[−X]补=${formatBits(intToBits(minusM, aWidth), 2)}。符号位参与运算，部分积用双符号位。`,
      kind: "info",
    },
  ];

  for (let i = 1; i <= width; i++) {
    const q0 = Q & 1;
    const pair = `${q0}${qMinus}`;
    let op = "不操作";
    let kind = "zero";
    if (q0 === 0 && qMinus === 1) {
      A = addW(A, M, aWidth);
      op = "A ← A + [X]补";
      kind = "add";
    } else if (q0 === 1 && qMinus === 0) {
      A = addW(A, minusM, aWidth);
      op = "A ← A + [−X]补";
      kind = "sub";
    }
    steps.push({
      i,
      phase: "operate",
      judge: `yi yi+1 = ${pair}`,
      operation: op,
      registers: [
        reg("A 部分积", A, aWidth, 2),
        { ...reg("[Y]补", Q, width, 1), extra: qMinus },
      ],
      note:
        pair === "01"
          ? "相邻两位为 01，相当于乘数这一位由 0 变 1，加上 [X]补。"
          : pair === "10"
            ? "相邻两位为 10，相当于乘数这一位由 1 变 0，加上 [−X]补。"
            : "相邻两位相同（00 或 11），部分积不变。",
      kind,
    });
    const aSign = (A >> (aWidth - 1)) & 1;
    const aLsb = A & 1;
    const qLsb = Q & 1;
    A = (aSign << (aWidth - 1)) | (A >> 1);
    Q = (aLsb << (width - 1)) | (Q >> 1);
    qMinus = qLsb;
    steps.push({
      i,
      phase: "shift",
      judge: "—",
      operation: "算术右移 1 位",
      registers: [
        reg("A 部分积", A, aWidth, 2),
        { ...reg("[Y]补", Q, width, 1), extra: qMinus },
      ],
      note: "双符号位一起算术右移：高位补符号，A 的最低位移入 Y，Y 的最低位成为新的附加位。",
      kind: "shift",
    });
  }

  const full = intToBits((A << width) | Q, aWidth + width);
  const productBits = full.slice(2);
  const value = complementToValue(productBits);
  const overflow = Math.abs(originalToValue(xOrig) * originalToValue(yOrig)) >= 1;

  steps.push({
    i: width + 1,
    phase: "done",
    judge: "—",
    operation: "取双符号中的一位 + 2n 位尾数",
    registers: [{ name: "[P]补", bits: productBits, point: 1 }],
    note: `乘积补码 = ${formatBits(productBits)}。共做 ${width} 次判断与 ${width} 次算术右移。`,
    kind: "info",
  });

  return {
    ok: true,
    warning: overflow ? "−1 × −1 = +1，超出定点小数表示范围。" : undefined,
    forms: encodeForms(value, 2 * n, overflow),
    steps,
    algorithm: "complement-1",
    algorithmTitle: "补码一位乘法（Booth）",
    ruleLines: [
      "符号位参与运算，部分积使用双符号位。乘数末尾增设附加位 yₙ₊₁=0。",
      "比较 yi yi+1：01 加 [X]补，10 加 [−X]补，00 / 11 不加。",
      "每步之后算术右移 1 位，共 n+1 步（含符号位）。",
      "结果直接为乘积的补码，再转换为原码 / 反码 / 真值。",
    ],
  };
}

function booth2Recode(triplet) {
  switch (triplet) {
    case 0b000:
    case 0b111:
      return { add: "0", label: "0" };
    case 0b001:
    case 0b010:
      return { add: "+M", label: "+[X]补" };
    case 0b011:
      return { add: "+2M", label: "+2[X]补" };
    case 0b100:
      return { add: "-2M", label: "−2[X]补" };
    case 0b101:
    case 0b110:
      return { add: "-M", label: "−[X]补" };
    default:
      return { add: "0", label: "0" };
  }
}

export function multiplyComplement2(xOrig, yOrig) {
  const n = xOrig.length - 1;
  const xComp = originalToComplement(xOrig);
  const yComp = originalToComplement(yOrig);
  const width = n + 1;
  let padWidth = width;
  let Q = bitsToInt(yComp);
  if (padWidth % 2 === 1) {
    Q = signExtend(Q, width, width + 1);
    padWidth = width + 1;
  }
  const aWidth = padWidth;
  const M = signExtend(bitsToInt(xComp), width, aWidth);
  const twoM = addW(M, M, aWidth);
  const minusM = negW(M, aWidth);
  const minus2M = negW(twoM, aWidth);
  let A = 0;
  let qMinus = 0;
  const steps = [
    {
      i: 0,
      phase: "init",
      judge: "—",
      operation: "置初值，y₋₁ = 0" + (padWidth !== width ? "，符号位扩展 1 位" : ""),
      registers: [
        reg("A 部分积", A, aWidth, 2),
        { ...reg("[Y]补", Q, padWidth, 1), extra: qMinus },
      ],
      note: `Booth 两位编码（基 4）。[X]补=${formatBits(xComp)}，[Y]补=${formatBits(yComp)}。每次看 y₂ᵢ₊₁ y₂ᵢ y₂ᵢ₋₁ 三位，然后算术右移 2 位。`,
      kind: "info",
    },
  ];

  const cycles = padWidth / 2;
  for (let i = 1; i <= cycles; i++) {
    const q0 = Q & 1;
    const q1 = (Q >> 1) & 1;
    const triplet = (q1 << 2) | (q0 << 1) | qMinus;
    const rec = booth2Recode(triplet);
    let kind = "zero";
    if (rec.add === "+M") {
      A = addW(A, M, aWidth);
      kind = "add";
    } else if (rec.add === "+2M") {
      A = addW(A, twoM, aWidth);
      kind = "add";
    } else if (rec.add === "-M") {
      A = addW(A, minusM, aWidth);
      kind = "sub";
    } else if (rec.add === "-2M") {
      A = addW(A, minus2M, aWidth);
      kind = "sub";
    }
    steps.push({
      i,
      phase: "operate",
      judge: `y₂ᵢ₊₁ y₂ᵢ y₋₁ = ${q1}${q0}${qMinus}`,
      operation:
        rec.add === "0"
          ? "不操作"
          : rec.add === "+M"
            ? "A ← A + [X]补"
            : rec.add === "+2M"
              ? "A ← A + 2[X]补"
              : rec.add === "-M"
                ? "A ← A + [−X]补"
                : "A ← A + [−2X]补",
      registers: [
        reg("A 部分积", A, aWidth, 2),
        { ...reg("[Y]补", Q, padWidth, 1), extra: qMinus },
      ],
      note: `编码 ${q1}${q0}${qMinus} → ${rec.label}。`,
      kind,
    });
    for (let s = 0; s < 2; s++) {
      const aSign = (A >> (aWidth - 1)) & 1;
      const aLsb = A & 1;
      const qLsb = Q & 1;
      A = (aSign << (aWidth - 1)) | (A >> 1);
      Q = (aLsb << (padWidth - 1)) | (Q >> 1);
      qMinus = qLsb;
    }
    steps.push({
      i,
      phase: "shift",
      judge: "—",
      operation: "算术右移 2 位",
      registers: [
        reg("A 部分积", A, aWidth, 2),
        { ...reg("[Y]补", Q, padWidth, 1), extra: qMinus },
      ],
      note: "一次处理两位乘数，部分积算术右移两位。",
      kind: "shift",
    });
  }

  const full = intToBits((A << padWidth) | Q, aWidth + padWidth);
  const want = 1 + 2 * n;
  const drop = full.length - want;
  const productBits = drop > 0 ? full.slice(drop) : full;
  const value = complementToValue(productBits);

  steps.push({
    i: cycles + 1,
    phase: "done",
    judge: "—",
    operation: "截取 1 位符号 + 2n 位尾数",
    registers: [{ name: "[P]补", bits: productBits, point: 1 }],
    note: `乘积补码 = ${formatBits(productBits)}。`,
    kind: "info",
  });

  return {
    ok: true,
    forms: encodeForms(value, 2 * n),
    steps,
    algorithm: "complement-2",
    algorithmTitle: "补码两位乘法（Booth-2）",
    ruleLines: [
      "符号位参与运算。乘数附加 y₋₁=0；若位数为奇数则符号扩展 1 位。",
      "每次取三位 y₂ᵢ₊₁ y₂ᵢ y₂ᵢ₋₁：000/111→0，001/010→+X，011→+2X，100→−2X，101/110→−X。",
      "操作后算术右移 2 位，循环 n/2 次量级。",
      "结果为乘积补码。",
    ],
  };
}

export function divideRestoring(x, y) {
  const n = x.length - 1;
  const xs = x[0];
  const ys = y[0];
  const qs = xs ^ ys;
  const rs = xs;
  const xMag = magOfOriginal(x);
  const yMag = magOfOriginal(y);
  if (yMag === 0) {
    return {
      ok: false,
      error: "除数为 0",
      forms: encodeForms(0, n),
      steps: [],
      algorithm: "restoring",
      algorithmTitle: "原码恢复余数除法",
      ruleLines: [],
    };
  }
  const overflow = xMag >= yMag;
  let R = xMag;
  let Q = 0;
  const rWidth = n + 1;
  const steps = [
    {
      i: 0,
      phase: "init",
      judge: overflow ? "|X| ≥ |Y|，商溢出" : "|X| < |Y|",
      operation: "置初值",
      registers: [
        reg("余数 R", R, rWidth, 1),
        reg("|Y| 除数", yMag, n, 0),
        { name: "|Q| 商", bits: intToBits(Q, n), point: 0 },
      ],
      note: `原码除法：符号 Qs = Xs ⊕ Ys = ${qs}，余数符号与被除数相同。只对绝对值作恢复余数除法。${overflow ? " |X|≥|Y| 时定点小数商的绝对值 ≥ 1，仍按 n 位小数继续演算（整数位溢出）。" : ""}`,
      kind: overflow ? "correct" : "info",
    },
  ];

  for (let i = 1; i <= n; i++) {
    R = R << 1;
    steps.push({
      i,
      phase: "shift",
      judge: "—",
      operation: "余数左移 1 位",
      registers: [
        reg("余数 R", R, rWidth + 1, 1),
        { name: "|Q| 商", bits: intToBits(Q, n), point: 0 },
      ],
      note: `第 ${i} 步：先把余数左移，空出最低位准备上商。`,
      kind: "shift",
    });
    const trial = R - yMag;
    const trialWidth = rWidth + 1;
    const trialShown = trial < 0 ? addW(trial, 1 << trialWidth, trialWidth) : trial;
    steps.push({
      i,
      phase: "operate",
      judge: "试探减法",
      operation: "R ← R − |Y|",
      registers: [
        reg("余数 R", trialShown, trialWidth, 1),
        { name: "|Q| 商", bits: intToBits(Q, n), point: 0 },
      ],
      note: trial >= 0
        ? "差 ≥ 0，够减。"
        : "差 < 0，不够减。下面把刚减去的 |Y| 加回去，恢复余数。",
      kind: "sub",
    });
    if (trial >= 0) {
      R = trial;
      Q = (Q << 1) | 1;
      steps.push({
        i,
        phase: "judge",
        judge: "余数 − |Y| ≥ 0",
        operation: "上商 1，余数保持相减结果",
        registers: [
          reg("余数 R", R, rWidth, 1),
          { name: "|Q| 商", bits: intToBits(Q, i), point: 0 },
        ],
        note: "够减：商 1，不需要恢复。",
        kind: "info",
      });
    } else {
      Q = (Q << 1) | 0;
      R = trial + yMag;
      steps.push({
        i,
        phase: "correct",
        judge: "余数 − |Y| < 0",
        operation: "上商 0，R ← R + |Y|（恢复）",
        registers: [
          reg("余数 R", R, rWidth + 1, 1),
          { name: "|Q| 商", bits: intToBits(Q, i), point: 0 },
        ],
        note: "不够减：商 0，加回 |Y|，余数回到左移后、相减前的值。",
        kind: "correct",
      });
    }
  }

  const qValue = (qs ? -1 : 1) * (Q / 2 ** n);
  const rValue = (rs ? -1 : 1) * (R / 2 ** (2 * n));
  steps.push({
    i: n + 1,
    phase: "done",
    judge: `Qs = ${xs} ⊕ ${ys} = ${qs}`,
    operation: "装配商与余数",
    registers: [
      { name: "[Q]原", bits: [qs, ...intToBits(Q, n)], point: 1 },
      { name: "余数寄存器", bits: intToBits(R, n + 1), point: 1 },
    ],
    note: `商原码 = ${formatBits([qs, ...intToBits(Q, n)])}。余数真值 = r / 2^{2n}，与被除数同号。校验：X = Q·Y + R。`,
    kind: "info",
  });

  return {
    ok: true,
    warning: overflow ? "溢出：|被除数| ≥ |除数|，商的绝对值 ≥ 1，超出纯小数表示。" : undefined,
    forms: encodeForms(qValue, n, overflow),
    remainder: encodeForms(rValue, 2 * n),
    steps,
    algorithm: "restoring",
    algorithmTitle: "原码恢复余数除法",
    ruleLines: [
      "符号：商符号 = Xs ⊕ Ys，余数符号与被除数相同。",
      "每步：余数左移，减 |Y|。差 ≥ 0 上商 1；差 < 0 上商 0 并加回 |Y|（恢复）。",
      "共上商 n 位。余数在寄存器中的权值为 2⁻²ⁿ。",
      "要求 |X| < |Y|，否则整数位溢出。",
    ],
  };
}

export function divideNonrestoring(x, y) {
  const n = x.length - 1;
  const xs = x[0];
  const ys = y[0];
  const qs = xs ^ ys;
  const rs = xs;
  const xMag = magOfOriginal(x);
  const yMag = magOfOriginal(y);
  if (yMag === 0) {
    return {
      ok: false,
      error: "除数为 0",
      forms: encodeForms(0, n),
      steps: [],
      algorithm: "nonrestoring",
      algorithmTitle: "原码加减交替除法",
      ruleLines: [],
    };
  }
  const overflow = xMag >= yMag;
  let R = xMag;
  let Q = 0;
  const rWidth = n + 2;
  const steps = [
    {
      i: 0,
      phase: "init",
      judge: overflow ? "|X| ≥ |Y|" : "|X| < |Y|",
      operation: "置初值",
      registers: [
        reg("余数 R", R, rWidth, 1),
        reg("|Y| 除数", yMag, n, 0),
      ],
      note: "加减交替（不恢复余数）：余数为正时左移减除数，为负时左移加除数。最后若余数为负再恢复一次，得到正确余数。",
      kind: "info",
    },
  ];

  for (let i = 1; i <= n; i++) {
    const wasPos = R >= 0;
    if (wasPos) {
      R = (R << 1) - yMag;
    } else {
      R = (R << 1) + yMag;
    }
    const qbit = R >= 0 ? 1 : 0;
    Q = (Q << 1) | qbit;
    steps.push({
      i,
      phase: "operate",
      judge: wasPos ? "余数 ≥ 0" : "余数 < 0",
      operation: wasPos ? "R ← (R≪1) − |Y|" : "R ← (R≪1) + |Y|",
      registers: [
        reg("余数 R", R < 0 ? (R + (1 << rWidth)) & maskW(rWidth) : R, rWidth, 1),
        { name: "|Q| 商", bits: intToBits(Q, i), point: 0 },
      ],
      note: `新余数${R >= 0 ? "≥" : "<"}0，上商 ${qbit}。不立即恢复，把正负余数留到下一步用加或减抵消。`,
      kind: wasPos ? "sub" : "add",
    });
  }

  if (R < 0) {
    R = R + yMag;
    steps.push({
      i: n,
      phase: "correct",
      judge: "余数 < 0",
      operation: "余数 + |Y|（最终恢复）",
      registers: [reg("余数 R", R, rWidth, 1)],
      note: "运算结束时余数为负，加回除数得到与被除数同号的正确余数。商不变。",
      kind: "correct",
    });
  }

  const qValue = (qs ? -1 : 1) * (Q / 2 ** n);
  const rValue = (rs ? -1 : 1) * (R / 2 ** (2 * n));
  steps.push({
    i: n + 1,
    phase: "done",
    judge: `Qs = ${qs}`,
    operation: "装配商与余数",
    registers: [
      { name: "[Q]原", bits: [qs, ...intToBits(Q, n)], point: 1 },
      { name: "余数寄存器", bits: intToBits(Math.max(0, R), n + 1), point: 1 },
    ],
    note: `商原码 = ${formatBits([qs, ...intToBits(Q, n)])}。`,
    kind: "info",
  });

  return {
    ok: true,
    warning: overflow ? "溢出：|被除数| ≥ |除数|，商的绝对值 ≥ 1。" : undefined,
    forms: encodeForms(qValue, n, overflow),
    remainder: encodeForms(rValue, 2 * n),
    steps,
    algorithm: "nonrestoring",
    algorithmTitle: "原码加减交替除法",
    ruleLines: [
      "符号处理与恢复余数法相同。",
      "余数 ≥ 0：左移后减 |Y|；余数 < 0：左移后加 |Y|。",
      "新余数 ≥ 0 上商 1，否则上商 0。中间不恢复。",
      "结束后若余数为负，加回 |Y| 得到真正余数。",
    ],
  };
}

export function divideComplement(xOrig, yOrig) {
  const n = xOrig.length - 1;
  const xComp = originalToComplement(xOrig);
  const yComp = originalToComplement(yOrig);
  if (complementToValue(yComp) === 0) {
    return {
      ok: false,
      error: "除数为 0",
      forms: encodeForms(0, n),
      steps: [],
      algorithm: "complement",
      algorithmTitle: "补码加减交替除法",
      ruleLines: [],
    };
  }
  const xVal = originalToValue(xOrig);
  const yVal = originalToValue(yOrig);
  const overflow = Math.abs(xVal) >= Math.abs(yVal);

  const w = n + 2;
  const X = signExtend(bitsToInt(xComp), n + 1, w);
  const Y = signExtend(bitsToInt(yComp), n + 1, w);
  const minusY = negW(Y, w);
  let R = X;
  let Q = 0;
  const firstSame = sameSign(R, Y, w);
  const steps = [
    {
      i: 0,
      phase: "init",
      judge: "—",
      operation: "写成补码，双符号位",
      registers: [
        reg("[X]补", X, w, 2),
        reg("[Y]补", Y, w, 2),
        reg("[−Y]补", minusY, w, 2),
      ],
      note: `被除数 [X]补=${formatBits(intToBits(X, w), 2)}，除数 [Y]补=${formatBits(intToBits(Y, w), 2)}。符号位参加运算。`,
      kind: "info",
    },
  ];

  R = firstSame ? addW(X, minusY, w) : addW(X, Y, w);
  let qbit = sameSign(R, Y, w) ? 1 : 0;
  Q = qbit;
  steps.push({
    i: 1,
    phase: "operate",
    judge: firstSame ? "被除数与除数同号" : "被除数与除数异号",
    operation: firstSame ? "R ← [X]补 + [−Y]补" : "R ← [X]补 + [Y]补",
    registers: [
      reg("余数 R", R, w, 2),
      { name: "[Q]补", bits: intToBits(Q, 1), point: 0 },
    ],
    note: `第一次上商得到商的符号位 ${qbit}（补码中 0 为正，1 为负）。余数与除数${sameSign(R, Y, w) ? "同号 → 商 1，下一步减" : "异号 → 商 0，下一步加"}。`,
    kind: firstSame ? "sub" : "add",
  });

  for (let i = 1; i <= n; i++) {
    const rSign = (R >> (w - 1)) & 1;
    R = ((rSign << (w - 1)) | ((R << 1) & maskW(w - 1))) & maskW(w);
    const doSub = qbit === 1;
    R = doSub ? addW(R, minusY, w) : addW(R, Y, w);
    qbit = sameSign(R, Y, w) ? 1 : 0;
    Q = (Q << 1) | qbit;
    steps.push({
      i: i + 1,
      phase: "operate",
      judge: doSub ? "上一步商 1，余数左移后减除数" : "上一步商 0，余数左移后加除数",
      operation: doSub ? "R ≪ 1，+ [−Y]补" : "R ≪ 1，+ [Y]补",
      registers: [
        reg("余数 R", R, w, 2),
        { name: "[Q]补", bits: intToBits(Q, i + 1), point: 1 },
      ],
      note: `余数与除数${sameSign(R, Y, w) ? "同号，上商 1" : "异号，上商 0"}。`,
      kind: doSub ? "sub" : "add",
    });
  }

  const qBefore = Q;
  Q = Q | 1;
  if (Q !== qBefore) {
    steps.push({
      i: n + 2,
      phase: "correct",
      judge: "末位校正",
      operation: "商的末位恒置 1",
      registers: [{ name: "[Q]补", bits: intToBits(Q, n + 1), point: 1 }],
      note: "教材常用「末位恒置 1」作商的校正，误差不超过末位 1 的权值。",
      kind: "correct",
    });
  } else {
    steps.push({
      i: n + 2,
      phase: "correct",
      judge: "末位已是 1",
      operation: "无需再置 1",
      registers: [{ name: "[Q]补", bits: intToBits(Q, n + 1), point: 1 }],
      note: "末位已经是 1，恒置 1 规则下商保持不变。",
      kind: "info",
    });
  }

  if (!sameSign(R, X, w)) {
    const restoreAdd = sameSign(X, Y, w);
    R = restoreAdd ? addW(R, Y, w) : addW(R, minusY, w);
    steps.push({
      i: n + 2,
      phase: "correct",
      judge: "余数与被除数异号",
      operation: restoreAdd ? "余数 + [Y]补" : "余数 + [−Y]补",
      registers: [reg("余数 R", R, w, 2)],
      note: "余数应与被除数同号，做一次校正。",
      kind: "correct",
    });
  }

  const qBits = intToBits(Q, n + 1);
  const qValue = complementToValue(qBits);
  const rValue = complementToValue(intToBits(R, w).slice(1));

  steps.push({
    i: n + 3,
    phase: "done",
    judge: "—",
    operation: "得到商的补码",
    registers: [
      { name: "[Q]补", bits: qBits, point: 1 },
      { name: "[R]补", bits: intToBits(R, w), point: 2 },
    ],
    note: `商补码 = ${formatBits(qBits)}。`,
    kind: "info",
  });

  return {
    ok: true,
    warning: overflow ? "溢出：|被除数| ≥ |除数|，商的绝对值 ≥ 1。" : undefined,
    forms: encodeForms(qValue, n, overflow),
    remainder: encodeForms(rValue / 2 ** n, 2 * n),
    steps,
    algorithm: "complement",
    algorithmTitle: "补码加减交替除法",
    ruleLines: [
      "符号位参加运算，用双符号位表示余数。",
      "被除数与除数同号做减法，异号做加法；此后余数与除数同号上商 1（下一步减），异号上商 0（下一步加）。",
      "余数左移后按上一步的商决定加或减除数，共得到 1 位符号 + n 位尾数。",
      "商末位恒置 1；若最终余数与被除数异号，再加减除数校正余数。",
    ],
  };
}

export function convertOperand(bits, encoding) {
  const value =
    encoding === "complement" ? complementToValue(bits) : originalToValue(bits);
  const n = bits.length - 1;
  const orig = valueToOriginal(value, n);
  const comp = valueToComplement(value, n);
  const ones = valueToOnes(value, n);
  const steps = [
    {
      i: 0,
      phase: "init",
      judge: "输入",
      operation: encoding === "complement" ? "按补码解读" : encoding === "original" ? "按原码解读" : "按真值二进制解读",
      registers: [{ name: "输入", bits, point: 1 }],
      note: `真值 = ${formatTrue(value)}`,
      kind: "info",
    },
    {
      i: 1,
      phase: "done",
      judge: "正数三码相同；负数：反码尾数取反，补码再 +1",
      operation: "写出原码 / 反码 / 补码",
      registers: [
        { name: "原码", bits: orig, point: 1 },
        { name: "反码", bits: ones, point: 1 },
        { name: "补码", bits: comp, point: 1 },
      ],
      note:
        bits[0] === 0
          ? "正数：原码、反码、补码的尾数相同。"
          : "负数：原码尾数为绝对值；反码将尾数按位取反；补码 = 反码 + 2⁻ⁿ。",
      kind: "info",
    },
  ];
  return {
    ok: true,
    forms: encodeForms(value, n),
    steps,
    algorithm: "convert",
    algorithmTitle: "原码 · 反码 · 补码 转换",
    ruleLines: [
      "原码：符号位 0 正 1 负，尾数为绝对值。",
      "反码：正数同原码；负数符号位 1，尾数按位取反。",
      "补码：正数同原码；负数 = 反码末位加 1，或 [x]补 = 2 + x（x<0，模 2）。",
      "补码可表示 −1（1.000…0），原码通常不能。",
    ],
  };
}

export function formatTrue(value) {
  if (Object.is(value, -0)) return "−0";
  if (value === 0) return "0";
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  let s = abs.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
  if (s === "") s = "0";
  return sign + s;
}

export function runMul(algo, x, y) {
  switch (algo) {
    case "original-1":
      return multiplyOriginal1(x, y);
    case "original-2":
      return multiplyOriginal2(x, y);
    case "complement-1":
      return multiplyComplement1(x, y);
    case "complement-2":
      return multiplyComplement2(x, y);
  }
}

export function runDiv(algo, x, y) {
  switch (algo) {
    case "restoring":
      return divideRestoring(x, y);
    case "nonrestoring":
      return divideNonrestoring(x, y);
    case "complement":
      return divideComplement(x, y);
  }
}

export function toOriginalBits(parsed) {
  if (parsed.encoding === "complement") {
    return valueToOriginal(parsed.value, parsed.n);
  }
  return parsed.bits;
}

export const PRESETS = [
  {
    id: "mul-pp",
    label: "0.1101 × 0.1011",
    hint: "原码一位 · 两正",
    op: "mul",
    encoding: "original",
    x: "0.1101",
    y: "0.1011",
    n: 4,
    mul: "original-1",
  },
  {
    id: "mul-pn",
    label: "0.1101 × (−0.1011)",
    hint: "补码 Booth · 异号",
    op: "mul",
    encoding: "original",
    x: "0.1101",
    y: "1.1011",
    n: 4,
    mul: "complement-1",
  },
  {
    id: "mul-booth-ycomp",
    label: "[X]补 0.1101 × [Y]补 1.0101",
    hint: "直接输入补码",
    op: "mul",
    encoding: "complement",
    x: "0.1101",
    y: "1.0101",
    n: 4,
    mul: "complement-1",
  },
  {
    id: "div-rest",
    label: "0.1011 ÷ 0.1101",
    hint: "原码恢复余数",
    op: "div",
    encoding: "original",
    x: "0.1011",
    y: "0.1101",
    n: 4,
    div: "restoring",
  },
  {
    id: "div-alt",
    label: "0.1000 ÷ 0.1101",
    hint: "加减交替",
    op: "div",
    encoding: "original",
    x: "0.1000",
    y: "0.1101",
    n: 4,
    div: "nonrestoring",
  },
  {
    id: "div-comp",
    label: "(−0.1001) ÷ 0.1101",
    hint: "补码加减交替",
    op: "div",
    encoding: "original",
    x: "1.1001",
    y: "0.1101",
    n: 4,
    div: "complement",
  },
];