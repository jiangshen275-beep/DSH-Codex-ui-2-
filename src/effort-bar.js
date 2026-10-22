/**
 * 「推理强度条」在没有档位时的占位开关。
 *
 * 中转站转发的模型（`deepseek-v4.1-flash` 这类）在模型目录里没有 `reasoning.efforts`，`model-ui` 的
 * `steps` 因此是空的，整个面板只剩一句「当前模型未提供推理强度设置」。档位选不了是上游的限制，
 * 但连滑条都看不见比选不了更难受 —— 这里存的就是「要不要把同一条滑条画出来」这一个开关，
 * 以及画出来之后停在哪一格。
 *
 * 两处读它：`model-ui` 决定渲染，`injection-ui` 画那行开关。键名与取值都在本文件里定义，
 * 两边不许各写一份字面量 —— 复制的常量迟早会分叉。
 *
 * 存 localStorage 而不是宿主状态：它不改变模型行为，只改画面。写进会话配置反而会让一份纯视觉偏好
 * 跟着会话跑，换个会话就变样。
 */

const BAR_KEY = 'dsh-codex-ui/placeholder-effort-bar';
const GRADE_KEY = 'dsh-codex-ui/placeholder-effort-grade';

/**
 * 占位档位：四格真实档位，第五格由 `model-ui` 照常追加虚拟 Ultra —— 与本包给真模型画的那条滑条
 * 完全同构，所以紫色、流星、`Ultra` 那个名字都不用另做。
 *
 * id 直接借用真实档位的名字（`low` … `xhigh`），因为滑条的颜色、深度、刻度全按 id 走现成的规则，
 * 另起一套假 id 会让它变成一条没有色阶的灰条。默认停在 `high`。
 */
export const PLACEHOLDER_EFFORTS = [
  { id: 'off', name: 'Off' },
  { id: 'low', name: 'Low' },
  { id: 'high', name: 'High' },
  { id: 'xhigh', name: 'Max' }
];

/** 虚拟 Ultra 那一格的 id，与 `model-ui` 里追加的那一格同名。它只停在本机，不发给宿主。 */
export const PLACEHOLDER_ULTRA = '__ultra__';

const read = key => { try { return window.localStorage.getItem(key); } catch { return null; } };
// 隐私模式写不进去时不当成失败：这一次的选择在内存里仍然生效，下次读回默认值。
const write = (key, value) => { try { window.localStorage.setItem(key, value); } catch { /* 存不了就算了 */ } };

/** 只有显式存过 `0` 才算关：没存过、存坏了都读成开，因为要这个功能的人比不要的多。 */
export const effortBarEnabled = () => read(BAR_KEY) !== '0';

export const setEffortBarEnabled = on => write(BAR_KEY, on ? '1' : '0');

/** 存过的档位；不在占位列表里的值（列表改过、手写坏了）回到默认的 high。Ultra 那格要留住。 */
export const effortGrade = () => {
  const stored = read(GRADE_KEY);
  if (stored === PLACEHOLDER_ULTRA) return PLACEHOLDER_ULTRA;
  return PLACEHOLDER_EFFORTS.some(step => step.id === stored) ? stored : 'high';
};

export const setEffortGrade = id => {
  if (id === PLACEHOLDER_ULTRA || PLACEHOLDER_EFFORTS.some(step => step.id === id)) write(GRADE_KEY, id);
};
