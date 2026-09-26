// UI layer: vanilla-DOM reimplementation of src/components/calculator.tsx,
// src/components/bit-strip.tsx and src/components/ui/button.tsx.
// Expects the ported logic (build/logic.js) to share this module scope.

const ICONS = {
  times:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  divide:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M12 6h.01M12 18h.01M5 12h14"/></svg>',
  equal:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M5 9h14M5 15h14"/></svg>',
  minus:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M5 12h14"/></svg>',
  plus:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  reset:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
  swap:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>',
  chevronLeft:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  chevronRight:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  copy:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  info:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
};

const MUL_ALGOS = [
  { id: "original-1", name: "原码一位", blurb: "符号异或 · 尾数移位加" },
  { id: "original-2", name: "原码两位", blurb: "两位一组 · 0/|X|/2|X|/3|X|" },
  { id: "complement-1", name: "补码一位", blurb: "Booth · 比较 yi yi+1" },
  { id: "complement-2", name: "补码两位", blurb: "Booth-2 · 三位编码" },
];

const DIV_ALGOS = [
  { id: "restoring", name: "原码恢复余数", blurb: "不够减则加回除数" },
  { id: "nonrestoring", name: "原码加减交替", blurb: "不恢复 · 正减负加" },
  { id: "complement", name: "补码加减交替", blurb: "符号参加运算 · 末位置 1" },
];

const ENCODINGS = [
  { id: "true-bin", name: "真值", hint: "用 +0.1011 / −0.1011" },
  { id: "original", name: "原码", hint: "0.xxxx 正 · 1.xxxx 负" },
  { id: "complement", name: "补码", hint: "符号位参与 · 可写 −1" },
];

const OPS = [
  { id: "mul", name: "乘法", icon: ICONS.times },
  { id: "div", name: "除法", icon: ICONS.divide },
  { id: "convert", name: "码制", icon: ICONS.equal },
];

const KIND_CLASS = {
  add: "k-add",
  sub: "k-sub",
  shift: "k-shift",
  correct: "k-correct",
  zero: "k-zero",
  info: "k-info",
};

const KIND_LABEL = {
  add: "加",
  sub: "减",
  shift: "移位",
  correct: "校正",
  zero: "不加",
  info: "说明",
};

const state = {
  op: "mul",
  encoding: "original",
  n: 4,
  xRaw: "0.1101",
  yRaw: "0.1011",
  mulAlgo: "original-1",
  divAlgo: "restoring",
  stepIndex: 0,
  showAll: true,
};

const $ = (sel) => document.querySelector(sel);

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

function bitsToText(bits) {
  return bits.join("");
}

