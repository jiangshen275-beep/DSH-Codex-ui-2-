// AI 消息节点拾取。
//
// 设计约束：宿主 UI 全量使用构建期哈希 CSS 类名（如 .Kwoi6G_body），
// 任何写死类名的定位都会在下一个宿主版本失效。这里改用结构特征定位：
//   1. 锚点用宿主官方槽位属性 data-slot="main.conversation"（新版）
//      与 data-slot="conversation"（alpha.1 及更早），两者都是宿主自己
//      渲染的公开契约，不是内部实现细节；
//   2. 每条聊天节点用官方槽位 data-slot="conversation.chat.node" 定位，
//      在其子树内按「markdown 容器」形状识别助手正文；
//   3. 同一节点绝不重复接管（幂等标记属性）。
//
// 真实 UI 实测（CDP 打到的生产 DOM）修正过的教训：
//   - 旧主路径按 [class*="_body"] 找容器是**毒药**：当前宿主的
//     <hashed>_body 是整个对话滚动区（内含全部消息与工具栏按钮），
//     它会把所有真正的消息容器体在「最外层过滤」里，剩下的巨型
//     容器又被分类器的结构性检查拒绝 → 一条都接管不到。
//   - 当前宿主每条消息是一个 [data-slot="conversation.chat.node"]；
//     助手正文在 markdown 容器里（直接子元素全是 p/ul/ol/pre/…），
//     思考块是可折叠行（子元素为 span/svg，不含块级子元素），
//     用户消息是气泡（span 文本），系统/上下文注入、错误行、
//     用量行各有形状——按「块级子元素占比」全部天然区分开。
//
// 全程不修改宿主节点的结构与样式类，只追加自身属性与子节点，
// 因此不与其他插件在同一子树上的注入相互干扰。

/** 会话列锚点选择器（新版键控槽位优先，旧版兜底）。 */
export const CONVERSATION_SELECTOR = '[data-slot="main.conversation"], [data-slot="conversation"]'

/** 每条聊天节点的官方槽位（当前宿主渲染的消息列表单元）。 */
const CHAT_NODE_SELECTOR = '[data-slot="conversation.chat.node"]'

/**
 * 浮层容器：这些里面的 <p> 不是消息正文。
 *
 * 本包自己的面板（`cg-model-*` 是模型选择弹层，见 src/model-ui.js）和宿主的
 * 菜单/对话框都会渲染段落，兜底路径只认标签名就会把它们接管，页面上于是出现
 * 一条挂在「当前模型未提供推理强度设置。」旁边的修改入口（2026-10-21 真机）。
 */
const FLOATING_SELECTOR = [
  '[role="dialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[role="tooltip"]',
  '[aria-modal="true"]',
  '[class*="cg-model"]',
].join(', ')

/** 祖先链上是否有绝对/固定定位（浮层的形状）。 */
function hasPositionedAncestor(el) {
  let node = el.parentElement
  let hops = 0
  while (node !== null && hops < 8) {
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(node) : null
    if (style !== null && (style.position === 'absolute' || style.position === 'fixed')) return true
    node = node.parentElement
    hops += 1
  }
  return false
}

/** 块级文本标签：markdown 渲染产物的形状。 */
const BLOCK_TAGS = 'p, pre, ul, ol, blockquote, h1, h2, h3, h4, h5, h6, table'

/** 幂等标记：已接管的节点带此属性。 */
export const TAKEN_ATTR = 'data-rf3-taken'

// 门槛从 24 降到 1：短回复（"好的"/"嗯，还醒着。要测什么，直接说。"）
// 恰恰是最常需要就地伪造的对象。容器形状判定（isMarkdownContainer）与
// 分类器已经排除掉状态行/工具栏等噪声，正文长度不再承担过滤职责。
const MIN_TEXT = 1
export { MIN_TEXT }

/** 文本长度（去空白），用于过滤状态标签与工具行。 */
function textLen(el) {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim().length
}

/**
 * 判断是否为「markdown 正文容器」：直接子元素里块级标签占一半以上。
 * 这一形状把三类容器区分开：
 *   - 助手正文容器：子元素就是 p/ul/ol/pre…（全中）；
 *   - 思考块：可折叠行，子元素是 span/svg/div 折行（不中）；
 *   - 布局外壳：子元素是 div 嵌套（不中）。
 */
function isMarkdownContainer(el) {
  if (typeof el.matches !== 'function') return false
  const kids = [...el.children]
  if (kids.length === 0) return false
  let blocks = 0
  for (const k of kids) {
    try {
      if (k.matches(BLOCK_TAGS)) blocks += 1
    } catch {
      return false
    }
  }
  return blocks >= 1 && blocks * 2 >= kids.length
}

