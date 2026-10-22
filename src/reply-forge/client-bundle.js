const ReplyForgeFactory = (require) => {
var __msrc_reply_forge_client_styles_mjs = (function(){ 



const CSS = `
.rf3-btn{
  display:inline-flex;align-items:center;gap:4px;
  height:22px;padding:0 8px;border-radius:6px;
  border:1px solid color-mix(in srgb, currentColor 22%, transparent);
  background:transparent;color:inherit;
  font:inherit;font-size:12px;line-height:1;
  cursor:pointer;opacity:.55;
  transition:opacity .12s, background-color .12s;
  white-space:nowrap;user-select:none;
}
.rf3-btn:hover{opacity:1;background:color-mix(in srgb, currentColor 8%, transparent)}
.rf3-btn:focus-visible{outline:2px solid color-mix(in srgb, currentColor 60%, transparent);outline-offset:1px}
.rf3-btn[data-active]{opacity:1;border-color:color-mix(in srgb, #e0a34a 60%, transparent);color:#e0a34a}

/* 操作条：常驻在块末尾，不做「悬停才显形」的绝对定位悬浮条。
   原实现是 position:absolute; top:2px; right:6px; opacity:0 仅在 :hover 显形，
   一旦宿主换皮（dsh-codex-ui 等）改了消息容器的定位/溢出，按钮就整个落在
   视觉外——按钮明明在 DOM 里、用户却完全看不到。常驻显示牺牲一点整洁，
   换来「永远看得见、点得着」。 */
.rf3-bar{
  display:flex;gap:6px;align-items:center;justify-content:flex-end;
  margin:2px 0 4px;opacity:.8;
  transition:opacity .14s;
}
.rf3-host:hover > .rf3-bar,
.rf3-bar:focus-within{opacity:1}

/* 并进宿主原生操作行（复制 / 点赞 / 点踩 / 分支）时：不另起一行、
   不加外边距，与宿主图标同一基线。 */
.rf3-bar.rf3-inline{
  display:inline-flex;gap:2px;align-items:center;
  margin:0 0 0 4px;opacity:1;
}

/* 图标按钮：只有对话气泡，尺寸与宿主自带的操作图标对齐（28px 热区 / 16px 图形）。 */
.rf3-icon{
  display:inline-flex;align-items:center;justify-content:center;
  width:28px;height:28px;padding:0;border:0;border-radius:6px;
  background:transparent;color:inherit;cursor:pointer;
  /* line-height:0：按钮里的内容只有一层 svg，留行高会让图形被基线推低几个
     像素，看着就不在正中（用户 2026-10-21 反馈过）。 */
  line-height:0;
  opacity:.6;position:relative;
  transition:opacity .12s, background-color .12s;
}
.rf3-icon:hover{opacity:1;background:color-mix(in srgb, currentColor 10%, transparent)}
.rf3-icon:focus-visible{outline:2px solid color-mix(in srgb, currentColor 55%, transparent);outline-offset:1px}
.rf3-icon svg{width:16px;height:16px;display:block}
/* 已定位到落盘记录时不再画右上角绿点：用户 2026-10-21 要求去掉，嫌它多余。
   data-rf3-linked 属性保留，只给诊断与调试看。 */

/* 消息容器需要定位上下文：只在被接管的容器上加，宿主其余节点不受影响 */
.rf3-host{position:relative}
.rf3-host[data-rf3-edited]{box-shadow:inset 2px 0 0 color-mix(in srgb, #e0a34a 70%, transparent)}

/* 编辑器是浮层：fixed 定位挂在 body 上，不进消息块。
   真机教训（2026-10-20，codex-ui 皮肤下）：append 进消息块会把气泡撑开，
   视觉上像「框跳出去了」。浮层完全不碰消息布局。

   第二条教训（同日）：align-items:center 居中 + 内容超高时，flex 会把
   顶部溢出到视口外且**滚不到**——截图里顶部被切掉就是这个。改成
   overflow:auto + 子项 margin:auto：内容矮时居中，超高时可滚到顶。 */
.rf3-overlay{
  position:fixed;inset:0;z-index:9999;
  display:flex;overflow:auto;
  padding:24px;
  background:rgba(0,0,0,.45);
}
.rf3-editor{
  margin:auto;
  display:flex;flex-direction:column;gap:8px;
  width:min(720px, 100%);
  padding:14px;border-radius:12px;
  border:1px solid color-mix(in srgb, currentColor 18%, transparent);
  background:Canvas;
  color:CanvasText;
  box-shadow:0 12px 40px rgba(0,0,0,.35);
}
.rf3-editor textarea{
  width:100%;min-height:160px;max-height:45vh;resize:vertical;
  padding:8px 10px;border-radius:8px;
  border:1px solid color-mix(in srgb, currentColor 20%, transparent);
  background:color-mix(in srgb, currentColor 3%, transparent);
  color:inherit;font:inherit;font-size:13px;line-height:1.6;
}
.rf3-editor textarea:focus-visible{outline:2px solid color-mix(in srgb, currentColor 45%, transparent);outline-offset:1px}
.rf3-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.rf3-spacer{flex:1 1 auto}
.rf3-hint{font-size:11px;opacity:.9}

/* 目标选择器（v3）：把宿主给的可编辑块清单列出来，思维链与折叠历史
   也能选中——它们走 seq+blockIndex 寻址，不依赖 DOM 形状。
   flex-wrap 必须开：两个下拉并排时（正文 + 写入方式）总宽会超过框宽，
   不换行就只能横向滚动。min-width:0 让 select 能收缩到内容宽度以下，
   否则 select 的固有宽度会把整行顶出框外。 */
.rf3-targets{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.rf3-select{
  flex:1 1 auto;min-width:0;max-width:100%;
  height:24px;padding:0 6px;border-radius:6px;
  border:1px solid color-mix(in srgb, currentColor 20%, transparent);
  background:color-mix(in srgb, currentColor 3%, transparent);
  color:inherit;font:inherit;font-size:11px;
}
.rf3-select:focus-visible{outline:2px solid color-mix(in srgb, currentColor 45%, transparent);outline-offset:1px}
.rf3-select:disabled{opacity:.4}
/* 展开的候选列表：**当前选中的那一条**要有稳定底色。
   原生 select 的弹出层里，鼠标划过是一项浅蓝（系统给的 hover），移开就没了；
   用户看着一列十几条【正文】/【思维链】，根本认不出自己选的是哪一条
   （2026-10-21 反馈）。:checked 是"真正被选中的那一项"，给它一层浅灰底，
   与 hover 的蓝色区分开：颜色留得住，鼠标移开也还在。 */
.rf3-select option{background:#2b2b2b;color:#e6e6e6}
.rf3-select option:checked{
  /* 只求"看得出选的是哪条"，不求跳出来：底色比其它项亮一点点，字色与周围同一
     档，也不加粗。#4d4d4d + 纯白 + 600 那版太扎眼（2026-10-21 反馈：突兀、刺眼、
     白字跟周围不搭），这里整体往回收。 */
  background:#3a3a3a;
  color:#ededed;
}
/* 弹层：深色底 + 灰色字。
   试过几版都不对——白底白字看不见、黑底白字刺眼、白底深字发亮。
   最终按真机反馈定成深底灰字：底色跟框一致，文字不抢眼。 */
.rf3-select option,
.rf3-mode option{
  background:#1c1c1c;
  color:#a8a8a8;
}

/* 写入方式（v3.1）：在线/落盘两条路的前提差别太大，交给用户显式选。 */
.rf3-mode{
  flex:0 0 auto;
  height:24px;padding:0 6px;border-radius:6px;
  border:1px solid color-mix(in srgb, currentColor 20%, transparent);
  background:color-mix(in srgb, currentColor 3%, transparent);
  color:inherit;font:inherit;font-size:11px;
}
.rf3-mode:focus-visible{outline:2px solid color-mix(in srgb, currentColor 45%, transparent);outline-offset:1px}

/* 状态行：定位结果与写入结果都走这里。
   v1 的 .rf-primary / .rf-danger 是**类选择器**，而代码设的是 data-* 属性，
   选择器永远匹配不上（死样式）。v2 统一改成属性选择器。 */
.rf3-note{font-size:11px;line-height:1.5}
/* 三色都降了饱和/亮度：原来的高饱和绿橙蓝在暗底上刺眼（真机反馈）。 */
.rf3-note-ok{color:#5f9c7a}
.rf3-note-warn{color:#c08f55}
.rf3-note-info{color:#7aa2c9}
.rf3-note-hint{opacity:.75;word-break:break-all}

.rf3-btn[data-rf3-primary]{
  border-color:color-mix(in srgb, #4f8cff 55%, transparent);
  background:color-mix(in srgb, #4f8cff 14%, transparent);
  color:inherit;opacity:1;
}
.rf3-btn[data-danger]{opacity:.9}
.rf3-btn[data-danger]:hover{border-color:color-mix(in srgb, #d9534f 60%, transparent);color:#d9534f}
.rf3-btn:disabled{opacity:.3;cursor:not-allowed}
.rf3-btn:disabled:hover{background:transparent}

/* 操作条按钮上的同类小绿点也去掉了（同上，2026-10-21 用户要求）。 */
`

 return { CSS: CSS } })();
var CSS = __msrc_reply_forge_client_styles_mjs.CSS;
var __msrc_reply_forge_client_picker_mjs = (function(){ 


























const CONVERSATION_SELECTOR = '[data-slot="main.conversation"], [data-slot="conversation"]'


const CHAT_NODE_SELECTOR = '[data-slot="conversation.chat.node"]'








const FLOATING_SELECTOR = [
  '[role="dialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[role="tooltip"]',
  '[aria-modal="true"]',
  '[class*="cg-model"]',
].join(', ')


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


const BLOCK_TAGS = 'p, pre, ul, ol, blockquote, h1, h2, h3, h4, h5, h6, table'


const TAKEN_ATTR = 'data-rf3-taken'




const MIN_TEXT = 1
function textLen(el) {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim().length
}








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




























function blockBarOf(el) {
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






function blockHasBar(el) {
  return blockBarOf(el) !== null
}

function pickAssistantBlocks(root, classify = null, options = {}) {
  if (root === null || typeof root.querySelectorAll !== 'function') return []
  const includeTaken = options.includeTaken === true
  const out = []
  const seen = new Set()

  const consider = el => {
    if (el === null || seen.has(el)) return
    
    
    
    
    if (typeof el.getClientRects === 'function' && el.getClientRects().length === 0) return
    if (el.closest('.rf3-editor, .rf3-bar, textarea, input') !== null) return
    
    
    
    
    
    if (el.closest('[data-composer-input]') !== null) return
    if (el.isContentEditable === true) return
    
    
    
    
    if (el.closest(FLOATING_SELECTOR) !== null) return
    
    
    if (el.closest(CHAT_NODE_SELECTOR) === null && hasPositionedAncestor(el) === true) return
    if (typeof el.hasAttribute === 'function' && el.hasAttribute(TAKEN_ATTR)) {
      if (includeTaken === true) {
        
        
      } else if (blockHasBar(el)) {
        
        return
      } else {
        
        
        el.removeAttribute(TAKEN_ATTR)
      }
    }
    
    
    
    
    if ((el.textContent ?? '').replace(/\s+/g, '').length === 0) return
    seen.add(el)
    out.push(el)
  }

  
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
    
    
    
    
    if (containers.length === 0) {
      try {
        containers = [...node.querySelectorAll('[class*="markdown"]')]
      } catch {
        containers = []
      }
    }
    
    
    let outermostInNode = containers.filter(el => !containers.some(o => o !== el && o.contains(el)))

    
    
    
    
    
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

  
  
  
  if (out.length === 0) {
    const paras = [...root.querySelectorAll('p')]
    for (const p of paras) {
      const host = p.parentElement
      if (host === null) continue
      if (textLen(host) < MIN_TEXT) continue
      consider(host)
    }
  }

  
  const outermost = out.filter(el => !out.some(other => other !== el && other.contains(el)))

  
  
  if (typeof classify !== 'function') return outermost
  return outermost.filter(el => classify(el).ok === true)
}


function conversationRoot(doc = document) {
  const hit = doc.querySelector(CONVERSATION_SELECTOR)
  if (hit !== null) return hit
  
  
  const root = doc.getElementById('root')
  return root ?? doc.body
}

 return { blockBarOf: blockBarOf, blockHasBar: blockHasBar, pickAssistantBlocks: pickAssistantBlocks, conversationRoot: conversationRoot, CONVERSATION_SELECTOR: CONVERSATION_SELECTOR, TAKEN_ATTR: TAKEN_ATTR, MIN_TEXT: MIN_TEXT } })();
var CONVERSATION_SELECTOR = __msrc_reply_forge_client_picker_mjs.CONVERSATION_SELECTOR;
var TAKEN_ATTR = __msrc_reply_forge_client_picker_mjs.TAKEN_ATTR;
var blockBarOf = __msrc_reply_forge_client_picker_mjs.blockBarOf;
var blockHasBar = __msrc_reply_forge_client_picker_mjs.blockHasBar;
var pickAssistantBlocks = __msrc_reply_forge_client_picker_mjs.pickAssistantBlocks;
var conversationRoot = __msrc_reply_forge_client_picker_mjs.conversationRoot;
var __msrc_reply_forge_client_markdown_mjs = (function(){ 








function inline(doc, text) {
  const frag = doc.createDocumentFragment()
  
  const re = /(`[^`\n]+`|\*\*[^*\n]+\*\*|~~[^~\n]+~~|\[[^\]\n]+\]\([^)\n]*\)|(?<![\w*])\*[^*\n]+\*(?![\w*]))/g
  let last = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) frag.append(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('`')) {
      const code = doc.createElement('code')
      code.textContent = tok.slice(1, -1)
      frag.append(code)
    } else if (tok.startsWith('**')) {
      const strong = doc.createElement('strong')
      strong.textContent = tok.slice(2, -2)
      frag.append(strong)
    } else if (tok.startsWith('~~')) {
      const del = doc.createElement('del')
      del.textContent = tok.slice(2, -2)
      frag.append(del)
    } else if (tok.startsWith('[')) {
      const hit = /^\[([^\]]+)\]\(([^)]*)\)$/.exec(tok)
      const a = doc.createElement('a')
      if (hit !== null) {
        a.textContent = hit[1]
        const href = hit[2].trim()
        
        if (/^(https?:|mailto:|#|\/|\.)/i.test(href)) {
          a.setAttribute('href', href)
          a.setAttribute('rel', 'noreferrer noopener')
        }
      } else {
        a.textContent = tok
      }
      frag.append(a)
    } else {
      const em = doc.createElement('em')
      em.textContent = tok.slice(1, -1)
      frag.append(em)
    }
    last = m.index + tok.length
  }
  if (last < text.length) frag.append(text.slice(last))
  return frag
}


function splitRow(line) {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells = []
  let buf = ''
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i]
    if (ch === '\\' && inner[i + 1] === '|') { buf += '|'; i += 1; continue }
    if (ch === '|') { cells.push(buf.trim()); buf = ''; continue }
    buf += ch
  }
  cells.push(buf.trim())
  return cells
}