function fractionLabel(value, n) {
  const denom = 2 ** n;
  const num = Math.round(value * denom);
  return `${num}/${denom}`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

/* ---------------------------------------------------------------- bit strip */

function bitStrip(bits, point = 1, size = "md", onToggle) {
  const wrap = el("div", `bit-strip bs-${size}`);
  bits.forEach((bit, i) => {
    const isSign = i < point;
    const title = isSign ? "符号位" : `2⁻${i - point + 1}`;
    const cls = `bit ${bit === 1 ? "bit-one" : "bit-zero"}${isSign ? " bit-sign" : ""}`;
    const inner = `<span class="${cls}" title="${title}">${bit}</span>`;
    const cell = el("span", "bit-cell");
    if (onToggle) {
      const btn = el("button", "bit-btn", inner);
      btn.type = "button";
      btn.setAttribute(
        "aria-label",
        isSign ? `翻转符号位，当前 ${bit}` : `翻转第 ${i - point + 1} 位，当前 ${bit}`,
      );
      btn.addEventListener("click", () => onToggle(i));
      cell.appendChild(btn);
    } else {
      cell.innerHTML = inner;
    }
    if (i === point - 1 && i !== bits.length - 1) {
      cell.appendChild(el("span", "bit-point", "."));
    }
    wrap.appendChild(cell);
  });
  return wrap;
}

/* -------------------------------------------------------------- derived data */

function derive() {
  const xParsed = parseOperand(state.xRaw, state.n, state.encoding);
  const yParsed = parseOperand(state.yRaw, state.n, state.encoding);
  const xOrig = xParsed.ok ? toOriginalBits(xParsed) : null;
  const yOrig = yParsed.ok ? toOriginalBits(yParsed) : null;

  let result = null;
  if (xParsed.ok) {
    if (state.op === "convert") {
      result = convertOperand(xParsed.bits, state.encoding);
    } else if (yParsed.ok) {
      const xb = toOriginalBits(xParsed);
      const yb = toOriginalBits(yParsed);
      result =
        state.op === "mul"
          ? runMul(state.mulAlgo, xb, yb)
          : runDiv(state.divAlgo, xb, yb);
    }
  }

  let compareRows = [];
  if (xOrig && yOrig && state.op !== "convert") {
    compareRows = (state.op === "mul" ? MUL_ALGOS : DIV_ALGOS).map((item) => ({
      id: item.id,
      name: item.name,
      result:
        state.op === "mul"
          ? runMul(item.id, xOrig, yOrig)
          : runDiv(item.id, xOrig, yOrig),
    }));
  }

  let expectedTrue = null;
  if (xParsed.ok && yParsed.ok && state.op !== "convert") {
    if (state.op === "mul") {
      expectedTrue = xParsed.value * yParsed.value;
    } else {
      expectedTrue = yParsed.value === 0 ? null : xParsed.value / yParsed.value;
    }
  }

  return { xParsed, yParsed, xOrig, yOrig, result, compareRows, expectedTrue };
}

/* ------------------------------------------------------------------ controls */

function renderOps() {
  const box = $("#op-tabs");
  box.innerHTML = "";
  OPS.forEach((item) => {
    const btn = el(
      "button",
      `op-tab${state.op === item.id ? " is-active" : ""}`,
      `${item.icon}<span>${item.name}</span>`,
    );
    btn.type = "button";
    btn.addEventListener("click", () => {
      state.op = item.id;
      state.stepIndex = 0;
      render();
    });
    box.appendChild(btn);
  });
}

function renderEncodings() {
  const box = $("#encoding-tabs");
  box.innerHTML = "";
  ENCODINGS.forEach((item) => {
    const btn = el(
      "button",
      `chip${state.encoding === item.id ? " is-active" : ""}`,
      `${item.name}输入`,
    );
    btn.type = "button";
    btn.title = item.hint;
    btn.addEventListener("click", () => {
      state.encoding = item.id;
      state.stepIndex = 0;
      render();
    });
    box.appendChild(btn);
  });
  const current = ENCODINGS.find((e) => e.id === state.encoding);
  $("#encoding-hint").innerHTML =
    `${esc(current.hint)}。也可直接输入十进制，如 <span class="mono">0.6875</span>。`;
}

function renderAlgoGrid() {
  const box = $("#algo-grid");
  box.innerHTML = "";
  if (state.op === "convert") {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const items = state.op === "mul" ? MUL_ALGOS : DIV_ALGOS;
  const value = state.op === "mul" ? state.mulAlgo : state.divAlgo;
  items.forEach((item) => {
    const active = item.id === value;
    const btn = el(
      "button",
      `algo${active ? " is-active" : ""}`,
      `<span class="algo-name">${item.name}</span><span class="algo-blurb">${item.blurb}</span>`,
    );
    btn.type = "button";
    btn.addEventListener("click", () => {
      if (state.op === "mul") state.mulAlgo = item.id;
      else state.divAlgo = item.id;
      state.stepIndex = 0;
      render();
    });
    box.appendChild(btn);
  });
}

function renderPresets() {
  const box = $("#presets");
  box.innerHTML = "";
  PRESETS.forEach((p) => {
    const btn = el(
      "button",
      "preset",
      `<span class="preset-label">${esc(p.label)}</span><span class="preset-hint">${esc(p.hint)}</span>`,
    );
    btn.type = "button";
    btn.addEventListener("click", () => {
      state.op = p.op;
      state.encoding = p.encoding;
      state.n = p.n;
      state.xRaw = p.x;
      state.yRaw = p.y;
      if (p.mul) state.mulAlgo = p.mul;
      if (p.div) state.divAlgo = p.div;
      state.stepIndex = 0;
      state.showAll = true;
      syncInputs();
      render();
    });
    box.appendChild(btn);
  });
}

function renderStepper() {
  $("#n-value").textContent = String(state.n);
}

/* ------------------------------------------------------------------ operands */

function operandNodes(side) {
  return {
    block: $(`#operand-${side}`),
    label: $(`#label-${side}`),
    input: $(`#input-${side}`),
    pad: $(`#pad-${side}`),
    forms: $(`#forms-${side}`),
  };
}

function syncInputs() {
  for (const side of ["x", "y"]) {
    const { input } = operandNodes(side);
    const next = side === "x" ? state.xRaw : state.yRaw;
    if (input.value !== next) input.value = next;
  }
}

function renderOperands(derived) {
  const yVisible = state.op !== "convert";
  $("#operand-y").hidden = !yVisible;
  $("#swap-row").hidden = !yVisible;

  const labelX = state.op === "div" ? "被除数 X" : state.op === "mul" ? "被乘数 X" : "操作数 X";
  const labelY = state.op === "div" ? "除数 Y" : "乘数 Y";

  for (const side of ["x", "y"]) {
    const parsed = side === "x" ? derived.xParsed : derived.yParsed;
    const nodes = operandNodes(side);
    nodes.label.textContent = side === "x" ? labelX : labelY;
    nodes.input.placeholder =
      state.encoding === "true-bin" ? "−0.1011 或 0.6875" : "0.1011";

    const forms = parsed.ok ? encodeForms(parsed.value, state.n) : null;
    const padBits = parsed.ok
      ? state.encoding === "complement"
        ? forms.complement
        : parsed.bits
      : [0, ...Array(state.n).fill(0)];

    nodes.pad.innerHTML = "";
    nodes.pad.appendChild(
      bitStrip(padBits, 1, "lg", (i) => {
        const next = padBits.map((b, idx) => (idx === i ? b ^ 1 : b));
        const str = bitsToInputString(next, state.encoding);
        if (side === "x") state.xRaw = str;
        else state.yRaw = str;
        state.stepIndex = 0;
        syncInputs();
        render();
      }),
    );

    nodes.forms.innerHTML = "";
    if (parsed.ok && forms) {
      nodes.forms.className = "forms-box";
      nodes.forms.appendChild(formRow("真值", `${formatTrue(parsed.value)}  (${fractionLabel(parsed.value, state.n)})`, false));
      nodes.forms.appendChild(formRow("原码", formatBits(forms.original), true));
      nodes.forms.appendChild(formRow("反码", formatBits(forms.ones), true));
      nodes.forms.appendChild(formRow("补码", formatBits(forms.complement), true));
      if (parsed.note) {
        nodes.forms.appendChild(el("p", "form-note", esc(parsed.note)));
      }
    } else {
      nodes.forms.className = "forms-box is-error";
      nodes.forms.appendChild(el("p", "form-error", esc(parsed.error)));
    }
  }
}

function formRow(key, value, mono) {
  return el(
    "div",
    "form-row",
    `<span class="form-key">${esc(key)}</span><span class="form-val${mono ? " mono" : ""}">${esc(value)}</span>`,
  );
}

function negate(side) {
  const parsed = side === "x" ? parseOperand(state.xRaw, state.n, state.encoding) : parseOperand(state.yRaw, state.n, state.encoding);
  if (!parsed.ok) return;
  const next = encodeForms(-parsed.value, state.n);
  const bits = state.encoding === "complement" ? next.complement : next.original;
  const str = bitsToInputString(bits, state.encoding === "complement" ? "complement" : state.encoding);
  if (side === "x") state.xRaw = str;
  else state.yRaw = str;
  state.stepIndex = 0;
  syncInputs();
  render();
}

/* --------------------------------------------------------------- result card */

function copyButton(bits) {
  const btn = el("button", "copy-btn", ICONS.copy);
  btn.type = "button";
  btn.setAttribute("aria-label", "复制机器码");
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(formatBits(bits));
      btn.innerHTML = `<span class="copy-ok">${ICONS.check}</span>`;
      window.setTimeout(() => {
        btn.innerHTML = ICONS.copy;
      }, 1200);
    } catch {
      /* clipboard may be blocked (file:// or embedded contexts) */
    }
  });
  return btn;
}

