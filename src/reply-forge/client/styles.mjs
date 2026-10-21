// 全部样式收敛在 rf3- 前缀下，且选择器一律以宿主容器为作用域起点，
// 不写全局元素选择器，避免命中其它插件或宿主的节点。

export const CSS = `
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