function isDivider(line) {
  return /^\s*\|?[\s:-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes('-')
}






function renderMarkdown(container, source, docOverride) {
  
  
  const doc = docOverride ?? container.ownerDocument ?? globalThis.document
  container.textContent = ''
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n')

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    
    if (line.trim() === '') { i += 1; continue }

    
    const fence = /^\s*```([A-Za-z0-9_+-]*)\s*$/.exec(line)
    if (fence !== null) {
      const lang = fence[1] ?? ''
      const buf = []
      i += 1
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { buf.push(lines[i]); i += 1 }
      i += 1 
      const pre = doc.createElement('pre')
      const code = doc.createElement('code')
      if (lang !== '') code.setAttribute('data-language', lang)
      code.textContent = buf.join('\n')
      pre.append(code)
      container.append(pre)
      continue
    }

    
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      container.append(doc.createElement('hr'))
      i += 1
      continue
    }

    
    const head = /^\s*(#{1,6})\s+(.*)$/.exec(line)
    if (head !== null) {
      const h = doc.createElement('h' + head[1].length)
      h.append(inline(doc, head[2]))
      container.append(h)
      i += 1
      continue
    }

    
    if (line.includes('|') && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const header = splitRow(line)
      i += 2
      const bodyRows = []
      while (i < lines.length && lines[i].trim() !== '' && lines[i].includes('|')) {
        bodyRows.push(splitRow(lines[i]))
        i += 1
      }
      const table = doc.createElement('table')
      const thead = doc.createElement('thead')
      const htr = doc.createElement('tr')
      for (const cell of header) {
        const th = doc.createElement('th')
        th.append(inline(doc, cell))
        htr.append(th)
      }
      thead.append(htr)
      table.append(thead)
      const tbody = doc.createElement('tbody')
      for (const row of bodyRows) {
        const tr = doc.createElement('tr')
        for (const cell of row) {
          const td = doc.createElement('td')
          td.append(inline(doc, cell))
          tr.append(td)
        }
        tbody.append(tr)
      }
      table.append(tbody)
      container.append(table)
      continue
    }

    
    if (/^\s*>\s?/.test(line)) {
      const buf = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''))
        i += 1
      }
      const quote = doc.createElement('blockquote')
      const inner = doc.createElement('div')
      renderMarkdown(inner, buf.join('\n'))
      quote.append(inner)
      container.append(quote)
      continue
    }

    
    if (/^\s*[-*+]\s+/.test(line)) {
      const list = doc.createElement('ul')
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        const li = doc.createElement('li')
        const text = lines[i].replace(/^\s*[-*+]\s+/, '')
        li.append(inline(doc, text))
        i += 1
        
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*[-*+]\s+/.test(lines[i])) {
          li.append(doc.createTextNode(' ' + lines[i].trim()))
          i += 1
        }
        list.append(li)
      }
      container.append(list)
      continue
    }

    
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const list = doc.createElement('ol')
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        const li = doc.createElement('li')
        li.append(inline(doc, lines[i].replace(/^\s*\d+[.)]\s+/, '')))
        i += 1
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*\d+[.)]\s+/.test(lines[i])) {
          li.append(doc.createTextNode(' ' + lines[i].trim()))
          i += 1
        }
        list.append(li)
      }
      container.append(list)
      continue
    }

    
    const buf = []
    while (
      i < lines.length
      && lines[i].trim() !== ''
      && !/^\s*```/.test(lines[i])
      && !/^\s*#{1,6}\s/.test(lines[i])
      && !/^\s*>\s?/.test(lines[i])
      && !/^\s*[-*+]\s+/.test(lines[i])
      && !/^\s*\d+[.)]\s+/.test(lines[i])
      && !/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
    ) {
      buf.push(lines[i])
      i += 1
    }
    if (buf.length > 0) {
      const p = doc.createElement('p')
      p.append(inline(doc, buf.join('\n')))
      container.append(p)
    } else {
      i += 1
    }
  }
}

 return { renderMarkdown: renderMarkdown } })();
var renderMarkdown = __msrc_reply_forge_client_markdown_mjs.renderMarkdown;
var __msrc_reply_forge_client_classify_mjs = (function(){ 























const ACTION_TEXT = [
  'tool-call', 'tool_call', 'toolResult', 'tool-result',
  'function_call', 'functionCall',
  '运行命令', '执行命令', '调用工具', '工具调用', '工具结果',
  '写入文件', '修改文件', '创建文件', '删除文件', '读取文件',
  '已应用补丁', '应用补丁',
  'exit code', 'exitCode', 'stdout', 'stderr',
  '等待授权', '需要确认',
  
  
  
  
  '本轮费用', '未定价用量', '单价单位为每百万',
]


const ACTION_TEXT_LONG_BLOCK = 200


const ACTION_TAGS = new Set(['input', 'select', 'textarea', 'iframe'])


const OWN_UI_SELECTOR = '.rf3-bar, .rf3-editor'


const ACTION_SHAPE = [
  /^[A-Za-z]:\\/m,                       
  /^\/(?:Users|home|usr|etc|var|opt)\//m, 
  /^\s*--?[a-z][a-z0-9-]{2,}/m,          
  /^\s*[{[][\s\S]*[\]}]\s*$/,            
  /\$\s+\S+/,                            
]







function stripCode(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
}










function looksLikeFragment(text) {
  if (/[\u4e00-\u9fa5]/.test(text)) return false            
  if (/[\s。，、；：！？.,;:!?'"()（）【】]/.test(text)) return false 
  return text.length < 40                                   
}






function classifyNaturalLanguage(el) {
  if (el === null || el === undefined) return { ok: false, reason: '空节点' }

  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (text.length === 0) return { ok: false, reason: '空文本' }
  if (looksLikeFragment(text)) return { ok: false, reason: '疑似代码/命令碎片' }

  
  
  
  
  
  
  const lower = stripCode(text).toLowerCase()
  if (text.length < ACTION_TEXT_LONG_BLOCK) {
    for (const marker of ACTION_TEXT) {
      if (lower.includes(marker.toLowerCase())) {
        return { ok: false, reason: '含结构化动作痕迹：' + marker }
      }
    }
  }

  
  let structural = null
  try {
    for (const tag of ACTION_TAGS) {
      const hit = el.querySelector(tag)
      if (hit !== null && hit.closest?.(OWN_UI_SELECTOR) === null) { structural = tag; break }
    }
  } catch {
    
  }
  if (structural !== null) {
    return { ok: false, reason: '含结构性元素 <' + structural + '>' }
  }

  
  for (const re of ACTION_SHAPE) {
    if (re.test(stripCode(text))) return { ok: false, reason: '形态像命令或结构化数据' }
  }

  return { ok: true, reason: '纯自然语言' }
}






function partitionEditable(blocks) {
  const editable = []
  const rejected = []
  for (const el of blocks) {
    const verdict = classifyNaturalLanguage(el)
    if (verdict.ok) editable.push(el)
    else rejected.push({ el, reason: verdict.reason })
  }
  return { editable, rejected }
}

 return { classifyNaturalLanguage: classifyNaturalLanguage, partitionEditable: partitionEditable } })();
var classifyNaturalLanguage = __msrc_reply_forge_client_classify_mjs.classifyNaturalLanguage;
var __msrc_reply_forge_client_store_mjs = (function(){ 






const PREFIX = 'dsh-reply-forge-v3-fixed:'


const PLACEHOLDER_SESSION = '_global'


function isPlaceholderSession(sessionId) {
  return typeof sessionId !== 'string' || sessionId === '' || sessionId === PLACEHOLDER_SESSION
}















function currentSessionId(doc) {
  try {
    const d = doc ?? (typeof document === 'undefined' ? null : document)
    const el = d?.querySelector?.('[data-conversation-session]')
    const domId = el?.getAttribute?.('data-conversation-session')
    if (typeof domId === 'string' && domId !== '') return domId
    
    const path = window.location.pathname ?? ''
    const hit = /(?:^|\/)s(?:ession)?\/([A-Za-z0-9_-]+)/.exec(path)
    if (hit !== null && hit[1] !== undefined) return hit[1]
    const hash = window.location.hash ?? ''
    const hit2 = /(?:^|\/)s(?:ession)?\/([A-Za-z0-9_-]+)/.exec(hash)
    return hit2 !== null && hit2[1] !== undefined ? hit2[1] : PLACEHOLDER_SESSION
  } catch {
    return PLACEHOLDER_SESSION
  }
}


function fingerprint(text) {
  const norm = String(text ?? '').replace(/\s+/g, ' ').trim()
  const head = norm.slice(0, 80)
  const tail = norm.slice(-40)
  return head.length + ':' + head + '|' + tail
}

function keyOf(sessionId) {
  return PREFIX + String(sessionId ?? '_global')
}


function loadOverrides(sessionId) {
  try {
    const raw = window.localStorage.getItem(keyOf(sessionId))
    if (raw === null) return {}
    const parsed = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'object' && v !== null && typeof v.text === 'string') {
        out[k] = { text: v.text, at: typeof v.at === 'number' ? v.at : 0 }
      }
    }
    return out
  } catch {
    return {}
  }
}

function saveOverrides(sessionId, table) {
  try {
    window.localStorage.setItem(keyOf(sessionId), JSON.stringify(table))
    return true
  } catch {
    return false
  }
}


function setOverride(sessionId, fp, text) {
  const table = loadOverrides(sessionId)
  if (String(text ?? '') === '') delete table[fp]
  else table[fp] = { text: String(text), at: Date.now() }
  return saveOverrides(sessionId, table)
}

function removeOverride(sessionId, fp) {
  const table = loadOverrides(sessionId)
  if (!(fp in table)) return false
  delete table[fp]
  return saveOverrides(sessionId, table)
}









function thinkingKeyOf(sessionId) {
  return PREFIX + 'thinking:' + String(sessionId)
}

function loadThinkingOverrides(sessionId) {
  try {
    const raw = window.localStorage.getItem(thinkingKeyOf(sessionId))
    if (raw === null) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) === false) return []
    return parsed.filter(item => item !== null && typeof item === 'object'
      && typeof item.from === 'string' && typeof item.to === 'string'
      && typeof item.seq === 'number' && typeof item.bi === 'number')
  } catch {
    return []
  }
}