function formLine(name, bits, bitsLabel, extra) {
  const box = el("div", "form-line");
  const head = el("div", "form-line-head");
  head.appendChild(el("span", "form-line-name", esc(name)));
  const right = el("div", "form-line-right");
  if (extra) right.appendChild(el("span", "form-line-extra", esc(extra)));
  if (bits) right.appendChild(copyButton(bits));
  head.appendChild(right);
  box.appendChild(head);
  if (bits) {
    const scroller = el("div", "scroll-x");
    scroller.appendChild(bitStrip(bits));
    scroller.appendChild(el("p", "mono form-line-text", esc(formatBits(bits))));
    box.appendChild(scroller);
  } else {
    box.appendChild(el("span", "mono form-line-value", esc(bitsLabel)));
  }
  return box;
}

function resultCard(result, derived) {
  const { op, expectedTrue, xParsed, yParsed, xOrig, yOrig } = {
    op: state.op,
    expectedTrue: derived.expectedTrue,
    xParsed: derived.xParsed,
    yParsed: derived.yParsed,
    xOrig: derived.xOrig,
    yOrig: derived.yOrig,
  };
  const card = el("div", "card");
  const title = op === "div" ? "商" : op === "mul" ? "乘积" : "机器码";
  const machine = result.forms.value;
  const ulp = 2 ** -result.forms.n;
  const matches =
    expectedTrue !== null && Number.isFinite(expectedTrue)
      ? Math.abs(machine - expectedTrue) < ulp + 1e-12
      : null;
  const symbol = op === "div" ? "÷" : "×";

  card.appendChild(el("p", "card-eyebrow", esc(result.algorithmTitle)));
  card.appendChild(el("h2", "card-title", title));

  if (op !== "convert") {
    const box = el("div", "truth-box");
    const xValue = xParsed.ok ? xParsed.value : 0;
    const yValue = yParsed.ok ? yParsed.value : 0;
    box.appendChild(
      el(
        "p",
        "mono truth-line",
        `${esc(formatTrue(xValue))} ${symbol} ${esc(formatTrue(yValue))}${expectedTrue !== null ? ` = ${esc(formatTrue(expectedTrue))}` : ""}`,
      ),
    );
    box.appendChild(
      el(
        "p",
        "truth-note",
        "真值验算" +
          (matches === true
            ? " · 与机器结果一致"
            : matches === false
              ? " · 与 n 位量化后的机器结果有末位差"
              : ""),
      ),
    );
    if (xOrig && yOrig) {
      box.appendChild(
        el(
          "p",
          "mono truth-code",
          `[X]原 ${esc(formatBits(xOrig))} ${symbol} [Y]原 ${esc(formatBits(yOrig))}`,
        ),
      );
    }
    card.appendChild(box);
  }

  const forms = el("div", "card-forms");
  forms.appendChild(formLine("真值", null, formatTrue(result.forms.value), fractionLabel(result.forms.value, result.forms.n)));
  forms.appendChild(formLine("原码", result.forms.original));
  forms.appendChild(formLine("反码", result.forms.ones));
  forms.appendChild(formLine("补码", result.forms.complement));
  card.appendChild(forms);

  if (result.remainder && op === "div") {
    const rem = el("div", "card-remainder");
    rem.appendChild(el("p", "card-remainder-title", "余数（权值 2⁻²ⁿ）"));
    rem.appendChild(
      formLine("真值", null, formatTrue(result.remainder.value), fractionLabel(result.remainder.value, result.remainder.n)),
    );
    rem.appendChild(formLine("原码", result.remainder.original));
    card.appendChild(rem);
  }

  return card;
}

