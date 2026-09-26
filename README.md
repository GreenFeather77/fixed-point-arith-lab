# 定点演算纸 · 定点小数机器数演算

一个单文件的网页演算台：按《计算机组成原理》的规则，对二进制定点小数做**原码 / 补码乘除法**，并给出逐步的寄存器轨迹、真值验算与多算法对照。

无依赖、无构建步骤 —— 双击 `index.html` 就能用。

## 功能

- **三种模式**：乘法、除法、码制（原码 / 反码 / 补码互转）
- **七种算法**，覆盖教材主线：

  | 模式 | 算法 | 要点 |
  | --- | --- | --- |
  | 乘法 | 原码一位 | 符号异或，尾数移位加 |
  | 乘法 | 原码两位 | 两位一组，取 `0 / \|X\| / 2\|X\| / 3\|X\|` |
  | 乘法 | 补码一位（Booth） | 比较 `yᵢyᵢ₊₁`，末位附加 0 |
  | 乘法 | 补码两位 | Booth-2，三位编码 |
  | 除法 | 原码恢复余数 | 不够减则加回除数 |
  | 除法 | 原码加减交替 | 不恢复余数，正减负加 |
  | 除法 | 补码加减交替 | 符号位参与运算，末位恒置 1 |

- **三种输入码制**：真值（`±0.1011`）、原码、补码；也可直接输入十进制（如 `0.6875`）
- **尾数位数 n 可调**（2–12），调位时自动按新位宽补齐 / 截取操作数
- **点按位翻转**即可改操作数，另有取负、交换 X/Y、预设算例
- **逐步导航**：一次展开全部步骤，或改为逐步，用上一步 / 下一步翻看
- **真值验算**：机器结果与真值比对，末位差会明确标注
- **对照表**：同一组操作数下各算法结果并排，点选一行切换到该算法的轨迹

## 使用

直接用浏览器打开 `index.html`，不需要服务器、不需要联网。

页面字体从 Google Fonts 加载；离线时自动回退到系统字体，功能完全不受影响。

## 目录结构

```
index.html            组装产物 —— 自包含单文件，唯一需要分发的文件
build/
  template.html       页面骨架与占位符
  styles.css          全部样式
  logic.js            定点运算逻辑（由原 React 工程的 binary-arith.ts 移植）
  app.js              UI 层（原生 DOM，对应原 React 组件）
  assemble.mjs        组装：template + styles + logic + app → index.html
  logic.test.mjs      逻辑测试（23 项）
  verify.mjs          产物静态校验：自包含性、DOM id、图标与符号完整性
  sweep-compare.mjs   与原 TypeScript 实现的对拍脚本
  dom.test.mjs        jsdom 下的 UI 交互测试
```

## 开发与校验

```bash
node build/assemble.mjs        # 由 build/ 源码生成 index.html
node build/logic.test.mjs      # 逻辑测试
node build/verify.mjs          # 产物静态校验

npm i jsdom                    # UI 交互测试的前置依赖
node build/dom.test.mjs        # 渲染 index.html 并驱动 UI
```

`build/sweep-compare.mjs` 会把移植后的 `logic.js` 与原始 TypeScript 实现逐一对拍，需要原仓库的 `src/lib/binary-arith.ts`，用 Node 的类型擦除运行：

```bash
node --experimental-strip-types build/sweep-compare.mjs
```

### 校验结果

| 检查 | 结果 |
| --- | --- |
| `logic.test.mjs` | 23 passed, 0 failed |
| `verify.mjs` | all static checks passed |
| `dom.test.mjs` | ALL UI CHECKS PASSED |
| `sweep-compare.mjs` | 与原 TypeScript 实现的深层输出差异 **0** |

## 实现说明

- 逻辑层从原 React 工程的 `binary-arith.ts` **逐函数移植**为纯 JS，UI 层用原生 DOM 重写，未引入任何运行时依赖。对拍脚本确认两者在 `n = 2…6`、全部算法、`a, b ∈ [-16, 15]` 的网格上输出完全一致。
- 以下两点是**原实现既有行为**，移植后一并保留，并非移植缺陷：
  - 补码两位乘法在操作数超出该位宽可表示范围时结果不精确；
  - 补码除法末位恒置 1，结果可能差 1 ULP。
  对照表中已对末位差作出标注。