function setThinkingOverride(sessionId, entry) {
  if (entry === null || typeof entry !== 'object') return false
  const list = loadThinkingOverrides(sessionId)
    .filter(item => !(item.seq === entry.seq && item.bi === entry.bi))
  list.push({
    seq: entry.seq,
    bi: entry.bi,
    from: String(entry.from ?? ''),
    to: String(entry.to ?? ''),
  })
  try {
    window.localStorage.setItem(thinkingKeyOf(sessionId), JSON.stringify(list.slice(-200)))
    return true
  } catch {
    return false
  }
}


function clearOverrides(sessionId) {
  try {
    window.localStorage.removeItem(keyOf(sessionId))
    return true
  } catch {
    return false
  }
}


function loadPrefs() {
  const base = { enabled: true, autoMark: false }
  try {
    const raw = window.localStorage.getItem(PREFIX + 'prefs')
    if (raw === null) return base
    const parsed = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return base
    return {
      enabled: parsed.enabled !== false,
      autoMark: parsed.autoMark === true,
    }
  } catch {
    return base
  }
}

function savePrefs(prefs) {
  try {
    window.localStorage.setItem(PREFIX + 'prefs', JSON.stringify({
      enabled: prefs.enabled !== false,
      autoMark: prefs.autoMark === true,
    }))
  } catch {
    
  }
}

 return { isPlaceholderSession: isPlaceholderSession, currentSessionId: currentSessionId, fingerprint: fingerprint, loadOverrides: loadOverrides, setOverride: setOverride, removeOverride: removeOverride, loadThinkingOverrides: loadThinkingOverrides, setThinkingOverride: setThinkingOverride, clearOverrides: clearOverrides, loadPrefs: loadPrefs, savePrefs: savePrefs, PLACEHOLDER_SESSION: PLACEHOLDER_SESSION } })();