/**
 * 从会话根节点中挑出「助手消息块」。
 *
 * 识别策略（按可靠性排序）：
 * - 主路径：官方聊天节点槽位 [data-slot="conversation.chat.node"]
 *   子树内的 markdown 容器（见 isMarkdownContainer）；
 * - 兜底：宿主换皮、槽位不存在时，取直接含 <p> 的父容器。
 *
 * 两种路径都要求「不在输入框内、不在我们自己的 UI内」。
 *
 * @param {Element} root 会话根
 * @param {Function|null} classify 分类器，返回 {ok} 决定是否放行
 * @param {{includeTaken?: boolean}} options
 *   includeTaken=true 用于**枚举**（定位、快捷键）：已接管的块也要收进来。
 *   默认 false 用于**扫描**：已接管的跳过，避免重复挂件。
 */
/**
 * 找出挂在这条块上的操作条（可能挂在块内，也可能挂在宿主操作行那一排里）。
 *
 * 注意：`attachBar` 找到宿主那排 `assistant-actions` 时，会把操作条插进那排里，
 * 也就是说条子**不在块内部**。所以"块里查 .rf3-bar"这个判据永远为假——后果是
 * 每帧扫描都以为条子丢了、清标记重新接管一遍，按钮被反复重建（真机 2026-10-21
 * 诊断：8 个已接管块 bar 全报 false，页面上按钮时有时无）。
 *
 * @param {Element} el 候选块
 * @returns {Element|null}
 */
export function blockBarOf(el) {
  try {
    const own = el.querySelector('.rf3-bar')
    if (own !== null) return own
    const flow = el.closest('[data-slot="conversation.chat.flow"]')
    const scope = flow ?? el.ownerDocument ?? el
    for (const bar of scope.querySelectorAll('.rf3-bar')) {
      if (bar.__rf3Block === el && bar.isConnected !== false) return bar
    }
  } catch {
    return null
  }
  return null
}

/**
 * 这条块身上有没有我们挂的操作条。
 * @param {Element} el 候选块
 * @returns {boolean}
 */
export function blockHasBar(el) {
  return blockBarOf(el) !== null
}