/* -------------------------------------------------------------- compare table */

function compareTable(rows) {
  const card = el("div", "card");
  card.appendChild(
    el("p", "compare-title", state.op === "mul" ? "原码 / 补码乘法对照" : "原码 / 补码除法对照"),
  );
  card.appendChild(
    el(
      "p",
      "compare-note",
      "点选一行查看该算法的逐步寄存器轨迹。真值应彼此一致（补码除法末位恒置 1，可能差 1 ULP）。",
    ),
  );
  const scroller = el("div", "scroll-x");
  const table = el("table", "compare-table");
  table.innerHTML =
    "<thead><tr><th>算法</th><th>原码</th><th>补码</th><th>真值</th></tr></thead>";
  const tbody = el("tbody");
  const selected = state.op === "mul" ? state.mulAlgo : state.divAlgo;
  rows.forEach((row) => {
    const ok = row.result.ok;
    const active = row.id === selected;
    const tr = el("tr", active ? "is-active" : "");
    tr.appendChild(el("td", "", `<span class="row-name${active ? " is-active" : ""}">${esc(row.name)}</span>`));
    tr.appendChild(el("td", "mono", ok ? esc(formatBits(row.result.forms.original)) : esc(row.result.error)));
    tr.appendChild(el("td", "mono", ok ? esc(formatBits(row.result.forms.complement)) : "—"));
    tr.appendChild(el("td", "mono", ok ? esc(formatTrue(row.result.forms.value)) : "—"));
    if (ok) {
      tr.addEventListener("click", () => {
        if (state.op === "mul") state.mulAlgo = row.id;
        else state.divAlgo = row.id;
        state.stepIndex = 0;
        render();
      });
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  scroller.appendChild(table);
  card.appendChild(scroller);
  return card;
}

/* ------------------------------------------------------------ paper multiply */

function paperMulCard(x, y, product) {
  const card = el("div", "card");
  card.appendChild(el("p", "compare-title", "原码尾数竖式"));
  const ps = x[0] ^ y[0];
  card.appendChild(
    el(
      "p",
      "compare-note",
      `符号单独算：Ps = ${x[0]} ⊕ ${y[0]} = ${ps}。下面只乘绝对值。`,
    ),
  );
  const scroller = el("div", "scroll-x mono paper");
  const inner = el("div", "paper-inner");
  inner.appendChild(paperLine(x.slice(1), "|X|", false, false));
  inner.appendChild(paperLine(y.slice(1), "× |Y|", false, false));
  inner.appendChild(el("span", "paper-rule"));
  paperMulRows(x, y).forEach((row) => {
    inner.appendChild(
      paperLine(row.line, row.bit === 1 ? `y×2⁻${row.shift + 1}` : "×0", row.bit === 0, false),
    );
  });
  inner.appendChild(el("span", "paper-rule"));
  if (product) {
    inner.appendChild(paperLine(product.slice(1), `[P]原 ${ps}.`, false, true));
  }
  scroller.appendChild(inner);
  card.appendChild(scroller);
  return card;
}

function paperLine(bits, prefix, dim, emphasize) {
  const row = el("div", `paper-line${dim ? " is-dim" : ""}`);
  row.appendChild(el("span", "paper-prefix", esc(prefix)));
  row.appendChild(el("span", `paper-bits${emphasize ? " is-strong" : ""}`, esc(bitsToText(bits))));
  return row;
}

/* ------------------------------------------------------------------ steps */

// Machine-arithmetic traces are laid out the way the textbooks lay them out:
// three columns holding the accumulator (部分积 / 余数), the multiplier or
// quotient, and the operation note. The payoff is on the right shift — the
// digits that slid out of the accumulator into the multiplier stay in the
// multiplier column, bunched into a shaded group at the left, and the binary
// point rides right with them. One row then shows the shift, instead of asking
// the reader to diff two rows by eye.
function traceColumns(steps) {
  const names = steps.flatMap((step) => step.registers.map((r) => r.name));
  // 码制转换 has no accumulator to shift — its rows just name a representation
  // and give its bits — so it gets a name/value pair instead of the two register
  // columns the machine algorithms use.
  if (names.some((nm) => /原码|反码|补码|输入/.test(nm))) {
    return { family: "convert", left: null, mid: null, leftTitle: "表示", midTitle: "数值" };
  }
  const isDiv = names.some((nm) => /余数|\[R\]/.test(nm));
  return isDiv
    ? { family: "div", left: /余数|\[R\]/, mid: /商|\[Q\]/, leftTitle: "余数", midTitle: "商" }
    : { family: "mul", left: /部分积|\[P\]/, mid: /乘数|\[Y\]/, leftTitle: "部分积", midTitle: "乘数" };
}

function pickRegister(registers, pattern) {
  return registers.find((r) => pattern.test(r.name));
}

// Digits a shift step moves out of the accumulator into the multiplier. Only
// right shifts migrate — a division's 余数左移 moves bits the other way, and
// counting it would shade the wrong cells.
function shiftWidth(step) {
  const m = /右移\s*(\d+)\s*位/.exec(step.operation);
  return m ? Number(m[1]) : 0;
}

function fieldCells(reg) {
  const cells = reg.bits.map((bit) => ({ bit, extra: false }));
  if (reg.extra !== undefined) cells.push({ bit: reg.extra, extra: true });
  return cells;
}

// A register drawn as a digit field. `migrated` counts the digits already
// shifted in from the accumulator: they form a shaded group at the left, and
// the binary point is placed after them rather than at its original offset, so
// the field reads as the multiplier with its point sliding right.
function traceField(reg, opts) {
  const o = opts || {};
  const migrated = Math.min(o.migrated || 0, reg.bits.length);
  const cells = fieldCells(reg);
  const pointAfter = reg.point > 0 ? reg.point + migrated - 1 : -1;
  // A point landing past the last digit would dangle off the end of the field.
  const showPoint = pointAfter >= 0 && pointAfter < cells.length - 1;

  const wrap = el("span", `field mono${o.dim ? " is-dim" : ""}`);
  const group = migrated > 0 ? el("span", "field-in") : null;
  if (group) wrap.appendChild(group);

  cells.forEach((c, i) => {
    const cell = el("span", `field-cell bit ${c.bit === 1 ? "bit-one" : "bit-zero"}`, String(c.bit));
    if (c.extra) cell.classList.add("is-extra");
    if (i === o.newIndex) cell.classList.add("is-new");
    (group && i < migrated ? group : wrap).appendChild(cell);
    if (showPoint && i === pointAfter) wrap.appendChild(el("span", "field-point", "."));
  });
  // Division's quotient column is stored in two widths — the whole register on
  // some rows, only the digits fixed so far on others. Pad the short rows so the
  // column keeps one shape down the table.
  for (let i = 0; i < (o.pad || 0); i++) wrap.appendChild(el("span", "field-cell is-pending"));
  return wrap;
}

function traceLine(reg, opts) {
  const o = opts || {};
  const line = el("div", `trace-line${o.addend ? " is-addend" : ""}`);
  if (o.sign) line.appendChild(el("span", "trace-sign", o.sign));
  line.appendChild(traceField(reg, o));
  return line;
}

// A step carries the sum but not the addend, so recover the addend from the
// difference against the accumulator in the previous step. Widths have to
// agree; when they don't (division widens its remainder mid-step) the row just
// shows the result instead of inventing an addend line.
function addendOf(prevBits, curBits) {
  if (!prevBits || prevBits.length !== curBits.length) return null;
  const width = curBits.length;
  const delta = (bitsToInt(curBits) - bitsToInt(prevBits) + 2 ** width) % 2 ** width;
  return intToBits(delta, width);
}

const ARITH_KINDS = new Set(["add", "sub", "zero"]);

function phaseLabel(step) {
  return step.phase === "init" ? "初值" : step.phase === "done" ? "结果" : `步 ${step.i}`;
}

function traceRow(step, ctx) {
  const cols = ctx.cols;
  // Rows that carry the running state — the initial value and each post-shift
  // value — get the shading the textbooks put behind the same numbers.
  const carried = step.phase === "init" || step.kind === "shift";
  const row = el(
    "tr",
    `step is-${step.kind}${ctx.active ? " is-active" : ""}${carried ? " is-state" : ""}`,
  );

  const leftCell = el("td", "trace-cell trace-left");
  const midCell = el("td", "trace-cell trace-mid");

  if (cols.family === "convert") {
    // One line per representation, so 原码 / 反码 / 补码 stack in the same order
    // in both columns.
    step.registers.forEach((reg) => {
      leftCell.appendChild(el("div", "trace-name", esc(reg.name)));
      midCell.appendChild(traceLine(reg));
    });
  } else if (ctx.left) {
    if (ctx.addend) {
      leftCell.appendChild(traceLine({ ...ctx.left, bits: ctx.addend }, { sign: "+", addend: true }));
    }
    leftCell.appendChild(traceLine(ctx.left));
  } else {
    leftCell.appendChild(el("span", "trace-empty", "—"));
  }

  if (cols.family !== "convert" && ctx.mid) {
    midCell.appendChild(
      traceField(ctx.mid, {
        migrated: ctx.migrated,
        newIndex: ctx.newIndex,
        pad: ctx.pad,
      }),
    );
  }

  const noteCell = el("td", "trace-cell trace-note");
  const meta = el("div", "step-meta");
  meta.appendChild(el("span", "mono step-phase", phaseLabel(step)));
  meta.appendChild(
    el("span", `kind ${KIND_CLASS[step.kind] ?? "k-info"}`, KIND_LABEL[step.kind] ?? step.kind),
  );
  noteCell.appendChild(meta);
  noteCell.appendChild(el("div", "step-op", esc(step.operation)));
  if (step.judge !== "—") noteCell.appendChild(el("div", "step-judge", esc(step.judge)));
  noteCell.appendChild(el("p", "step-note", esc(step.note)));

  row.appendChild(leftCell);
  row.appendChild(midCell);
  row.appendChild(noteCell);
  return row;
}

function stepsSection(result) {
  const section = el("section", "card steps-card");
  const steps = result.steps;
  const cols = traceColumns(steps);
  const stepCount = steps.length;
  const safeIndex = Math.min(state.stepIndex, Math.max(0, stepCount - 1));
  const visible = state.showAll ? steps : steps.slice(0, safeIndex + 1);

  const head = el("div", "steps-head");
  const left = el("div");
  left.appendChild(el("h2", "steps-title", "逐步演算"));
  left.appendChild(
    el(
      "p",
      "steps-meta",
      `共 ${stepCount} 步 · ${state.showAll ? "全部展开" : `看到第 ${safeIndex + 1} 步`}`,
    ),
  );
  head.appendChild(left);

  const tools = el("div", "steps-tools");
  const toggle = el(
    "button",
    `btn btn-sm ${state.showAll ? "btn-primary" : "btn-secondary"}`,
    state.showAll ? "改为逐步" : "一次展开",
  );
  toggle.type = "button";
  toggle.addEventListener("click", () => {
    state.showAll = !state.showAll;
    render();
  });
  tools.appendChild(toggle);

  if (!state.showAll) {
    const prev = el("button", "btn btn-secondary btn-icon", ICONS.chevronLeft);
    prev.type = "button";
    prev.setAttribute("aria-label", "上一步");
    prev.disabled = safeIndex === 0;
    prev.addEventListener("click", () => {
      state.stepIndex = Math.max(0, state.stepIndex - 1);
      render();
    });
    const next = el("button", "btn btn-secondary btn-icon", ICONS.chevronRight);
    next.type = "button";
    next.setAttribute("aria-label", "下一步");
    next.disabled = safeIndex >= stepCount - 1;
    next.addEventListener("click", () => {
      state.stepIndex = Math.min(stepCount - 1, state.stepIndex + 1);
      render();
    });
    tools.appendChild(prev);
    tools.appendChild(next);
  }
  head.appendChild(tools);
  section.appendChild(head);

  const midWidth = Math.max(
    0,
    ...steps.map((step) => {
      const reg = cols.mid ? pickRegister(step.registers, cols.mid) : null;
      return reg ? fieldCells(reg).length : 0;
    }),
  );

  const headRow = el("tr");
  headRow.appendChild(el("th", "trace-cell trace-left", cols.leftTitle));
  headRow.appendChild(el("th", "trace-cell trace-mid", cols.midTitle));
  headRow.appendChild(el("th", "trace-cell trace-note", "操作说明"));
  const thead = el("thead");
  thead.appendChild(headRow);

  const tbody = el("tbody");
  // Digits shifted out of the accumulator so far, and the quotient value as of
  // the row above — both only move on the rows that actually shift or 上商.
  let migrated = 0;
  let prevLeft = null;
  let prevQuotient = 0;
  visible.forEach((step, idx) => {
    if (cols.family === "mul" && step.kind === "shift") migrated += shiftWidth(step);

    const leftReg = cols.left ? pickRegister(step.registers, cols.left) || null : null;
    const midReg = cols.mid ? pickRegister(step.registers, cols.mid) || null : null;
    const width = midReg ? fieldCells(midReg).length : 0;

    // Multiplication rows show the addend above the sum. A division row's
    // "addend" would be the two's complement of |Y|, which reads as nonsense, so
    // those rows show the remainder alone.
    const addend =
      cols.family === "mul" && leftReg && prevLeft && ARITH_KINDS.has(step.kind)
        ? addendOf(prevLeft, leftReg.bits)
        : null;

    let newIndex = -1;
    if (cols.family === "div" && midReg) {
      const value = bitsToInt(midReg.bits);
      if (value !== prevQuotient) newIndex = width - 1;
      prevQuotient = value;
    }

    tbody.appendChild(
      traceRow(step, {
        active: !state.showAll && idx === visible.length - 1,
        cols,
        left: leftReg,
        addend,
        mid: midReg,
        migrated: cols.family === "mul" ? migrated : 0,
        newIndex,
        pad: midReg ? Math.max(0, midWidth - width) : 0,
      }),
    );

    if (leftReg) prevLeft = leftReg.bits;
  });

  const table = el("table", "trace-table");
  table.appendChild(thead);
  table.appendChild(tbody);
  const scroller = el("div", "scroll-x");
  scroller.appendChild(table);
  section.appendChild(scroller);
  return section;
}

/* -------------------------------------------------------------------- render */

function render() {
  const derived = derive();
  renderStepper();
  renderOps();
  renderEncodings();
  renderAlgoGrid();
  renderOperands(derived);

  const right = $("#right-col");
  right.innerHTML = "";

  const result = derived.result;
  if (result && result.ok) {
    right.appendChild(resultCard(result, derived));
  } else {
    const card = el("div", "card");
    const message = !derived.xParsed.ok
      ? derived.xParsed.error
      : state.op !== "convert" && !derived.yParsed.ok
        ? derived.yParsed.error
        : (result && result.error) || "填写操作数后自动演算。";
    card.appendChild(el("p", "empty-note", esc(message)));
    right.appendChild(card);
  }

  if (result && result.warning) {
    right.appendChild(el("p", "warning", esc(result.warning)));
  }

  if (derived.compareRows.length) {
    right.appendChild(compareTable(derived.compareRows));
  }

  if (
    state.op === "mul" &&
    derived.xOrig &&
    derived.yOrig &&
    (state.mulAlgo === "original-1" || state.mulAlgo === "original-2")
  ) {
    right.appendChild(
      paperMulCard(derived.xOrig, derived.yOrig, result && result.ok ? result.forms.original : null),
    );
  }

  if (result && result.ok && result.ruleLines.length) {
    const aside = el("aside", "card rules-card");
    aside.appendChild(el("div", "rules-head", `${ICONS.info}<span>${esc(result.algorithmTitle)} · 规则</span>`));
    const ol = el("ol", "rules-list");
    result.ruleLines.forEach((line) => {
      ol.appendChild(el("li", "", `<span class="rule-dot"></span><span>${esc(line)}</span>`));
    });
    aside.appendChild(ol);
    right.appendChild(aside);
  }

  const stepsHost = $("#steps-host");
  stepsHost.innerHTML = "";
  if (result && result.ok && result.steps.length) {
    stepsHost.appendChild(stepsSection(result));
  }
}

/* ---------------------------------------------------------------------- init */

function changeN(delta) {
  const nn = clampN(state.n + delta);
  if (nn === state.n) return;
  // Parse against the NEW width, so the operand string is padded / truncated
  // to the new n (matches the original changeN).
  const xp = parseOperand(state.xRaw, nn, state.encoding);
  const yp = parseOperand(state.yRaw, nn, state.encoding);
  state.n = nn;
  if (xp.ok) {
    const bits = state.encoding === "complement" ? encodeForms(xp.value, nn).complement : xp.bits;
    state.xRaw = bitsToInputString(bits, state.encoding);
  }
  if (yp.ok) {
    const bits = state.encoding === "complement" ? encodeForms(yp.value, nn).complement : yp.bits;
    state.yRaw = bitsToInputString(bits, state.encoding);
  }
  state.stepIndex = 0;
  syncInputs();
  render();
}

function reset() {
  state.op = "mul";
  state.encoding = "original";
  state.n = 4;
  state.xRaw = "0.1101";
  state.yRaw = "0.1011";
  state.mulAlgo = "original-1";
  state.divAlgo = "restoring";
  state.stepIndex = 0;
  state.showAll = true;
  syncInputs();
  render();
}

function init() {
  $("#n-dec").addEventListener("click", () => changeN(-1));
  $("#n-inc").addEventListener("click", () => changeN(1));
  $("#n-dec").innerHTML = ICONS.minus;
  $("#n-inc").innerHTML = ICONS.plus;
  $("#reset").innerHTML = ICONS.reset;
  $("#reset").addEventListener("click", reset);
  $("#swap").innerHTML = `${ICONS.swap}<span>交换 X / Y</span>`;
  $("#swap").addEventListener("click", () => {
    const tmp = state.xRaw;
    state.xRaw = state.yRaw;
    state.yRaw = tmp;
    state.stepIndex = 0;
    syncInputs();
    render();
  });

  for (const side of ["x", "y"]) {
    const { input } = operandNodes(side);
    input.addEventListener("input", () => {
      if (side === "x") state.xRaw = input.value;
      else state.yRaw = input.value;
      state.stepIndex = 0;
      render();
    });
  }
  document.querySelectorAll("[data-negate]").forEach((btn) => {
    btn.addEventListener("click", () => negate(btn.getAttribute("data-negate")));
  });

  renderPresets();
  syncInputs();
  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}