var currentSessionId = __msrc_reply_forge_client_store_mjs.currentSessionId;
var isPlaceholderSession = __msrc_reply_forge_client_store_mjs.isPlaceholderSession;
var fingerprint = __msrc_reply_forge_client_store_mjs.fingerprint;
var loadOverrides = __msrc_reply_forge_client_store_mjs.loadOverrides;
var setOverride = __msrc_reply_forge_client_store_mjs.setOverride;
var removeOverride = __msrc_reply_forge_client_store_mjs.removeOverride;
var clearOverrides = __msrc_reply_forge_client_store_mjs.clearOverrides;
var loadPrefs = __msrc_reply_forge_client_store_mjs.loadPrefs;
var savePrefs = __msrc_reply_forge_client_store_mjs.savePrefs;
var loadThinkingOverrides = __msrc_reply_forge_client_store_mjs.loadThinkingOverrides;
var setThinkingOverride = __msrc_reply_forge_client_store_mjs.setThinkingOverride;
var __msrc_reply_forge_client_record_mjs = (function(){ 
















const ROUTE = '/api/reply-forge-v3/session/blocks'


const cache = new Map()


function normalizeText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim()
}




















function domSignatureOf(texts) {
  const list = Array.isArray(texts) ? texts : []
  let hash = 2166136261
  for (const text of list) {
    const norm = normalizeText(text)
    hash = Math.imul(hash ^ norm.length, 16777619)
    for (let i = 0; i < norm.length; i += 1) hash = Math.imul(hash ^ norm.charCodeAt(i), 16777619)
  }
  return list.length + ':' + (hash >>> 0).toString(36)
}


















async function loadRecord(sessionId, options = {}) {
  const force = options.force === true
  const signature = typeof options.domSignature === 'string' ? options.domSignature : null
  if (force !== true) {
    const hit = cache.get(sessionId)
    if (hit !== undefined) return hit
  }
  const entry = {
    at: Date.now(), mode: 'disk', file: null, blocks: [], patched: [],
    error: null, liveCode: null, domSignature: signature, openTurn: false,
  }
  try {
    const res = await fetch(ROUTE + '?sessionId=' + encodeURIComponent(sessionId))
    const data = await res.json()
    if (data === null || typeof data !== 'object' || data.ok !== true) {
      entry.error = String((data && data.error) || ('HTTP ' + res.status))
      entry.liveCode = typeof data?.liveCode === 'string' ? data.liveCode : null
    } else {
      entry.mode = data.mode === 'live' ? 'live' : 'disk'
      entry.file = typeof data.file === 'string' ? data.file : null
      entry.blocks = Array.isArray(data.blocks) ? data.blocks : []
      entry.patched = Array.isArray(data.patched) ? data.patched : []
      entry.liveCode = typeof data.liveCode === 'string' ? data.liveCode : null
      
      
      
      
      entry.openTurn = data.openTurn === true
    }
  } catch (error) {
    entry.error = String((error && error.message) || error)
  }
  cache.set(sessionId, entry)
  return entry
}


function cachedRecord(sessionId) {
  return cache.get(sessionId) ?? null
}


function resetCache(sessionId) {
  if (sessionId === undefined) cache.clear()
  else cache.delete(sessionId)
}











































function recordNeedsRefresh(entry, domBlockCount, signature) {
  if (!(domBlockCount > 0)) return false
  if (entry === null || entry === undefined) return true
  if (entry.error !== null && entry.error !== undefined) return true
  if (entry.mode === 'live') {
    
    if (entry.blocks.length === 0) return true
    if (typeof signature !== 'string') return false
    if (typeof entry.domSignature !== 'string') return true
    return entry.domSignature !== signature
  }
  
  
  if (domBlockCount > entry.blocks.length) return true
  if (typeof signature !== 'string') return false
  if (typeof entry.domSignature !== 'string') return true
  return entry.domSignature !== signature
}








function matchBlocks(diskBlocks, domTexts) {
  const out = domTexts.map(() => null)
  const used = new Set()
  const domNorm = domTexts.map(normalizeText)

  
  const byText = new Map()
  diskBlocks.forEach((b, i) => {
    const key = normalizeText(b.text)
    if (!byText.has(key)) byText.set(key, [])
    byText.get(key).push(i)
  })
  domNorm.forEach((key, di) => {
    if (key === '') return
    const list = byText.get(key)
    if (list === undefined) return
    
    while (list.length > 0 && used.has(list[0])) list.shift()
    if (list.length === 0) return
    const bi = list.shift()
    used.add(bi)
    out[di] = { ...diskBlocks[bi], exact: true }
  })

  
  
  
  
  
  
  
  
  
  
  
  const stripped = text => String(text ?? '').replace(/[`*_~]/g, '').replace(/\s+/g, '')
  const domStripped = domTexts.map(stripped)
  const byStripped = new Map()
  diskBlocks.forEach((b, i) => {
    if (used.has(i)) return
    const key = stripped(b.text)
    if (key === '') return
    if (!byStripped.has(key)) byStripped.set(key, [])
    byStripped.get(key).push(i)
  })
  domStripped.forEach((key, di) => {
    if (out[di] !== null || key === '') return
    const list = byStripped.get(key)
    if (list === undefined) return
    while (list.length > 0 && used.has(list[0])) list.shift()
    if (list.length === 0) return
    const bi = list.shift()
    used.add(bi)
    out[di] = { ...diskBlocks[bi], exact: true }
  })

  
  
  
  
  
  
  
  
  
  const PREFIX_MIN = 24
  const longEnough = s => s.length >= PREFIX_MIN
  domStripped.forEach((key, di) => {
    if (out[di] !== null || longEnough(key) !== true) return
    for (let bi = 0; bi < diskBlocks.length; bi += 1) {
      if (used.has(bi)) continue
      const diskKey = stripped(diskBlocks[bi].text)
      if (longEnough(diskKey) !== true) continue
      if (diskKey.startsWith(key) === true || key.startsWith(diskKey) === true) {
        used.add(bi)
        out[di] = { ...diskBlocks[bi], exact: false }
        break
      }
    }
  })

  
  
  
  
  
  
  
  
  const domLeft = []
  out.forEach((v, i) => { if (v === null) domLeft.push(i) })
  const diskLeft = diskBlocks
    .map((b, i) => i)
    .filter(i => used.has(i) === false && (diskBlocks[i].kind ?? 'text') !== 'reasoning')
  const n = Math.min(domLeft.length, diskLeft.length)
  for (let k = 1; k <= n; k += 1) {
    const di = domLeft[domLeft.length - k]
    const bi = diskLeft[diskLeft.length - k]
    out[di] = { ...diskBlocks[bi], exact: false }
  }
  return out
}















async function forgeRecord(payload) {
  try {
    const res = await fetch('/api/reply-forge-v3/session/forge', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        
        
        'x-rf3-forge': '1',
      },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (data === null || typeof data !== 'object') return { ok: false, error: 'HTTP ' + res.status }
    return data
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) }
  }
}

 return { normalizeText: normalizeText, domSignatureOf: domSignatureOf, loadRecord: loadRecord, cachedRecord: cachedRecord, resetCache: resetCache, recordNeedsRefresh: recordNeedsRefresh, matchBlocks: matchBlocks, forgeRecord: forgeRecord } })();
var loadRecord = __msrc_reply_forge_client_record_mjs.loadRecord;
var cachedRecord = __msrc_reply_forge_client_record_mjs.cachedRecord;
var resetCache = __msrc_reply_forge_client_record_mjs.resetCache;
var matchBlocks = __msrc_reply_forge_client_record_mjs.matchBlocks;
var normalizeText = __msrc_reply_forge_client_record_mjs.normalizeText;
var forgeRecord = __msrc_reply_forge_client_record_mjs.forgeRecord;
var recordNeedsRefresh = __msrc_reply_forge_client_record_mjs.recordNeedsRefresh;
var domSignatureOf = __msrc_reply_forge_client_record_mjs.domSignatureOf;


























const name = 'dsh-codex-ui/reply-forge'


const inject = ['slots']

const SCAN_DEBOUNCE_MS = 220






const TEARDOWN_GRACE_MS = 1500

const teardownPending = new Map()
const EDIT_ATTR = 'data-rf3-edited'











const RECORD_REFRESH_MIN_GAP_MS = 800


const RECORD_REFRESH_MAX_TRIES = 4








const TURN_REFRESH_MIN_GAP_MS = 700

let lastTurnRefreshAt = 0








const DIAG_MIN_GAP_MS = 3000

let lastDiagAt = 0







let lastThinkingSync = null


const OWN_UI_CLASSES = ['rf3-bar', 'rf3-editor', 'rf3-note', 'rf3-notes']


const taken = new WeakMap()


const dupCount = new WeakMap()


const blockMatch = new WeakMap()


const recordInflight = new Map()










function readRecord(sessionId, options = {}) {
  if (options.force !== true) return loadRecord(sessionId, options)
  const hit = recordInflight.get(sessionId)
  if (hit !== undefined) return hit
  const pending = loadRecord(sessionId, { force: true, domSignature: options.domSignature })
    .finally(() => recordInflight.delete(sessionId))
  recordInflight.set(sessionId, pending)
  return pending
}





let scheduleScanRef = null





let refreshRecordRef = null






let domSignatureNowRef = () => ''


let openEditor = null

function log(...args) {
  try { console.warn('[dsh-reply-forge-v3-fixed]', ...args) } catch {  }
}


function isOwnUi(el) {
  const cls = el.classList
  if (cls === undefined || cls === null) return false
  for (const name of OWN_UI_CLASSES) if (cls.contains(name)) return true
  return false
}









function detectDarkScheme(doc) {
  try {
    const luminance = el => {
      if (el === null || el === undefined) return null
      const raw = getComputedStyle(el).backgroundColor
      const m = /rgba?\(([^)]+)\)/.exec(raw)
      if (m === null) return null
      const parts = m[1].split(',').map(x => parseFloat(x))
      const [r, g, b] = parts
      const alpha = parts.length > 3 ? parts[3] : 1
      
      if (alpha === 0) return null
      return 0.299 * r + 0.587 * g + 0.114 * b
    }
    const lum = luminance(doc.body) ?? luminance(doc.documentElement)
    if (lum !== null) return lum < 128
  } catch {  }
  
  try {
    return doc.defaultView?.matchMedia?.('(prefers-color-scheme: dark)')?.matches === true
  } catch {
    return true
  }
}










function ownText(el) {
  const kids = el.children ?? []
  if (kids.length === 0) return String(el.textContent ?? '').replace(/\s+/g, ' ').trim()
  let out = ''
  for (const child of kids) {
    if (isOwnUi(child)) continue
    if (child.tagName === 'TEXTAREA' || child.tagName === 'BUTTON') continue
    out += ownText(child) + ' '
  }
  return out.replace(/\s+/g, ' ').trim()
}


function makeButton(doc, label, title, onClick, extra = {}) {
  const btn = doc.createElement('button')
  btn.type = 'button'
  btn.className = 'rf3-btn'
  btn.textContent = label
  if (typeof title === 'string' && title !== '') btn.title = title
  for (const [k, v] of Object.entries(extra)) {
    if (v === true) btn.setAttribute(k, '')
    else if (v !== false && v !== null && v !== undefined) btn.setAttribute(k, String(v))
  }
  btn.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    try { onClick() } catch (error) { log('按钮回调失败', error) }
  })
  return btn
}







const FORGE_ICON = '<svg viewBox="-0.6 1 16 16" width="16" height="16" fill="none"'
  + ' stroke="currentColor" stroke-width="1.4" stroke-linecap="round"'
  + ' stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M13.3 8.2a4.8 4.8 0 0 1-4.8 4.8H5.2L2.7 14.6v-2.6A4.8 4.8 0 0 1 8.5 3.4a4.8 4.8 0 0 1 4.8 4.8z"/>'
  + '<path d="M5.9 7.3h4.9M5.9 9.3h3.1"/></svg>'


function makeIconButton(doc, label, onClick, extra = {}) {
  const btn = doc.createElement('button')
  btn.type = 'button'
  btn.className = 'rf3-icon'
  btn.title = label
  btn.setAttribute('aria-label', label)
  btn.innerHTML = FORGE_ICON
  for (const [k, v] of Object.entries(extra)) {
    if (v === true) btn.setAttribute(k, '')
    else if (v !== false && v !== null && v !== undefined) btn.setAttribute(k, String(v))
  }
  btn.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    try { onClick() } catch (error) { log('按钮回调失败', error) }
  })
  return btn
}














function findActionsAnchor(block) {
  try {
    const node = block.closest('[data-slot="conversation.chat.node"]')
    if (node === null) return null

    
    
    
    
    
    
    
    
    const own = node.querySelector('[data-slot="conversation.chat.assistant-actions"]')
    if (own !== null) return own

    const flow = node.closest('[data-slot="conversation.chat.flow"]')
    if (flow === null) return null
    const nodes = [...flow.querySelectorAll('[data-slot="conversation.chat.node"]')]
    const idx = nodes.indexOf(node)
    if (idx < 0) return null
    for (let i = idx + 1; i <= idx + 2 && i < nodes.length; i++) {
      const slot = nodes[i].querySelector('[data-slot="conversation.chat.assistant-actions"]')
      if (slot !== null) return slot
    }
    return null
  } catch {
    return null
  }
}


const COMPOSER_INPUT_SELECTOR = '[data-composer-input]'


let lastFocusHandoff = null


function describeEl(el) {
  if (el === null || el === undefined) return 'null(<body>)'
  const cls = typeof el.className === 'string' && el.className !== ''
    ? '.' + el.className.split(/\s+/).filter(Boolean).join('.')
    : ''
  return String(el.tagName) + cls
}










function composerCandidates(doc) {
  if (doc === null || doc === undefined || typeof doc.querySelectorAll !== 'function') return []
  try {
    return [...doc.querySelectorAll(COMPOSER_INPUT_SELECTOR)]
  } catch {
    return []
  }
}


function composerVisible(el) {
  try {
    if (el.isConnected === false) return false
  } catch {  }
  if (typeof el.getClientRects === 'function') {
    try {
      const rects = el.getClientRects()
      if (rects !== null && rects !== undefined && rects.length === 0) return false
    } catch {  }
  }
  return true
}


function composerInert(el) {
  try { if (el.inert === true) return true } catch {  }
  try {
    if (typeof el.closest === 'function' && el.closest('[inert]') !== null) return true
  } catch {  }
  return false
}







function pickComposerTarget(doc) {
  const all = composerCandidates(doc)
  const editable = all.filter(el => {
    try { return el.isContentEditable === true } catch { return false }
  })
  const pool = editable.length > 0 ? editable : all
  let best = null
  let bestScore = -1
  for (const el of pool) {
    let score = 0
    if (composerInert(el) !== true) score += 2
    if (composerVisible(el) === true) score += 1
    if (score > bestScore) { best = el; bestScore = score }
  }
  return { el: best, total: all.length }
}





function selectionInComposer(doc, el) {
  if (el === null || el === undefined) return false
  try {
    const view = (doc && typeof doc.defaultView === 'object' && doc.defaultView !== null)
      ? doc.defaultView
      : (typeof window === 'object' && window !== null ? window : null)
    if (view === null || typeof view.getSelection !== 'function') return false
    const sel = view.getSelection()
    if (sel === null || sel === undefined) return false
    const node = sel.anchorNode ?? sel.focusNode ?? null
    if (node === null) return false
    return node === el || (typeof el.contains === 'function' && el.contains(node) === true)
  } catch {
    return false
  }
}









function ensureComposerSelection(doc, el) {
  if (el === null || el === undefined) return
  try { if (el.isContentEditable !== true) return } catch { return }
  if (selectionInComposer(doc, el) === true) return
  try {
    const view = (doc && typeof doc.defaultView === 'object' && doc.defaultView !== null)
      ? doc.defaultView
      : (typeof window === 'object' && window !== null ? window : null)
    if (view === null || typeof view.getSelection !== 'function') return
    const sel = view.getSelection()
    if (sel === null || sel === undefined) return
    if (typeof doc.createRange !== 'function') return
    const range = doc.createRange()
    range.selectNodeContents(el)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  } catch {  }
}
















function focusHostComposer(doc) {
  const { el, total } = pickComposerTarget(doc)
  if (el === null || typeof el.focus !== 'function') {
    lastFocusHandoff = { ok: false, editable: false, reason: 'no-input', candidates: total, detail: '页面里没有 ' + COMPOSER_INPUT_SELECTOR }
    return lastFocusHandoff
  }
  let called = false
  try { el.focus({ preventScroll: true }); called = true } catch {
    try { el.focus(); called = true } catch { called = false }
  }
  const landed = (doc.activeElement ?? null) === el
  let editable = false
  try { editable = el.isContentEditable === true } catch {  }
  if (landed === true) ensureComposerSelection(doc, el)
  lastFocusHandoff = {
    ok: landed,
    editable,
    candidates: total,
    reason: landed ? 'ok' : (editable ? (called ? 'focus-noop' : 'focus-threw') : 'not-editable'),
    detail: describeEl(el) + (total > 1 ? '（共 ' + total + ' 个输入框候选，取的是可见/可编辑的那个）' : ''),
  }
  return lastFocusHandoff
}








function keepComposerFocus(doc) {
  try {
    let ticks = 0
    const stop = () => {
      try { doc.removeEventListener('keydown', onUser, true) } catch {  }
      try { doc.removeEventListener('pointerdown', onUser, true) } catch {  }
    }
    const onUser = () => stop()
    doc.addEventListener('keydown', onUser, true)
    doc.addEventListener('pointerdown', onUser, true)
    const tick = () => {
      ticks += 1
      if (ticks > 6) { stop(); return }
      const active = doc.activeElement ?? null
      if (active !== null && active !== doc.body) { stop(); return }
      const el = typeof doc.querySelector === 'function' ? doc.querySelector(COMPOSER_INPUT_SELECTOR) : null
      if (el === null) { stop(); return }
      try { el.focus({ preventScroll: true }) } catch {  }
      window.setTimeout(tick, 120)
    }
    window.setTimeout(tick, 120)
  } catch {  }
}


let typingGuardHandler = null
let typingGuardExtras = null
let typingGuardTimer = null

function disarmTypingGuard() {
  try {
    if (typeof window !== 'undefined' && window !== null) {
      if (typingGuardHandler !== null) {
        try { window.removeEventListener('keydown', typingGuardHandler, true) } catch {  }
      }
      if (typingGuardExtras !== null) {
        try { window.removeEventListener('focusin', typingGuardExtras.onFocusIn, true) } catch {  }
        try { window.removeEventListener('pointerdown', typingGuardExtras.onPointer, true) } catch {  }
      }
      if (typingGuardTimer !== null) {
        try { window.clearTimeout(typingGuardTimer) } catch {  }
      }
    }
  } catch {  }
  typingGuardHandler = null
  typingGuardExtras = null
  typingGuardTimer = null
}


function isEditableTarget(target) {
  if (target === null || target === undefined) return false
  try {
    const tag = String(target.tagName ?? '').toUpperCase()
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    if (target.isContentEditable === true) return true
    if (typeof target.closest === 'function') {
      if (target.closest('.rf3-editor') !== null) return true
      if (target.closest('[data-composer-input]') !== null) return true
    }
  } catch {  }
  return false
}














function armTypingGuard(doc) {
  disarmTypingGuard()
  try {
    if (typeof window === 'undefined' || window === null || typeof window.addEventListener !== 'function') return
    const pull = event => {
      if (event === null || event === undefined) return
      
      if (event.altKey === true || event.ctrlKey === true || event.metaKey === true) return
      const target = event.target ?? null
      if (isEditableTarget(target) === true) { disarmTypingGuard(); return }
      const { el } = pickComposerTarget(doc)
      if (el === null || typeof el.focus !== 'function') return
      try { el.focus({ preventScroll: true }) } catch { try { el.focus() } catch {  } }
      ensureComposerSelection(doc, el)
    }
    
    const onFocusIn = event => {
      const t = (event && event.target) ?? null
      if (t === null || t === undefined) return
      if (isEditableTarget(t) === true) {
        try { if (t.getAttribute && t.getAttribute('data-composer-input') === null) disarmTypingGuard() } catch {  }
      } else {
        disarmTypingGuard()
      }
    }
    const onPointer = () => disarmTypingGuard()
    typingGuardHandler = pull
    window.addEventListener('keydown', pull, true)
    window.addEventListener('focusin', onFocusIn, true)
    window.addEventListener('pointerdown', onPointer, true)
    typingGuardExtras = { onFocusIn, onPointer }
    typingGuardTimer = window.setTimeout(disarmTypingGuard, 60000)
  } catch {  }
}


function unhideBlockBar(block) {
  try {
    for (const child of (block.children ?? [])) {
      if (child.classList !== undefined && child.classList.contains('rf3-bar')) {
        child.style.display = ''
      }
    }
  } catch {  }
}












function closeEditor(options = {}) {
  if (openEditor === null) return
  const { wrap, overlay } = openEditor
  const doc = openEditor.doc ?? wrap.ownerDocument ?? document
  const block = openEditor.block
  const active = doc.activeElement ?? null
  const hadFocus = active !== null && wrap.contains(active)
  openEditor = null
  if (hadFocus === true) {
    try { active.blur() } catch {  }
  }
  
  try { (overlay ?? wrap).remove() } catch {  }
  if (block !== undefined && block !== null) unhideBlockBar(block)
  if (hadFocus === true && options.refocus !== false) {
    const handoff = focusHostComposer(doc)
    
    
    if (handoff.ok === true || handoff.editable === true) {
      keepComposerFocus(doc)
      armTypingGuard(doc)
    }
  }
}












function closeEditorOnBlock(doc, block, options = {}) {
  if (openEditor === null || openEditor.block !== block) return
  const { wrap, overlay } = openEditor
  const active = doc.activeElement ?? null
  const inside = active !== null && wrap.contains(active)
  
  
  
  
  
  
  
  
  const lostToBody = active === null || active === doc.body
  const hadFocus = inside === true
    || (lostToBody === true && options.hadFocusAtClick === true)
  openEditor = null
  if (inside === true) {
    try { active.blur() } catch {  }
  }
  
  try { (overlay ?? wrap).remove() } catch {  }
  unhideBlockBar(block)
  if (hadFocus === true && options.refocus !== false) {
    const handoff = focusHostComposer(doc)
    if (handoff.ok === true || handoff.editable === true) {
      keepComposerFocus(doc)
      armTypingGuard(doc)
    }
  } else if (options.refocus !== false) {
    
    recordFocusSkip(doc)
  }
}





function stripInjectedUI() {
  closeEditor()
  for (const el of [...document.querySelectorAll('[' + TAKEN_ATTR + ']')]) {
    el.removeAttribute(TAKEN_ATTR)
    el.removeAttribute(EDIT_ATTR)
    if (el.classList !== undefined && el.classList.contains('rf3-host')) el.classList.remove('rf3-host')
    for (const own of [...el.querySelectorAll('.rf3-bar, .rf3-editor, .rf3-note')]) own.remove()
  }
}


const originals = new Map()

function rememberOriginal(fp, text) {
  if (typeof fp !== 'string') return
  if (!originals.has(fp)) originals.set(fp, text)
}

function fpOriginal(block, fp) {
  return originals.get(fp) ?? ownText(block)
}


function makeNote(doc, kind, text) {
  const el = doc.createElement('div')
  el.className = 'rf3-note rf3-note-' + kind
  el.textContent = text
  return el
}






function focusNoteSuffix() {
  const h = lastFocusHandoff
  if (h === null) return ''
  if (h.ok === true) {
    
    
    if (typeof h.candidates === 'number' && h.candidates > 1) {
      return ' · 焦点已交还输入框（页面有 ' + h.candidates + ' 个输入框候选，已择优）'
    }
    return ' · 焦点已交还输入框'
  }
  if (h.reason === 'focus-not-in-editor') return ' · ⚠ 焦点未交还：关闭编辑器时焦点已不在编辑器里'
  if (h.reason === 'no-input') return ' · ⚠ 焦点未交还：页面上没有输入框'
  if (h.reason === 'not-editable') return ' · ⚠ 焦点未交还：输入框暂不可编辑'
  return ' · ⚠ 焦点未交还：' + h.reason
}







function recordFocusSkip(doc) {
  const el = typeof doc.querySelector === 'function' ? doc.querySelector(COMPOSER_INPUT_SELECTOR) : null
  lastFocusHandoff = {
    ok: false,
    editable: el === null ? false : el.isContentEditable === true,
    reason: 'focus-not-in-editor',
    detail: '关闭编辑器时焦点已不在编辑器里',
  }
}











function makeFocusProbe(doc) {
  const probe = () => {
    const { el: c, total } = pickComposerTarget(doc)
    const a = doc.activeElement ?? null
    const h = lastFocusHandoff
    const composerEditable = c === null
      ? null
      : (() => { try { return c.isContentEditable === true } catch { return null } })()
    const visible = c === null ? null : composerVisible(c)
    const selIn = selectionInComposer(doc, c)
    const guardArmed = typingGuardHandler !== null
    const out = {
      lastOk: h === null ? null : h.ok,
      lastReason: h === null ? null : h.reason,
      lastEditable: h === null ? null : h.editable,
      lastCandidates: h === null ? null : h.candidates,
      composerEditable,
      composerVisible: visible,
      composerTotal: total,
      active: describeEl(a),
      activeIsComposer: a === c,
      selectionInComposer: selIn,
      guardArmed,
    }
    out.summary = 'last.ok=' + out.lastOk + ' reason=' + out.lastReason
      + ' | composer.editable=' + out.composerEditable + ' visible=' + out.composerVisible
      + ' total=' + out.composerTotal
      + ' | active=' + out.active + ' selIn=' + out.selectionInComposer
      + ' | guard=' + (out.guardArmed ? 'armed' : 'off')
    
    out.last = h
    out.composer = c === null ? null : {
      editable: composerEditable,
      attr: typeof c.getAttribute === 'function' ? c.getAttribute('contenteditable') : null,
      visible,
    }
    return out
  }
  probe.trace = (ms = 8000) => new Promise(resolve => {
    const samples = []
    const events = []
    const TRACED = ['keydown', 'keypress', 'beforeinput', 'input', 'compositionstart', 'compositionend', 'paste', 'focusin', 'focusout', 'blur']
    const listeners = []
    const record = type => event => {
      
      const t = (event && event.target) !== undefined ? event.target : null
      let desc = 'null'
      if (t !== null && t !== undefined) {
        const cls = typeof t.className === 'string' && t.className !== ''
          ? '.' + t.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.')
          : ''
        desc = String(t.tagName ?? '?') + cls
      }
      const rec = { t: Date.now(), type, target: desc }
      if (typeof event.key === 'string') rec.key = event.key
      if (typeof event.data === 'string') rec.data = event.data.slice(0, 24)
      if (typeof event.defaultPrevented === 'boolean') rec.prevented = event.defaultPrevented
      events.push(rec)
    }
    for (const type of TRACED) {
      const fn = record(type)
      listeners.push([type, fn])
      try { window.addEventListener(type, fn, true) } catch {  }
    }
    const started = Date.now()
    const cleanup = () => {
      for (const [type, fn] of listeners) {
        try { window.removeEventListener(type, fn, true) } catch {  }
      }
    }
    const tick = () => {
      const s = probe()
      samples.push({
        t: Date.now() - started,
        active: s.active,
        activeIsComposer: s.activeIsComposer,
        editable: s.composerEditable,
        selIn: s.selectionInComposer,
        guard: s.guardArmed,
      })
      if (Date.now() - started >= ms) {
        cleanup()
        resolve({ samples, events })
        return
      }
      try { window.setTimeout(tick, 200) } catch { cleanup(); resolve({ samples, events }) }
    }
    tick()
  })
  return probe
}









function applyOverride(block, text, prefs, docOverride) {
  block.textContent = ''
  renderMarkdown(block, text, docOverride ?? block.ownerDocument)
  if (prefs.autoMark === true) block.setAttribute(EDIT_ATTR, '')
  else block.removeAttribute(EDIT_ATTR)
}

















function applyThinkingText(block, expectText, nextText) {
  const flat = normalizeText(expectText ?? '')
  const report = reason => {
    lastThinkingSync = {
      at: new Date().toISOString(),
      ok: reason === 'ok',
      reason,
      head: flat.slice(0, 18),
      len: flat.length,
    }
    return reason === 'ok'
  }
  if (flat.length === 0) return report('empty-expect')

  const node = block.closest('[data-slot="conversation.chat.node"]')
  if (node === null) return report('no-chat-node')
  
  
  
  
  const flow = node.closest('[data-slot="conversation.chat.flow"]') ?? node.parentElement ?? node

  
  const heads = [flat.slice(0, 24), flat.slice(0, 12), flat.slice(0, 8)]
  let considered = 0
  for (const head of heads) {
    if (head.length < 6) continue
    let best = null
    for (const el of flow.querySelectorAll('div, p, span')) {
      if (el === block || block.contains(el) === true || el.contains(block) === true) continue
      considered += 1
      const text = normalizeText(el.textContent ?? '')
      if (text.includes(head) === false) continue
      
      if ([...el.children].some(child => normalizeText(child.textContent ?? '').includes(head))) continue
      
      if (text.length > flat.length * 1.5 + 40) continue
      best = el
      break
    }
    if (best !== null) {
      best.textContent = nextText
      return report('ok')
    }
  }
  
  return report(considered === 0 ? 'flow-empty' : 'text-not-in-dom')
}













function reapplyThinkingOverrides(doc, sessionId) {
  let list = []
  try { list = loadThinkingOverrides(sessionId) } catch { list = [] }
  if (list.length === 0) return 0
  const flow = doc.querySelector('[data-slot="conversation.chat.flow"]')
  if (flow === null) return 0
  let applied = 0
  for (const item of list) {
    const flat = normalizeText(item.from)
    const next = String(item.to ?? '')
    if (flat.length < 6 || next === '') continue
    const head = flat.slice(0, 12)
    for (const el of flow.querySelectorAll('div, p, span')) {
      if (el.textContent === next) continue            
      const text = normalizeText(el.textContent ?? '')
      if (text.includes(head) === false) continue       
      if ([...el.children].some(child => normalizeText(child.textContent ?? '').includes(head))) continue
      if (text.length > flat.length * 1.5 + 40) continue 
      el.textContent = next
      applied += 1
      break
    }
  }
  return applied
}









function attachBar(block, doc, getSessionId, prefs, match) {
  
  
  const anchor = findActionsAnchor(block)

  let bar = block.querySelector('.rf3-bar')
  if (bar === null && anchor !== null) {
    const sibling = anchor.nextElementSibling
    if (sibling !== null && sibling.classList.contains('rf3-bar')) bar = sibling
  }
  if (bar !== null && bar.__rf3Block !== block) return bar
  if (bar === null) {
    bar = doc.createElement('div')
    bar.className = 'rf3-bar'
  }
  bar.__rf3Block = block
  if (anchor !== null) {
    if (anchor.nextElementSibling !== bar) anchor.insertAdjacentElement('afterend', bar)
    bar.classList.add('rf3-inline')
  } else {
    if (bar.parentElement !== block) block.append(bar)
    bar.classList.remove('rf3-inline')
  }
  bar.textContent = ''
  
  
  bar.style.display = ''

  const sessionId = getSessionId()
  const fp = taken.get(block)
  const forgeBtn = makeIconButton(doc, '伪造回复（就地编辑这条 AI 回复）', () => openBlockEditor(block, getSessionId, prefs, doc))
  if (match !== null && match !== undefined) forgeBtn.setAttribute('data-rf3-linked', '')
  bar.append(forgeBtn)
  const override = fp === undefined ? undefined : loadOverrides(sessionId)[fp]
  if (override !== undefined && typeof override.text === 'string') {
    bar.append(makeButton(doc, '还原', '删除本条本机覆盖', () => {
      removeOverride(sessionId, fp)
      block.removeAttribute(EDIT_ATTR)
      
      
      closeEditorOnBlock(doc, block)
      applyOverride(block, fpOriginal(block, fp), prefs, doc)
      attachBar(block, doc, getSessionId, prefs, match)
    }, { 'data-active': true }))
  }
  return bar
}






function openBlockEditor(block, getSessionId, prefs, docOverride) {
  closeEditor({ refocus: false })
  
  
  disarmTypingGuard()
  
  let confirmedForge = null
  
  
  
  let hadFocusAtClick = false
  const sessionId = getSessionId()
  const doc = docOverride ?? block.ownerDocument ?? document
  
  let match = blockMatch.get(block) ?? null
  
  
  let pickedForeign = false

  
  const blockFp = taken.get(block)
  const applied = blockFp === undefined ? undefined : loadOverrides(sessionId)[blockFp]
  const original = (applied !== undefined && typeof applied.text === 'string')
    ? applied.text
    : ownText(block)

  const wrap = doc.createElement('div')
  wrap.className = 'rf3-editor'
  
  
  
  wrap.style.cssText = [
    'margin:auto!important',
    'display:flex!important',
    'flex-direction:column!important',
    'gap:8px!important',
    'width:min(720px,100%)!important',
    'max-width:720px!important',
    'max-height:calc(100vh - 48px)!important',
    'overflow-y:auto!important',
    'overflow-x:hidden!important',
    'box-sizing:border-box!important',
    'padding:14px!important',
    'border-radius:12px!important',
    'background:#1b1b1b!important',
    
    
    'color:rgba(228,228,228,.78)!important',
    'box-shadow:0 12px 40px rgba(0,0,0,.35)!important',
  ].join(';')
  
  wrap.style.colorScheme = detectDarkScheme(doc) === true ? 'dark' : 'light'

  const label = doc.createElement('div')
  label.className = 'rf3-hint'
  label.textContent = '编辑 AI 回复'

  const area = doc.createElement('textarea')
  area.value = original
  area.spellcheck = false
  area.setAttribute('aria-label', '编辑 AI 回复')
  
  area.style.cssText = [
    'width:100%!important',
    'min-height:160px!important',
    'max-height:45vh!important',
    'box-sizing:border-box!important',
    'padding:8px 10px!important',
    'border-radius:8px!important',
    'resize:vertical!important',
    'font:inherit!important',
    'font-size:13px!important',
    'line-height:1.6!important',
    
    'color:rgba(236,236,236,.92)!important',
  ].join(';')
  
  
  
  
  const reassertAreaFocus = () => {
    try {
      const active = doc.activeElement ?? null
      if (active !== area && area.isConnected !== false) {
        if (typeof area.focus === 'function') area.focus()
      }
    } catch {  }
  }
  area.addEventListener('mouseup', reassertAreaFocus)
  area.addEventListener('click', reassertAreaFocus)

  const row = doc.createElement('div')
  row.className = 'rf3-row'

  const status = doc.createElement('span')
  status.className = 'rf3-hint'
  status.textContent = 'Ctrl+Enter 保存 · Esc 取消'

  const spacer = doc.createElement('span')
  spacer.className = 'rf3-spacer'

  
  
  
  const notes = doc.createElement('div')
  notes.className = 'rf3-notes'

  const head = [label, notes]

  
  
  const dup = dupCount.get(block) ?? 1
  if (dup > 1) {
    notes.append(makeNote(doc, 'warn',
      '⚠ 本会话有 ' + dup + ' 条正文完全相同的消息。本机渲染覆盖由它们共享；'
      + '写入伪造只作用于当前这一条。'))
  }

  
  
  
  
  
  
  const matchNote = doc.createElement('div')
  let relocating = false

  
  
  
  
  let prefer = 'auto'

  
  const modeHint = (rec, mode) => {
    const isLive = rec !== null && rec.mode === 'live'
    if (mode === 'live') {
      return '⚡ 仅在线：写进活会话，下一轮对话立即生效（不用重启）。'
        + (isLive ? '' : ' ⚠ 这个会话当前不在内存里，这么选会写入失败。')
    }
    if (mode === 'disk') {
      return '💾 仅落盘：写入会话记录文件（自动备份），该会话下次载入时生效。'
        + (isLive ? ' ⚠ 这个会话在内存里，要等它被重新载入才对模型生效。' : '')
    }
    return isLive
      ? '⚡ 自动：这个会话在内存里 → 写活会话，下一轮对话立即生效（不用重启）。'
      : '💾 自动：这个会话不在内存里 → 落盘写入会话记录文件，该会话下次载入时生效。'
  }

  const renderMatch = () => {
    matchNote.textContent = ''
    if (match === null) {
      const rec = cachedRecord(sessionId)
      if (relocating === true) {
        matchNote.append(makeNote(doc, 'info', '⏳ 会话记录可能不是最新的，正在重新读取…'))
      } else if (isPlaceholderSession(sessionId)) {
        matchNote.append(makeNote(doc, 'warn',
          '⚠ 还没识别出当前会话（会话容器尚未就绪）。稍等片刻，或点「重新读取」。'))
      } else if (rec === null) {
        matchNote.append(makeNote(doc, 'warn', '⚠ 正在读取会话记录…稍后重开本编辑器。'))
      } else if (rec.error !== null) {
        matchNote.append(makeNote(doc, 'warn',
          '⚠ 读取会话记录失败：' + rec.error + '（点「重新读取」重试）'))
      } else if (rec.blocks.length === 0) {
        
        
        
        
        matchNote.append(makeNote(doc, 'warn', rec.mode === 'live'
          ? '⏳ 宿主还没把这条回复登记进会话（新会话或还在输出中）。稍等一两秒，或点「重新读取」。'
          : '⚠ 会话记录里没有可定位的助手正文（这个会话可能还没落盘过）。'))
      } else {
        matchNote.append(makeNote(doc, 'warn',
          '⚠ 未在会话记录中定位到这条回复（记录里有 ' + rec.blocks.length + ' 条正文，'
          + '可能是含公式/表格/代码等渲染差异导致对不上）。'))
      }
    } else if (match.exact !== true) {
      matchNote.append(makeNote(doc, 'warn',
        '⚠ 与记录中的位置是按顺序推断的（seq=' + match.seq + '），未做内容比对。'
        + '写入前请确认正文无误。'))
    } else {
      matchNote.append(makeNote(doc, 'ok', '✓ 已定位到会话记录 seq=' + match.seq + '（块 ' + match.blockIndex + '）'))
    }
    
    
    const modeRec = cachedRecord(sessionId)
    if (modeRec !== null && modeRec.error === null && match !== null) {
      matchNote.append(makeNote(doc, 'info', modeHint(modeRec, prefer)))
    }
    saveRecord.disabled = match === null
    renderTargets()
  }

  notes.append(matchNote)

  const cancel = makeButton(doc, '取消', '放弃改动', () => closeEditor())

  const refresh = makeButton(doc, '重新读取', '重新读取会话记录并重新定位', () => {
    closeEditor()
    readRecord(sessionId, { force: true, domSignature: domSignatureNowRef() })
      .then(() => { if (scheduleScanRef !== null) scheduleScanRef() })
      .catch(error => log('重新读取失败', error))
  })

  const reset = makeButton(doc, '还原原文', '删除本条本机覆盖', () => {
    const fp = taken.get(block)
    if (typeof fp === 'string') {
      removeOverride(sessionId, fp)
      block.removeAttribute(EDIT_ATTR)
      closeEditorOnBlock(doc, block)
      applyOverride(block, fpOriginal(block, fp), prefs, doc)
      attachBar(block, doc, getSessionId, prefs, match)
    } else {
      closeEditor()
    }
  }, { 'data-danger': true })

  const saveLocal = makeButton(doc, '仅本机渲染', '只改本页显示，模型看不见（Ctrl+Enter）', () => {
    const next = area.value
    const fp = taken.get(block) ?? fingerprint(original)
    setOverride(sessionId, fp, next)
    
    
    
    closeEditorOnBlock(doc, block)
    applyOverride(block, next, prefs, doc)
    attachBar(block, doc, getSessionId, prefs, match)
    block.append(makeNote(doc, 'ok', '本机渲染已保存' + focusNoteSuffix()))
  })

  const saveRecord = makeButton(doc, '写入伪造', '让模型采信改后的内容（在线立即生效，落盘则需会话重新载入）', () => {
    const next = area.value
    
    
    
    
    hadFocusAtClick = wrap.contains(doc.activeElement)
    if (normalizeText(next) === normalizeText(original)) {
      status.textContent = '内容没有变化。'
      return
    }
    
    
    
    
    const fpNow = (match === null ? 'null' : match.seq + ':' + match.blockIndex)
      + '|' + prefer + '|' + normalizeText(next)
    if (confirmedForge !== fpNow) {
      confirmedForge = fpNow
      notes.append(makeNote(doc, 'warn', confirmWriteNote(next, match, prefer)))
      status.textContent = '请阅读上方确认信息，再次点击「写入伪造」执行写入'
      return
    }
    confirmedForge = null
    runForge()
  }, { 'data-rf3-primary': true })

  









  let forgeAttempt = 0
  const runForge = () => {
    if (match === null) {
      status.textContent = '定位不到这条回复，无法写入。'
      return
    }
    forgeAttempt += 1
    status.textContent = forgeAttempt > 1 ? '正在重试（第 ' + forgeAttempt + ' 次）…' : '正在写入…'
    saveRecord.disabled = true
    saveLocal.disabled = true
    forgeRecord({
      sessionId,
      seq: match.seq,
      blockIndex: match.blockIndex,
      
      kind: match.kind ?? 'text',
      newText: area.value,
      expectText: match.text,
      
      
      prefer,
    }).then(res => {
      saveRecord.disabled = false
      saveLocal.disabled = pickedForeign
      if (res.ok !== true) {
        status.textContent = ''
        if (res.code === 'STALE_TARGET' && forgeAttempt === 1) {
          
          notes.append(makeNote(doc, 'info',
            '⟳ 写入时发现记录已变化（' + staleDetail(res) + '），自动重新读取后重试…'))
          relocateThenRetry()
          return
        }
        notes.append(makeNote(doc, 'warn', '✖ ' + (res.error || '写入失败')
          + (res.code === 'STALE_TARGET'
            ? '（' + staleDetail(res) + '。点「重新读取」后重试）'
            : '')))
        return
      }
      
      
      
      if (pickedForeign !== true) {
        const fp = taken.get(block) ?? fingerprint(original)
        setOverride(sessionId, fp, area.value)
        
        
        
        closeEditorOnBlock(doc, block, { hadFocusAtClick })
        if (match !== null && match.kind === 'reasoning') {
          
          
          
          applyThinkingText(block, match.text, area.value)
        } else {
          applyOverride(block, area.value, prefs, doc)
        }
        attachBar(block, doc, getSessionId, prefs, match)
      } else {
        
        
        
        
        
        const own = blockMatch.get(block) ?? null
        const sameSeq = own !== null && match !== null && own.seq === match.seq
        const isReasoning = match !== null && match.kind === 'reasoning'
        if (isReasoning === true && sameSeq === true) {
          
          
          setThinkingOverride(sessionId, {
            seq: match.seq,
            bi: match.blockIndex,
            from: match.text,
            to: area.value,
          })
        }
        const synced = (isReasoning === true && sameSeq === true)
          ? applyThinkingText(block, match.text, area.value)
          : false
        closeEditorOnBlock(doc, block, { hadFocusAtClick })
        if (isReasoning === true && sameSeq === true) {
          const why = lastThinkingSync === null ? '' : String(lastThinkingSync.reason ?? '')
          const detail = why === 'text-not-in-dom'
            ? '页面上没找到这段思考的文字（多半是思考区还没展开），展开后再改一次就会同步'
            : why === 'flow-empty'
              ? '页面上找不到对话流容器，只能重启后才显示'
              : '切到别的会话再切回来（或重启 DSH）就会显示新内容'
          block.append(makeNote(doc, 'ok', synced === true
            ? '思考块已写入记录，界面已同步。'
            : '思考块已写入记录 · ' + detail + '。'))
        }
      }
      
      
      
      
      
      if (match !== null && match.kind === 'reasoning') {
        setThinkingOverride(sessionId, {
          seq: match.seq,
          bi: match.blockIndex,
          from: match.text,
          to: area.value,
        })
      }
      
      resetCache(sessionId)
      readRecord(sessionId, { force: true, domSignature: domSignatureNowRef() })
        .then(() => { if (scheduleScanRef !== null) scheduleScanRef() })
        .catch(() => {})
      block.append(makeNote(doc, 'ok', doneNote(res) + focusNoteSuffix()))
    }).catch(error => {
      saveRecord.disabled = false
      saveLocal.disabled = pickedForeign
      status.textContent = '写入异常：' + String((error && error.message) || error)
    })
  }

  
  const staleDetail = res => {
    const actual = typeof res.actual === 'string' ? res.actual : null
    const expected = typeof res.expected === 'string' ? res.expected : null
    if (actual === null && expected === null) return '内容已被改动'
    const cut = t => String(t).replace(/\s+/g, ' ').slice(0, 40)
    return '记录里是「' + cut(actual ?? '') + '」，界面预期「' + cut(expected ?? '') + '」'
  }

  
  const relocatingRetry = { value: false }
  const relocateThenRetry = () => {
    if (relocatingRetry.value === true) return
    relocatingRetry.value = true
    status.textContent = '正在重新读取会话记录…'
    readRecord(sessionId, { force: true, domSignature: domSignatureNowRef() })
      .then(() => {
        const rec = cachedRecord(sessionId)
        if (rec === null || rec.error !== null || Array.isArray(rec.blocks) === false) {
          notes.append(makeNote(doc, 'warn', '✖ 自动重试失败：会话记录读取不到。点「重新读取」后再试。'))
          status.textContent = ''
          return
        }
        
        const live = pickAssistantBlocks(conversationRoot(doc), classifyNaturalLanguage, { includeTaken: true })
        const idx = live.indexOf(block)
        const fresh = idx === -1
          ? null
          : (matchBlocks(rec.blocks, live.map(ownText))[idx] ?? null)
        if (fresh === null) {
          notes.append(makeNote(doc, 'warn',
            '✖ 自动重试失败：重新读取后这条回复仍对不上记录。点「重新读取」打开新编辑器再试。'))
          status.textContent = ''
          return
        }
        match = fresh
        blockMatch.set(block, fresh)
        renderMatch()
        runForge()
      })
      .catch(error => {
        notes.append(makeNote(doc, 'warn', '✖ 自动重试失败：' + String((error && error.message) || error)))
        status.textContent = ''
      })
  }

  
  
  
  
  
  
  let currentValue = match === null ? '' : match.seq + ':' + match.blockIndex

  const targetRow = doc.createElement('div')
  targetRow.className = 'rf3-targets'
  
  targetRow.style.cssText = 'display:flex!important;flex-wrap:wrap!important;gap:6px!important;align-items:center!important'
  const targetSel = doc.createElement('select')
  targetSel.className = 'rf3-select'
  targetSel.setAttribute('aria-label', '选择要改的块')
  
  targetSel.style.cssText = 'flex:1 1 auto!important;min-width:0!important;max-width:100%!important'
  
  targetSel.style.colorScheme = 'dark'

  const renderTargets = () => {
    targetSel.textContent = ''
    const rec = cachedRecord(sessionId)
    const blocks = (rec !== null && rec.error === null && Array.isArray(rec.blocks)) ? rec.blocks : []
    const blank = doc.createElement('option')
    blank.value = ''
    blank.textContent = blocks.length === 0
      ? '（这个会话还没有可编辑块）'
      : ('跟随页面上的这条' + (match === null ? '（当前未定位到）' : ''))
    targetSel.append(blank)
    for (const b of blocks) {
      const value = b.seq + ':' + b.blockIndex
      const opt = doc.createElement('option')
      opt.value = value
      const preview = normalizeText(b.text).slice(0, 46)
      opt.textContent = (b.kind === 'reasoning' ? '【思维链】' : '【正文】')
        + ' seq=' + b.seq + ' 块' + b.blockIndex + ' · ' + preview + (b.text.length > 46 ? '…' : '')
      if (value === currentValue) opt.selected = true
      targetSel.append(opt)
    }
    targetSel.disabled = blocks.length === 0
  }

  targetSel.addEventListener('change', () => {
    
    confirmedForge = null
    const value = String(targetSel.value ?? '')
    if (value === '') {
      
      pickedForeign = false
      match = blockMatch.get(block) ?? null
      const fp = taken.get(block)
      const appliedLocal = fp === undefined ? undefined : loadOverrides(sessionId)[fp]
      area.value = (appliedLocal !== undefined && typeof appliedLocal.text === 'string')
        ? appliedLocal.text
        : ownText(block)
      saveLocal.disabled = false
    } else {
      const rec = cachedRecord(sessionId)
      const blocks = (rec !== null && rec.error === null && Array.isArray(rec.blocks)) ? rec.blocks : []
      const found = blocks.find(b => (b.seq + ':' + b.blockIndex) === value)
      if (found === undefined) return
      
      
      match = { seq: found.seq, blockIndex: found.blockIndex, kind: found.kind ?? 'text', text: found.text, exact: true }
      pickedForeign = true
      area.value = found.text
      
      saveLocal.disabled = true
    }
    currentValue = match === null ? '' : match.seq + ':' + match.blockIndex
    renderMatch()
  })

  targetRow.append(targetSel)

  
  
  
  const MODES = [
    ['auto', '自动（推荐）'],
    ['live', '仅在线（立即生效）'],
    ['disk', '仅落盘（重载后生效）'],
  ]
  const modeSel = doc.createElement('select')
  modeSel.className = 'rf3-mode'
  modeSel.setAttribute('aria-label', '写入方式')
  modeSel.style.colorScheme = 'dark'
  for (const [value, label] of MODES) {
    const opt = doc.createElement('option')
    opt.value = value
    opt.textContent = label
    if (value === prefer) opt.selected = true
    modeSel.append(opt)
  }
  modeSel.value = prefer
  modeSel.addEventListener('change', () => {
    
    confirmedForge = null
    const picked = String(modeSel.value ?? '')
    prefer = picked === 'live' || picked === 'disk' ? picked : 'auto'
    renderMatch()
  })
  targetRow.append(modeSel)

  row.append(status, spacer, refresh, reset, cancel, saveLocal, saveRecord)
  renderMatch()
  wrap.append(...head, targetRow, area, row)

  
  
  
  const overlay = doc.createElement('div')
  overlay.className = 'rf3-overlay'
  
  
  overlay.style.cssText = [
    'position:fixed!important',
    'top:0!important',
    'left:0!important',
    'width:100vw!important',
    'height:100vh!important',
    'z-index:99999!important',
    'display:flex!important',
    'overflow:auto!important',
    'box-sizing:border-box!important',
    'padding:24px!important',
    'background:rgba(0,0,0,.45)!important',
  ].join(';')
  overlay.append(wrap)
  
  overlay.addEventListener('mousedown', event => {
    if (event.target === overlay) closeEditor()
  })
  ;(doc.body ?? doc.documentElement).append(overlay)
  try { area.focus() } catch {  }

  
  
  
  
  
  if (match === null) {
    try {
      const live = pickAssistantBlocks(conversationRoot(doc), classifyNaturalLanguage, { includeTaken: true })
      const idx = live.indexOf(block)
      if (idx !== -1) {
        const liveTexts = live.map(ownText)
        const rec = cachedRecord(sessionId)
        
        
        
        
        
        const stale = rec !== null && rec.error === null
          && ((rec.blocks.length > 0 && liveTexts.length > rec.blocks.length)
            || (rec.mode === 'live' && rec.blocks.length === 0))
        if (stale === true) {
          relocating = true
          renderMatch()
          readRecord(sessionId, { force: true, domSignature: domSignatureNowRef() })
            .then(() => {
              const fresh = cachedRecord(sessionId)
              if (fresh === null || fresh.error !== null || fresh.blocks.length === 0) return
              const next = matchBlocks(fresh.blocks, liveTexts)[idx] ?? null
              if (next !== null) {
                match = next
                blockMatch.set(block, next)
              }
            })
            .catch(error => log('重新读取失败', error))
            .then(() => {
              relocating = false
              renderMatch()
              if (scheduleScanRef !== null) scheduleScanRef()
            })
        }
      }
    } catch (error) {
      log('补定位失败', error)
    }
  }

  area.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); closeEditor(); return }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      event.stopPropagation()
      
      
      saveLocal.click()
    }
  })

  

  openEditor = { wrap, overlay, block, doc }
}









function doneNote(res) {
  if (res.mode === 'live') {
    return '✓ 已写入活会话 · 下一轮对话模型就看到改后的内容（不用重启）'
  }
  
  
  const why = res.liveCode === 'SESSION_NOT_LIVE' ? '（该会话当前不在内存里）'
    : res.liveCode === 'NO_SESSIONS_SERVICE' ? '（拿不到宿主的 sessions 服务）'
      : res.liveCode === 'WRITER_NOT_ROUTED' ? '（这台宿主持久化没有这个会话的写句柄，已自动改为写会话记录）'
        : ''
  return '✓ 已写入会话记录' + why + ' · 该会话下次载入时生效'
    + (typeof res.backup === 'string' ? ' · 备份：' + res.backup : '')
}













function confirmWriteNote(newText, match, prefer = 'auto') {
  const preview = String(newText).replace(/\s+/g, ' ').slice(0, 120)
  const kindLabel = match?.kind === 'reasoning' ? '思维链' : '正文'
  const route = prefer === 'live'
    ? '写入方式：仅在线（写活会话，立即生效、不用重启；会话不在内存里会失败）。'
    : prefer === 'disk'
      ? '写入方式：仅落盘（写会话记录文件，该会话下次载入时生效）。'
      : '写入方式：自动（会话在内存里 → 立即生效、不用重启；不在 → 写会话记录，下次载入时生效）。'
  return '确认写入伪造？目标：' + kindLabel + '（seq=' + match.seq + '，块 ' + match.blockIndex + '）'
    + '｜新内容：' + preview + (newText.length > 120 ? '…' : '')
    + '｜' + route
    + '｜改的是「模型看到的对话」，不可逆（有自动备份可还原）。'
    + '确认无误请再次点击「写入伪造」。'
}


function sameMatch(a, b) {
  if (a === b) return true
  if (a === null || b === null || a === undefined || b === undefined) return false
  return a.seq === b.seq && a.blockIndex === b.blockIndex && a.exact === b.exact
}




function takeBlock(block, getSessionId, overrides, prefs, docOverride, dup = 1, match = null) {
  
  
  const doc = docOverride ?? block.ownerDocument ?? document

  
  
  
  if (block.hasAttribute(TAKEN_ATTR)) {
    
    
    
    const anchor = findActionsAnchor(block)
    const bar = block.querySelector('.rf3-bar') ?? blockBarOf(block)
    const misplaced = bar === null
      || (anchor !== null && bar.previousElementSibling !== anchor)
      || (anchor === null && bar.parentElement !== block)
      || (anchor !== null && bar.previousElementSibling !== anchor)
      || (anchor === null && bar.parentElement !== block)
    if (!misplaced && sameMatch(blockMatch.get(block) ?? null, match ?? null)) return
    blockMatch.set(block, match)
    attachBar(block, doc, getSessionId, prefs, match)
    return
  }

  const original = ownText(block)
  const fp = fingerprint(original)
  rememberOriginal(fp, original)
  taken.set(block, fp)
  dupCount.set(block, dup)
  blockMatch.set(block, match)
  block.setAttribute(TAKEN_ATTR, '')

  
  
  
  block.classList.add('rf3-host')

  attachBar(block, doc, getSessionId, prefs, match)
  const override = overrides[fp]
  if (override !== undefined && typeof override.text === 'string') {
    applyOverride(block, override.text, prefs, doc)
    attachBar(block, doc, getSessionId, prefs, match)
  }
}


function scan(getSessionId, prefs, docOverride) {
  
  if (prefs.enabled === false) return
  const doc = docOverride ?? document
  const root = conversationRoot(doc)
  if (root === null) return
  const sessionId = getSessionId()
  const overrides = loadOverrides(sessionId)
  
  
  
  
  
  
  
  const blocks = pickAssistantBlocks(root, classifyNaturalLanguage, { includeTaken: true })

  
  const texts = blocks.map(ownText)
  const fps = new Map()
  const counts = new Map()
  for (const block of blocks) {
    const fp = fingerprint(ownText(block))
    fps.set(block, fp)
    counts.set(fp, (counts.get(fp) ?? 0) + 1)
  }

  
  
  const rec = cachedRecord(sessionId)
  const matches = (rec !== null && rec.error === null && rec.blocks.length > 0)
    ? matchBlocks(rec.blocks, texts)
    : blocks.map(() => null)

  
  
  
  
  const streaming = doc.querySelector('[data-slot="conversation.chat.flow"] [class*="_running"]') !== null

  blocks.forEach((block, i) => {
    const match = matches[i] ?? null
    const fp = fps.get(block)
    
    
    
    
    
    
    
    
    const nearTail = i >= blocks.length - 3
    
    
    if (overrides[fp] !== undefined) {
      teardownPending.delete(block)
      try {
        takeBlock(block, getSessionId, overrides, prefs, doc, counts.get(fp) ?? 1, match)
      } catch (error) {
        log('接管消息块失败', error)
      }
      return
    }

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    const recUnavailable = rec === null || rec.error !== null || rec.blocks.length === 0
    const openTurnNow = rec !== null && rec.openTurn === true
    let canHang
    if (match !== null) {
      
      
      
      
      
      canHang = match.turnOpen !== true && match.final === true
    } else if (rec === null) {
      canHang = false                       
    } else if (streaming === true && nearTail === true) {
      
      
      canHang = false
    } else if (recUnavailable === true) {
      canHang = true                        
    } else {
      
      
      
      
      
      
      
      
      
      
      canHang = openTurnNow !== true
    }
    if (canHang === true) {
      teardownPending.delete(block)
      try {
        takeBlock(block, getSessionId, overrides, prefs, doc, counts.get(fp) ?? 1, match)
      } catch (error) {
        log('接管消息块失败', error)
      }
      return
    }

    
    
    
    
    
    
    
    if (block.hasAttribute(TAKEN_ATTR)) {
      const since = teardownPending.get(block)
      const now = Date.now()
      if (since === undefined) teardownPending.set(block, now)
      if (now - (since ?? now) < TEARDOWN_GRACE_MS) {
        if (scheduleScanRef !== null) scheduleScanRef()
        return
      }
      teardownPending.delete(block)
      
      
      
      const bar = block.querySelector('.rf3-bar') ?? blockBarOf(block)
      if (bar !== null) bar.remove()
      block.removeAttribute(TAKEN_ATTR)
      block.classList.remove('rf3-host')
    }
  })

  
  
  
  if (rec !== null && rec.openTurn === true) {
    const now = Date.now()
    if (now - lastTurnRefreshAt >= TURN_REFRESH_MIN_GAP_MS) {
      lastTurnRefreshAt = now
      resetCache(sessionId)
    }
  }

  
  
  
  if (refreshRecordRef !== null) {
    try { refreshRecordRef(sessionId, texts) } catch (error) { log('重读会话记录失败', error) }
  }

  
  
  let thinkingReplayed = 0
  try { thinkingReplayed = reapplyThinkingOverrides(doc, sessionId) } catch (error) { log('思考重放失败', error) }

  
  
  try {
    const now = Date.now()
    if (now - lastDiagAt >= DIAG_MIN_GAP_MS) {
      lastDiagAt = now
      const rows = blocks.map((block, i) => {
        const m = matches[i] ?? null
        const raw = ownText(block)
        return {
          i,
          taken: block.hasAttribute(TAKEN_ATTR),
          bar: blockHasBar(block),
          match: m === null ? null : {
            seq: m.seq, exact: m.exact === true,
            turnOpen: m.turnOpen === true, final: m.final === true,
          },
          len: raw.length,
          head: raw.slice(0, 24),
        }
      })
      
      
      
      
      const diagRoot = conversationRoot(doc)
      let cands = []
      try {
        cands = diagRoot === null ? [] : pickAssistantBlocks(diagRoot, null, { includeTaken: true })
      } catch (error) { cands = [] }
      const chainOf = el => {
        const chain = []
        let cur = el
        for (let d = 0; d < 8 && cur !== null && cur !== undefined; d += 1) {
          const cls = typeof cur.className === 'string' ? cur.className.slice(0, 40) : ''
          const slot = typeof cur.getAttribute === 'function' ? (cur.getAttribute('data-slot') ?? '') : ''
          const kind = typeof cur.getAttribute === 'function' ? (cur.getAttribute('data-chat-flow-kind') ?? '') : ''
          chain.push([cur.tagName ?? '?', slot, kind, cls].join('|'))
          if (cur === diagRoot) break
          cur = cur.parentElement ?? null
        }
        return chain
      }
      const candidates = cands.map(el => {
        let verdict = '?'
        try { verdict = classifyNaturalLanguage(el).reason } catch (error) { verdict = 'classify-error' }
        const text = ownText(el)
        return { len: text.length, head: text.slice(0, 26), verdict, chain: chainOf(el) }
      })
      const payload = {
        at: new Date().toISOString(),
        sessionId,
        mode: rec?.mode ?? null,
        openTurn: rec?.openTurn === true,
        recBlocks: rec === null ? null : rec.blocks.length,
        recError: rec?.error ?? null,
        domBlocks: blocks.length,
        rows,
        candidates,
        lastThinkingSync,
        thinkingReplayed,
      }
      fetch('/api/reply-forge-v3/diagnose', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {})
    }
  } catch (error) { log('诊断上报失败', error) }
}





function apply(ctx) {
  
  if (document.querySelector('style[data-dsh-reply-forge-v3-fixed]') !== null) return

  const styleEl = document.createElement('style')
  styleEl.setAttribute('data-dsh-reply-forge-v3-fixed', '')
  styleEl.setAttribute('data-plugin', 'dsh-reply-forge-v3-fixed')
  styleEl.textContent = CSS
  document.head.append(styleEl)

  let prefs = loadPrefs()
  let sessionId = currentSessionId(document)
  
  const getSessionId = () => sessionId

  
  let recordRefreshMisses = 0
  let lastRecordRefreshAt = 0

  
  let timer = null
  const scheduleScan = () => {
    if (timer !== null) return
    timer = window.setTimeout(() => {
      timer = null
      try { runScan() } catch (error) { log('扫描失败', error) }
    }, SCAN_DEBOUNCE_MS)
  }
  
  scheduleScanRef = scheduleScan

  








  let lastDomSignature = ''
  const refreshRecordIfStale = (sid, domTexts) => {
    if (isPlaceholderSession(sid)) return
    const signature = domSignatureOf(domTexts)
    
    if (signature !== lastDomSignature) {
      lastDomSignature = signature
      recordRefreshMisses = 0
    }
    if (recordRefreshMisses >= RECORD_REFRESH_MAX_TRIES) return
    if (Date.now() - lastRecordRefreshAt < RECORD_REFRESH_MIN_GAP_MS) return
    const rec = cachedRecord(sid)
    
    if (rec !== null && rec.openTurn === true) recordRefreshMisses = 0
    if (recordNeedsRefresh(rec, domTexts.length, signature) !== true) return
    const before = rec === null ? -1 : rec.blocks.length
    lastRecordRefreshAt = Date.now()
    
    readRecord(sid, { force: true, domSignature: signature })
      .then(next => {
        
        
        recordRefreshMisses = (next.openTurn === true || next.blocks.length !== before)
          ? 0
          : recordRefreshMisses + 1
        scheduleScan()
      })
      .catch(() => { recordRefreshMisses += 1 })
  }
  
  refreshRecordRef = refreshRecordIfStale

  
  const domSignatureNow = () => {
    const root = conversationRoot(document)
    if (root === null) return ''
    try {
      return domSignatureOf(
        pickAssistantBlocks(root, classifyNaturalLanguage, { includeTaken: true }).map(ownText),
      )
    } catch { return '' }
  }

  
  domSignatureNowRef = domSignatureNow

  
  const syncRecord = () => {
    
    if (isPlaceholderSession(sessionId)) return
    readRecord(sessionId, { domSignature: domSignatureNow() })
      .then(() => scheduleScan())
      .catch(error => log('读取会话记录失败', error))
  }

  








  const runScan = () => {
    const next = currentSessionId(document)
    if (next !== sessionId) {
      
      if (isPlaceholderSession(sessionId) === false) closeEditor()
      sessionId = next
      
      
      recordRefreshMisses = 0
      lastDomSignature = ''
      syncRecord()
    }
    scan(getSessionId, prefs, document)
  }

  window.addEventListener('popstate', scheduleScan)
  window.addEventListener('hashchange', scheduleScan)

  
  
  let observedRoot = null
  let observer = null

  









  let repairingBars = false
  const repairBars = () => {
    if (repairingBars === true) return
    repairingBars = true
    try {
      
      
      
      for (const block of document.querySelectorAll('[' + TAKEN_ATTR + ']')) {
        if (block.isConnected === false) continue
        const bar = block.querySelector('.rf3-bar') ?? blockBarOf(block)
        if (bar !== null && bar.isConnected !== false) continue
        try {
          attachBar(block, document, getSessionId, prefs, blockMatch.get(block) ?? null)
        } catch {
          
        }
      }
    } finally {
      repairingBars = false
    }
  }

  const attachObserver = () => {
    const root = document.querySelector(CONVERSATION_SELECTOR)
    if (root === observedRoot) return
    if (observer !== null) { observer.disconnect(); observer = null }
    observedRoot = root
    if (root === null) return
    observer = new MutationObserver(() => { repairBars(); scheduleScan() })
    observer.observe(root, { childList: true, subtree: true })
    
    
    scheduleScan()
  }

  
  
  
  
  
  
  
  
  
  let tick = 0
  const bootstrap = window.setInterval(() => {
    const before = observedRoot
    attachObserver()
    tick += 1
    if (observedRoot !== null && (observedRoot !== before || tick % 4 === 0)) scheduleScan()
  }, 800)
  attachObserver()
  syncRecord()

  
  const onKey = event => {
    if (event.altKey !== true || event.shiftKey !== true) return
    if (typeof event.key !== 'string' || event.key.toLowerCase() !== 'e') return
    const root = conversationRoot(document)
    
    
    const blocks = pickAssistantBlocks(root, classifyNaturalLanguage, { includeTaken: true })
    const last = blocks[blocks.length - 1]
    if (last === undefined) return
    event.preventDefault()
    openBlockEditor(last, getSessionId, prefs, document)
  }
  window.addEventListener('keydown', onKey)

  ctx.effect(() => () => {
    window.clearInterval(bootstrap)
    if (timer !== null) window.clearTimeout(timer)
    if (observer !== null) observer.disconnect()
    window.removeEventListener('popstate', scheduleScan)
    window.removeEventListener('hashchange', scheduleScan)
    window.removeEventListener('keydown', onKey)
    stripInjectedUI()
    
    
    disarmTypingGuard()
    styleEl.remove()
  }, 'dsh-reply-forge-v3-fixed: teardown')

  
  
  
  try {
    window.__dshReplyForgeV3 = {
      version: '3.1.0',
      sessionId() { return sessionId },
      
      domSessionId() { return currentSessionId(document) },
      clearAll() {
        clearOverrides(sessionId)
        log('已清空当前会话的本机覆盖')
      },
      



      refresh() {
        sessionId = currentSessionId(document)
        resetCache(sessionId)
        if (isPlaceholderSession(sessionId)) {
          return Promise.resolve({ ok: false, sessionId, error: '未识别出当前会话（DOM 里没有 data-conversation-session）' })
        }
        return loadRecord(sessionId, { force: true, domSignature: domSignatureNow() }).then(rec => {
          scheduleScan()
          return { ok: rec.error === null, sessionId, mode: rec.mode, blocks: rec.blocks.length, error: rec.error }
        })
      },
      
      locate() {
        const root = conversationRoot(document)
        
        const blocks = pickAssistantBlocks(root, classifyNaturalLanguage, { includeTaken: true })
        const texts = blocks.map(ownText)
        const rec = cachedRecord(sessionId)
        const head = {
          sessionId, domSessionId: currentSessionId(document), domBlocks: blocks.length,
          domSignature: domSignatureOf(texts),
        }
        if (rec === null) return { ...head, ok: false, error: '记录未加载' }
        if (rec.error !== null) return { ...head, ok: false, error: rec.error }
        const matches = matchBlocks(rec.blocks, texts)
        return {
          ...head,
          ok: true,
          mode: rec.mode,
          recordSignature: rec.domSignature,
          diskBlocks: rec.blocks.length,
          matched: matches.filter(m => m !== null).length,
          exact: matches.filter(m => m !== null && m.exact === true).length,
          
          stale: recordNeedsRefresh(rec, blocks.length, domSignatureOf(texts)),
          rows: matches.map((m, i) => ({
            domIndex: i,
            preview: ownText(blocks[i]).slice(0, 40),
            seq: m === null ? null : m.seq,
            blockIndex: m === null ? null : m.blockIndex,
            exact: m === null ? null : m.exact,
          })),
        }
      },
      setEnabled(value) {
        prefs = { ...prefs, enabled: value === true }
        savePrefs(prefs)
        
        if (prefs.enabled) scheduleScan()
        else stripInjectedUI()
      },
      










      focus: makeFocusProbe(document),
    }
  } catch {
    
  }
}
return { apply: apply, name: name, inject: inject };
};