export function pickAssistantBlocks(root, classify = null, options = {}) {
  if (root === null || typeof root.querySelectorAll !== 'function') return []
  const includeTaken = options.includeTaken === true
  const out = []
  const seen = new Set()

  const consider = el => {
    if (el === null || seen.has(el)) return
    // 不可见容器一律不接管：实测当前宿主在 main.conversation 内还渲染了折叠的
    // 右侧栏 /「空面板」占位（x 坐标远超视口、visibility:hidden、opacity:0）。
    // 挂上去只会得到一个永远看不见的按钮，还占掉幂等标记、把真正的消息块挤掉
    // ——真机表现就是「重启后还是没有任何按钮」。
    if (typeof el.getClientRects === 'function' && el.getClientRects().length === 0) return
    if (el.closest('.rf3-editor, .rf3-bar, textarea, input') !== null) return
    // 宿主持话输入框（Lexical 宿主，恒带 data-composer-input）：草稿阶段的
    // typed 文本就在 <p> 里，兜底路径会顺着 p.parentElement 摸到它——给输入框
    // 挂一条「伪造回复」操作条纯属干扰（真机复现：新会话里字打完，输入框上
    // 多出按钮）。可编辑区一律不接管：插件改写的是已渲染的消息文本，
    // 不是用户正在输入的内容。
    if (el.closest('[data-composer-input]') !== null) return
    if (el.isContentEditable === true) return
    // 浮层不是消息：插件自己的面板（模型选择、记忆……）和宿主的菜单/弹层里
    // 同样有 <p>，兜底路径只认标签名，会把它们当成一段正文接管。真机
    // 2026-10-21：模型选择面板里的「当前模型未提供推理强度设置。」被挂上了
    // 修改入口（见 src/model-ui.js 的 h('p', { className: 'cg-model-message' }）。
    if (el.closest(FLOATING_SELECTOR) !== null) return
    // 同一件事的通用兜底：不在聊天节点里、又处在绝对/固定定位的祖先之下，
    // 那就是浮层（tooltip、下拉、侧滑面板），不是消息正文。
    if (el.closest(CHAT_NODE_SELECTOR) === null && hasPositionedAncestor(el) === true) return
    if (typeof el.hasAttribute === 'function' && el.hasAttribute(TAKEN_ATTR)) {
      if (includeTaken === true) {
        // 枚举用途：已接管的块照样收进来。不收的话，一旦所有块都接管完，
        // 调用方就拿到空列表——快捷键静默失效、定位接口报 0 个块。
      } else if (blockHasBar(el)) {
        // 已接管且操作条还在 → 跳过（幂等）。
        return
      } else {
        // 已接管但操作条被宿主抹掉（流式更新原地替换子节点）→ 清标记
        // 重新接管：否则按钮会永远消失，直到整个消息节点被换新。
        el.removeAttribute(TAKEN_ATTR)
      }
    }
    // 去空白后一个字都没有的容器一律排除：真机诊断 2026-10-21 抓到一个
    // 只含 "\n\n" 的空壳块被兜底配对配到了某条 final 回复上，页面上就多出
    // 一条空的操作条。textLen 只看 textContent，容易被子节点结构骗过，
    // 这里直接按"全空白即空"判。
    if ((el.textContent ?? '').replace(/\s+/g, '').length === 0) return
    seen.add(el)
    out.push(el)
  }

  // 主路径：聊天节点槽位 → markdown 容器
  let nodes = []
  try {
    nodes = [...root.querySelectorAll(CHAT_NODE_SELECTOR)]
  } catch {
    nodes = []
  }
  for (const node of nodes) {
    let containers = []
    try {
      containers = [...node.querySelectorAll('*')].filter(isMarkdownContainer)
    } catch {
      containers = []
    }
    // 形状判定失配时的兜底：宿主新版把 markdown 正文包在带 markdown 类名的
    // 容器里（如 <div class="__markdown_xxx">），而其中若夹了非块级兄弟
    // （figure / 分隔 div / 操作条），块级占比就不再过半 → 主判定整个失效。
    // 直接认类名，比按形状猜更稳。
    if (containers.length === 0) {
      try {
        containers = [...node.querySelectorAll('[class*="markdown"]')]
      } catch {
        containers = []
      }
    }
    // 节点内取最外层：嵌套的 markdown 容器（如 blockquote 内的段落）
    // 由外层代管，避免同一条消息挂多个按钮。
    let outermostInNode = containers.filter(el => !containers.some(o => o !== el && o.contains(el)))

    // 同一条消息被切成几块时（行内代码、表格、图片把段落断开，宿主会渲染出
    // 多个互不包含的正文容器），逐块接管谁都跟记录里那条完整正文对不上——
    // 真机诊断 2026-10-21：一条两百多字的回复只抓到 106 字，定位因此失败，
    // 入口随之消失。这时改用它们的共同祖先代管整条消息；共同祖先若是 chat.node
    // 本身就不动，否则会把操作条、时间戳一并圈进正文。
    if (outermostInNode.length > 1) {
      let common = outermostInNode[0].parentElement
      while (common !== null && common !== node && !outermostInNode.every(el => common.contains(el))) {
        common = common.parentElement
      }
      if (common !== null && common !== node && outermostInNode.every(el => common.contains(el))) {
        outermostInNode = [common]
      }
    }
    for (const el of outermostInNode) {
      if (textLen(el) < MIN_TEXT) continue
      consider(el)
    }
  }

  // 兜底路径：没有聊天节点槽位时（宿主换皮），取直接含段落的容器。
  // 只有主路径颗粒无收时才走这里——旧版把 _body 容器当主路径，
  // 它先塞进巨型滚动容器把兜底路径堵死，是「界面无变化」的根因。
  if (out.length === 0) {
    const paras = [...root.querySelectorAll('p')]
    for (const p of paras) {
      const host = p.parentElement
      if (host === null) continue
      if (textLen(host) < MIN_TEXT) continue
      consider(host)
    }
  }

  // 只保留最外层：若 A 包含 B，丢掉 B，避免嵌套重复挂按钮
  const outermost = out.filter(el => !out.some(other => other !== el && other.contains(el)))

  // 分类器（方案2）：只放行纯自然语言块，工具调用/结构化动作整块拒绝。
  // 未传分类器时不做限制（保持向后兼容的调用形态）。
  if (typeof classify !== 'function') return outermost
  return outermost.filter(el => classify(el).ok === true)
}

/** 会话根：优先取锚点，退化到含 main.conversation 的文档。 */
export function conversationRoot(doc = document) {
  const hit = doc.querySelector(CONVERSATION_SELECTOR)
  if (hit !== null) return hit
  // 宿主可能在 #root 之下才挂载；退回文档体但限制在 #root 内，
  // 避免接管插件自身面板等非会话区域。
  const root = doc.getElementById('root')
  return root ?? doc.body
}
