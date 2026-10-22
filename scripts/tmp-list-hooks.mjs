// 从 src/client.js 里自动扒出 Sidebar 组件的 hook 声明顺序与初始值，
// 生成测试要用的队列数组。人肉数 58 个 hook 会数错，这活交给脚本。
import { readFileSync } from 'node:fs';

const src = readFileSync('src/client.js', 'utf8');
const lines = src.split(/\r?\n/);
const railIdx = lines.findIndex(l => l.includes('React.useState(() => railSnapshotList())'));
if (railIdx < 0) throw new Error('找不到 railItems 那一行');

// 往上找组件函数起点：优先找带 Sidebar 字样的 function/const 定义
let start = -1;
for (let i = railIdx; i >= 0; i -= 1) {
  if (/function\s+\w*Sidebar|const\s+\w*Sidebar\s*=/.test(lines[i])) { start = i; break; }
  if (i === railIdx - 200) break;
}
if (start < 0) {
  // 退化：找最近的 `function xxx(` 且之后到 railIdx 之间没有别的 function 定义
  for (let i = railIdx; i >= 0; i -= 1) {
    if (/^(export\s+)?function\s+\w+\s*\(|^\s*const\s+\w+\s*=\s*(\(|function)/.test(lines[i])) { start = i; break; }
    if (i === railIdx - 200) break;
  }
}
console.log(`组件起点: 第 ${start + 1} 行  =>  ${lines[start].trim().slice(0, 90)}`);
console.log(`railItems: 第 ${railIdx + 1} 行\n`);

// 从起点扫到文件末尾（够用：组件内 hook 都在 railItems 之后再往下若干行）
const hookRe = /React\.(useState|useRef|useMemo|useCallback|useReducer)\s*\(([^;]*)/;
const rows = [];
for (let i = start; i < lines.length; i += 1) {
  const m = hookRe.exec(lines[i]);
  if (!m) continue;
  const kind = m[1];
  // 取初始值表达式（useState/useReducer 才占状态槽；useRef/useMemo/useCallback 也占句柄槽，视 shim 实现而定）
  let init = '';
  if (kind === 'useState') {
    let expr = m[2];
    // 跨行情况：把后面几行拼上直到括号平衡
    let j = i;
    while ((expr.match(/\(/g) || []).length > (expr.match(/\)/g) || []).length && j < i + 5) {
      j += 1;
      expr += ' ' + (lines[j] || '');
    }
    const inner = expr.slice(expr.indexOf('(') + 1);
    // 找 useState( 后的第一个参数，切到配对的右括号
    let depth = 1, out = '', k = 0;
    while (k < inner.length && depth > 0) {
      const ch = inner[k];
      if (ch === '(' || ch === '[' || ch === '{') depth += 1;
      else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
      if (depth > 0) out += ch;
      k += 1;
    }
    init = out.trim();
  }
  rows.push({ line: i + 1, kind, init });
}

// 只保留到 railItems 之后 500 行内（组件范围，粗略但够定位）
const railPos = rows.findIndex(r => r.line === railIdx + 1);
console.log(`共扫到 ${rows.length} 个 hook，railItems 在其中的序号（0 起）: ${railPos}\n`);
rows.slice(0, railPos + 3).forEach((r, idx) => {
  console.log(`${String(idx).padStart(2)}  行${String(r.line).padStart(5)}  ${r.kind.padEnd(10)} init=${r.init.slice(0, 60)}`);
});
