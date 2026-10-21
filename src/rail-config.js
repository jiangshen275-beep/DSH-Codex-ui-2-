/**
 * 侧栏 rail 的配置面：让「加一条侧栏快捷方式」变成写一个 JSON 文件 / 调一个工具，而不是写插件。
 *
 * 为什么要有这一层：`window.__dshCodexUiRail.register()` 是给插件作者用的，普通的 DSH 用户
 * 手上没有客户端代码，只有自己的 Agent。让 Agent 帮忙装的正确形态是：一份人能读懂、Agent 能
 * 直接写的配置文件，加上一个 Agent 能调用的工具。两者写的是同一个文件。
 *
 * 三条设计约束：
 *   · 文件是唯一真相。工具和 RPC 都只是它的读写口，不存在「工具里加了但文件里没有」的状态。
 *   · 校验在写入侧做。一条 id 重复或三个目标全空的条目，写进文件就是个死按钮，宁可当场报错。
 *   · 坏文件不能炸宿主。它可能在用户手改之后变成半截 JSON，读的时候容错，写的时候原子替换
 *     （先写 .tmp 再 rename），保证任何时刻磁盘上都是一个完整的文件。
 */
import { readFileSync, renameSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 交给系统去打开一个地址。
 *
 * 为什么非要绕到宿主进程：界面里的 `window.dshDesktop` 只在 `dsh-app:` 协议下才注入，用浏览器
 * 打开 GUI 时根本不存在；退到 `window.open` 又被宿主只放行 http/https 的规则拦掉。于是
 * `steam://`、`tencent://` 这类在页面上点了等于没点，程序层面一个动作都不会产生。宿主是普通
 * Node 进程，起一个子进程交给系统的协议处理器，这条路不受那两层限制。
 */
function launchExternal(target) {
  const windows = process.platform === 'win32';
  const command = windows ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  // `start` 是 cmd 的内建命令，第一个空串是窗口标题占位——不给它，带引号的地址会被当成标题。
  const args = windows ? ['/c', 'start', '', target] : [target];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  // 子进程与宿主脱钩：DSH 关掉时不该把已经打开的浏览器或程序一起带走。
  child.unref();
}

/**
 * Windows 上这条路要过 `cmd`，地址里带这些字符就能拼出第二条命令。正常地址不会有它们，
 * 有就是有人在手改配置文件，直接拒绝比赌它无害要好。
 */
const SHELL_HOSTILE = /["&|<>^%\r\n\t]/;

/**
 * 会被拦下的协议。条目入库时查过一遍（`normalizeItem`），这里再查一遍是防手改配置文件——
 * 入库校验管不到别人拿记事本改出来的东西，而这一句后面就是真的起进程。
 */
const BLOCKED_SCHEME = /^(?:javascript|data|vbscript|file):/i;

/**
 * 允许当作 `exec` 目标的扩展名。程序直接起；文档类交给系统用关联程序打开
 * （`start "" 文件` 等于双击那个文件：记事本开 .txt、Edge 开 .pdf，看用户装了什么）。
 */
const PROGRAM_EXTENSIONS = ['.exe', '.lnk', '.bat', '.cmd', '.txt', '.md', '.log', '.pdf'];

export function assertLaunchable(url) {
  const text = typeof url === 'string' ? url.trim() : '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text) || BLOCKED_SCHEME.test(text) || SHELL_HOSTILE.test(text)) {
    const error = new Error(`这个地址不能交给系统打开：${text.slice(0, 120) || '(空)'}`);
    error.code = 'rail/url';
    throw error;
  }
  return text;
}

/**
 * 启动本机程序。
 *
 * 为什么还要这一条：`url` 走的是系统的协议处理器，前提是那个协议注册得对。QQ 这种机器上
 * 很常见的是协议被另一个版本抢注册了，点下去弹的是别人的报错（「你的QQ版本不支持本功能」）。
 * 直接给可执行文件路径就没这个问题——不需要谁代为解释，宿主自己就把进程起来。
 */
function launchProgram(path) {
  const windows = process.platform === 'win32';
  const lower = path.toLowerCase();
  if (windows && !lower.endsWith('.exe')) {
    // .lnk / .bat / .cmd 得让 shell 解释；.txt / .pdf 这类是「打开」，同样走 shell 的关联程序。
    spawn('cmd', ['/c', 'start', '', path], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return;
  }
  // 程序自己的窗口要不要出现，由程序决定，所以这里不隐藏。脱钩是为了 DSH 关掉时不连带关它。
  spawn(path, [], { detached: true, stdio: 'ignore' }).unref();
}

export function assertLaunchableProgram(path) {
  const text = typeof path === 'string' ? path.trim() : '';
  const ext = (text.match(/\.[^\\/]+$/) ?? [''])[0].toLowerCase();
  if (text === '' || SHELL_HOSTILE.test(text) || !PROGRAM_EXTENSIONS.includes(ext) || !existsSync(text)) {
    const error = new Error(`这个程序不能启动：${text.slice(0, 160) || '(空)'}`);
    error.code = 'rail/exec';
    throw error;
  }
  return text;
}

/**
 * 安装说明的绝对路径，交给 Agent 自己去读。
 *
 * 从本文件的位置往上走一级就是包根，装到哪个 profile、目录叫什么名字都算得出来；
 * 写死一个绝对路径，换个安装位置就指丢了。文件不在就别提这一句——指向不存在的路径更糟。
 */
const RAIL_GUIDE = (() => {
  try {
    const path = fileURLToPath(new URL('../SIDEBAR-RAIL.zh.md', import.meta.url));
    return existsSync(path) ? path : '';
  } catch { return ''; }
})();

/** 文件名固定，文档、工具、RPC 三处引用同一个常量。 */
export const RAIL_FILE = 'dsh-codex-ui-rail.json';
/** 文件与 RPC 共用的 envelope method。 */
const RAIL_METHOD = 'dsh-codex-ui/rail';
const RAIL_ROUTE = '/api/dsh-codex-ui/rail';
const ID_LIMIT = 64;
const LABEL_LIMIT = 40;
/**
 * 侧栏能放下的自定义按钮数。
 *
 * 内置五项之后的空间只够三个 36px 的格子，再多就要把设置按钮挤出去。所以三这个数字是界面
 * 尺寸定的，不是产品口味。超出的条目不会消失——它们进「展开」那个弹层，从那里还能把它们换上来。
 */
export const MAX_PINNED = 3;
/** 与客户端 RailIconNames 保持一致；不在表里的名字会被当成内置名之外的输入拒绝。 */
const ICON_NAMES = new Set(['home', 'files', 'clock', 'search', 'edit', 'bell', 'chevron', 'down', 'folder', 'more', 'check', 'settings', 'refresh', 'help', 'external', 'chat', 'trace', 'target', 'plus', 'trash', 'at']);

/**
 * 内置那几颗按钮已经画出来的图标：更多（三个点）、主页、用量、定时任务、插件、技能（外链箭头）、设置。
 * 自定义项一律不许再用——侧栏上出现两个一模一样的外链箭头，用户没法知道哪个点开是什么。
 * 这条规则是在「中转站」那条用了 external 之后补上的。
 */
const RESERVED_ICONS = new Set(['more', 'home', 'files', 'clock', 'at', 'external', 'settings']);

/** `$DSH_HOME/dsh-codex-ui-rail.json`，或者 null（宿主没给 home）。 */
export function railConfigPath(home = process.env.DSH_HOME) {
  const root = typeof home === 'string' && home !== '' ? home : '';
  return root === '' ? null : join(root, RAIL_FILE);
}

function railError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * 把一条原始条目整理成可以写进文件的样子。
 *
 * 三个目标里 `onClick` 不在其中：函数写不进 JSON，也不该跨进程传。配置文件只支持 `panel`
 * 与 `url` 两种目标，回调留给插件作者在客户端登记时用。
 */
export function normalizeItem(raw) {
  if (raw === null || typeof raw !== 'object') throw railError('rail/invalid', '条目必须是一个对象。');
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (id === '') throw railError('rail/id', '条目缺少 id。');
  if (id.length > ID_LIMIT) throw railError('rail/id', `id 不能超过 ${ID_LIMIT} 个字符。`);
  const label = typeof raw.label === 'string' ? raw.label.trim() : '';
  if (label === '') throw railError('rail/label', `条目 ${id} 缺少 label。`);
  if (label.length > LABEL_LIMIT) throw railError('rail/label', `label 不能超过 ${LABEL_LIMIT} 个字符（现在 ${label.length} 个）。`);
  const panel = typeof raw.panel === 'string' && raw.panel.trim() !== '' ? raw.panel.trim() : '';
  const section = typeof raw.section === 'string' ? raw.section.trim() : '';
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  const exec = typeof raw.exec === 'string' ? raw.exec.trim() : '';
  const targets = [panel, section, url, exec].filter(value => value !== '');
  if (targets.length === 0) {
    throw railError('rail/target', `条目 ${id} 需要一个目标：panel（主视图面板 key，用 panels 动作查）、section（设置页 id，例如 plugins）、url（网址，或 steam:// 这类应用协议）、exec（本机程序的完整路径）。`);
  }
  if (targets.length > 1) {
    throw railError('rail/target', `条目 ${id} 只能有一个目标，panel / section / url / exec 选一个，现在给了 ${targets.length} 个。`);
  }
  if (url !== '') {
    if (/^(?:javascript|data|vbscript|file):/i.test(url)) throw railError('rail/url', `条目 ${id} 的 url 用了会被拦下的协议。`);
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) throw railError('rail/url', `条目 ${id} 的 url 要带协议，例如 https://example.com 或 steam://open/main。`);
  }
  if (exec !== '') {
    // 这条后面是真的起进程，所以路径必须落地：绝对路径、扩展名在白名单里、文件确实在。
    if (!/^[a-zA-Z]:[\\/]/.test(exec) && !exec.startsWith('\\\\')) {
      throw railError('rail/exec', `条目 ${id} 的 exec 要写程序的完整路径，例如 D:\\qq\\QQ.exe。`);
    }
    const ext = (exec.match(/\.[^\\/]+$/) ?? [''])[0].toLowerCase();
    if (!PROGRAM_EXTENSIONS.includes(ext)) {
      throw railError('rail/exec', `条目 ${id} 的 exec 只接受 ${PROGRAM_EXTENSIONS.join(' / ')}，现在是 ${ext === '' ? '(没有扩展名)' : ext}。`);
    }
    if (!existsSync(exec)) throw railError('rail/exec', `条目 ${id} 的 exec 指向的文件不存在：${exec}`);
  }
  const iconName = typeof raw.icon === 'string' ? raw.icon.trim() : '';
  if (iconName !== '' && !ICON_NAMES.has(iconName)) throw railError('rail/icon', `图标名 ${iconName} 不认识。可用：${[...ICON_NAMES].filter(name => !RESERVED_ICONS.has(name)).join(' / ')}。也可以改用 iconPath 传一条 svg path。`);
  // 保留图标在这里降级，不报错：升级前就已经用了 `external` 的老配置，报错会让整份列表读不出来，
  // 用户的侧栏会一次性空掉——那比图标重复严重得多。新装的那条由 `addItem` 挡在前面。
  const effectiveIcon = RESERVED_ICONS.has(iconName) ? '' : iconName;
  const iconPath = typeof raw.iconPath === 'string' ? raw.iconPath.trim() : '';
  if (effectiveIcon !== '' && iconPath !== '') throw railError('rail/icon', `条目 ${id} 的 icon 与 iconPath 只能二选一。`);
  const item = { id, label };
  if (effectiveIcon !== '') item.icon = effectiveIcon;
  if (iconPath !== '') {
    item.iconPath = iconPath;
    const viewBox = typeof raw.iconViewBox === 'string' ? raw.iconViewBox.trim() : '';
    if (viewBox !== '') item.iconViewBox = viewBox;
  }
  if (Number.isFinite(raw.order)) item.order = raw.order;
  if (panel !== '') item.panel = panel;
  if (section !== '') item.section = section;
  if (url !== '') item.url = url;
  if (exec !== '') item.exec = exec;
  if (typeof raw.pinned === 'boolean') item.pinned = raw.pinned;
  return item;
}

/** 读文件。不存在 → 空列表；坏 JSON → 抛错，由调用方决定怎么说。 */
export function readBook(home) {
  const file = railConfigPath(home);
  if (file === null) return { version: 1, items: [] };
  if (!existsSync(file)) return { version: 1, items: [] };
  const text = readFileSync(file, 'utf8');
  if (text.trim() === '') return { version: 1, items: [] };
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (error) { throw railError('rail/json', `${RAIL_FILE} 不是合法 JSON：${error.message}`); }
  const raw = Array.isArray(parsed) ? parsed : parsed?.items;
  if (!Array.isArray(raw)) throw railError('rail/json', `${RAIL_FILE} 需要一个 items 数组（直接放数组也可以）。`);
  const seen = new Set();
  const items = [];
  for (const entry of raw) {
    const item = normalizeItem(entry);
    if (seen.has(item.id)) throw railError('rail/duplicate', `id ${item.id} 重复了。`);
    seen.add(item.id);
    items.push(item);
  }
  return { version: 1, items };
}

/** 原子写回：先落 .tmp，再 rename 覆盖。中途断电也不会留下半个文件。 */
export function writeBook(book, home) {
  const file = railConfigPath(home);
  if (file === null) throw railError('rail/no-home', 'DSH_HOME 未设置，无法保存侧栏配置。');
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ version: 1, items: book.items }, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
  return file;
}

export function listItems(home) {
  return readBook(home).items;
}

/** 当前占用了侧栏格子的条目数（`pinned === true`）。 */
function countPinned(items, exceptId = '') {
  return items.filter(item => item.pinned === true && item.id !== exceptId).length;
}

/** 新增或覆盖同 id 的条目（按 id 幂等，方便 Agent 反复执行同一条命令）。 */
export function addItem(raw, home) {
  // 新装的这条严格拦：内置按钮已经在用的图标不能用，否则侧栏上会出现两个一样的图标。
  // （读旧配置时是降级而不是报错，见 `normalizeItem` 里那段注释。）
  const wanted = typeof raw?.icon === 'string' ? raw.icon.trim() : '';
  if (RESERVED_ICONS.has(wanted)) {
    throw railError('rail/icon', `图标 ${wanted} 已经被侧栏内置按钮占了（更多 / 主页 / 用量 / 定时任务 / 插件 / 技能 / 设置），自定义项不能再用——两个一样的图标用户分不清。换一个：${[...ICON_NAMES].filter(name => !RESERVED_ICONS.has(name)).join(' / ')}。`);
  }
  const item = normalizeItem(raw);
  const book = readBook(home);
  const at = book.items.findIndex(entry => entry.id === item.id);
  if (at >= 0) {
    // 覆盖时不把已经占位的条目挤掉：不写 pinned 就沿用原值。
    if (item.pinned === undefined) item.pinned = book.items[at].pinned === true;
    else if (item.pinned === true && countPinned(book.items, item.id) >= MAX_PINNED) {
      throw railError('rail/limit', `侧栏最多放 ${MAX_PINNED} 个自定义按钮，先取消一个再换。`);
    }
    book.items[at] = item;
  } else {
    // 不写 pinned 就自动占一个空位；位子满了就默认收进弹层，而不是拒绝添加——
    // 「加得进去但暂时不占侧栏」比「加不进去」有用得多。
    if (item.pinned === undefined) item.pinned = countPinned(book.items) < MAX_PINNED;
    else if (item.pinned === true && countPinned(book.items) >= MAX_PINNED) {
      throw railError('rail/limit', `侧栏最多放 ${MAX_PINNED} 个自定义按钮，先取消一个再换。`);
    }
    book.items.push(item);
  }
  return { item, file: writeBook(book, home), items: book.items };
}

/** 把某一条放上侧栏（`pinned: true`）或收进弹层（`false`）。 */
export function setPinned(id, pinned, home) {
  const clean = typeof id === 'string' ? id.trim() : '';
  const book = readBook(home);
  const target = book.items.find(entry => entry.id === clean);
  if (target === undefined) throw railError('rail/not-found', `没有 id 为 ${clean} 的侧栏条目。`);
  if (pinned === true && countPinned(book.items, clean) >= MAX_PINNED) {
    throw railError('rail/limit', `侧栏最多放 ${MAX_PINNED} 个自定义按钮，先取消一个再换。`);
  }
  target.pinned = pinned === true;
  return { item: target, items: book.items, file: writeBook(book, home) };
}

export function removeItem(id, home) {
  const clean = typeof id === 'string' ? id.trim() : '';
  if (clean === '') throw railError('rail/id', '需要给出要删除的 id。');
  const book = readBook(home);
  const next = book.items.filter(entry => entry.id !== clean);
  if (next.length === book.items.length) throw railError('rail/not-found', `没有 id 为 ${clean} 的侧栏条目。`);
  return { file: writeBook({ version: 1, items: next }, home), items: next };
}

/** 客户端拉取用的载荷：只带能渲染的字段。 */
export function describeItems(home) {
  return listItems(home).map(item => ({ ...item }));
}

/**
 * 可挂面板清单的落地文件。
 *
 * 为什么要在磁盘上中转一次：面板是客户端的东西（`slots.entriesOfSlot('main')` 只有浏览器那边
 * 看得到），而工具跑在宿主侧。清单由客户端每 15 秒上报一次，落在同目录的这个文件里，工具再读
 * 它。没有这一步，Agent 就只能靠猜——而"猜一个 panel key"正是这个功能最容易失败的地方。
 */
export const RAIL_PANELS_FILE = 'dsh-codex-ui-panels.json';

export function panelsPath(home = process.env.DSH_HOME) {
  const root = typeof home === 'string' && home !== '' ? home : '';
  return root === '' ? null : join(root, RAIL_PANELS_FILE);
}

/** 客户端上报：只收 `{ key, by }` 两个字段，别的都丢掉——这个文件不是信任边界之外的东西。 */
export function savePanels(panels, home = process.env.DSH_HOME) {
  const file = panelsPath(home);
  if (file === null) throw railError('rail/no-home', 'DSH_HOME 未设置，无法记录面板清单。');
  const rows = (Array.isArray(panels) ? panels : [])
    .filter(panel => panel !== null && typeof panel === 'object' && typeof panel.key === 'string' && panel.key !== '')
    .slice(0, 200)
    .map(panel => ({ key: panel.key.slice(0, 120), by: typeof panel.by === 'string' ? panel.by.slice(0, 120) : '' }));
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ version: 1, at: new Date().toISOString(), panels: rows }, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
  return rows;
}

export function readPanels(home = process.env.DSH_HOME) {
  const file = panelsPath(home);
  if (file === null || !existsSync(file)) return { at: '', panels: [] };
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return {
      at: typeof parsed?.at === 'string' ? parsed.at : '',
      panels: Array.isArray(parsed?.panels) ? parsed.panels.filter(panel => typeof panel?.key === 'string' && panel.key !== '') : []
    };
  } catch {
    // 这个文件只是缓存，坏了就当没有；不值得为它报错。
    return { at: '', panels: [] };
  }
}

/**
 * RPC 路由。与其它路由同构：client-request 进来，server-response 出去。
 * `action` 三种：list / add / remove。
 */
export function registerRailRoute(ctx, home = process.env.DSH_HOME) {
  const respond = (rpcId, result) => Response.json({ type: 'server-response', rpcId, result });
  const failure = (code, message) => ({ ok: false, error: { code, message } });
  const guard = body => {
    try { return { ok: true, value: body() }; }
    catch (error) { return failure(error?.code ?? 'rail/failed', error?.message ?? String(error)); }
  };
  ctx.connection.fetch.register({
    path: RAIL_ROUTE,
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      let envelope;
      try { envelope = await request.json(); } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }
      if (envelope?.type !== 'client-request' || envelope.method !== RAIL_METHOD || typeof envelope.rpcId !== 'string' || envelope.rpcId.length > 256) {
        return Response.json({ error: 'Invalid request' }, { status: 400 });
      }
      const payload = envelope.payload ?? {};
      const action = typeof payload.action === 'string' ? payload.action : 'list';
      if (action === 'list') {
        const listed = guard(() => describeItems(home));
        return respond(envelope.rpcId, listed.ok ? { ok: true, value: { items: listed.value } } : listed);
      }
      if (action === 'add') {
        const added = guard(() => addItem(payload.item, home));
        return respond(envelope.rpcId, added.ok ? { ok: true, value: { item: added.value.item, items: added.value.items } } : added);
      }
      if (action === 'remove') {
        const removed = guard(() => removeItem(payload.id, home));
        return respond(envelope.rpcId, removed.ok ? { ok: true, value: { items: removed.value.items } } : removed);
      }
      if (action === 'pin') {
        // 侧栏上那几个格子由界面自己切换，这里只负责落盘（并守住三格上限）。
        const pinned = guard(() => setPinned(payload.id, payload.pinned === true, home));
        return respond(envelope.rpcId, pinned.ok ? { ok: true, value: { items: pinned.value.items } } : pinned);
      }
      if (action === 'open') {
        // 只认配置里已经存在的条目：让调用方随便塞一个地址就起进程，等于把宿主变成火箭筒。
        const opened = guard(() => {
          const entry = describeItems(home).find(item => item.id === payload.id);
          if (entry === undefined || (typeof entry.url !== 'string' && typeof entry.exec !== 'string')) {
            const error = new Error(`没有 id 为 ${String(payload.id)} 的链接快捷方式`);
            error.code = 'rail/missing';
            throw error;
          }
          if (typeof entry.exec === 'string' && entry.exec !== '') {
            const program = assertLaunchableProgram(entry.exec);
            launchProgram(program);
            return { opened: program };
          }
          const target = assertLaunchable(entry.url);
          launchExternal(target);
          return { opened: target };
        });
        return respond(envelope.rpcId, opened.ok ? { ok: true, value: opened.value } : opened);
      }
      if (action === 'panels') {
        // 带 panels 数组就是客户端上报，否则是读取。同一个动作，两个方向。
        if (Array.isArray(payload.panels)) {
          const saved = guard(() => savePanels(payload.panels, home));
          return respond(envelope.rpcId, saved.ok ? { ok: true, value: { panels: saved.value } } : saved);
        }
        return respond(envelope.rpcId, { ok: true, value: readPanels(home) });
      }
      return respond(envelope.rpcId, failure('rail/action', `不认识的 action：${action}（可用 list / add / remove）。`));
    }
  });
}

/**
 * Agent 用的工具。
 *
 * 描述写得罗嗦是故意的：调用方是一个模型，它需要知道「panel 和 url 有什么区别」「改了什么时候
 * 生效」「失败长什么样」，这几句决定了它能不能一次做对，也决定了它会不会在失败后瞎猜。
 */
export function railTool(home = process.env.DSH_HOME) {
  return {
    name: 'sidebar_rail',
    description: [
      '在 DSH 侧边栏（左侧竖排图标栏）增加、删除或列出快捷项。',
      ...(RAIL_GUIDE === '' ? [] : [`动手之前先完整读这份说明：${RAIL_GUIDE}。里面写了字段、三个位子的规则、三类目标怎么选，以及装之前必须先问用户哪几件事。`]),
      '侧边栏内置五项是写死的，这个工具管理的是它们下面的自定义项。',
      '每个条目要指向一个目标：panel = 某个插件注册的 main 面板 key（点了切到那个界面）；section = 设置里的一页（例如 plugins，点了打开设置并直接落到那一页）；url = 网址或应用协议（https://… 用默认浏览器，steam:// / vscode:// 这类交给系统的协议处理器）；exec = 本机程序的完整路径（例如 D:\\\\qq\\\\QQ.exe），点了直接把它启动起来。',
      '用户要「点一下打开某个软件」时优先用 exec 而不是 url：应用协议经常被别的版本抢注册，点了弹出来的是别人的报错，而 exe 路径不会。',
      '不确定 panel 该填什么就先调 action=panels：它列出当前界面上所有可挂的 main 面板 key 以及注册它的插件。清单是界面每 15 秒上报的，刚装好还没打开过界面时会是空的，那时只能挂 url。',
      '写进 $DSH_HOME/dsh-codex-ui-rail.json，DSH 界面在 15 秒内自动出现，不需要重启。',
      '侧栏只放得下 3 个自定义按钮（内置五项另算，合计 8 个）：新加的条目自动占空位，位子满了就收进侧栏底部的展开弹层，用 action=pin 可以把任意一条换上来。',
      '新增按钮之前先问用户：点下去想看到什么（DSH 里已有的界面 / 设置某一页 / 一个网址 / 打开电脑上的某个程序）、叫什么名字、要不要现在占那三个位子之一。别替他猜，也别拿 panel 去猜 key。',
      '按 id 幂等：同一个 id 再 add 一次是覆盖，不会重复。'
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'panels', 'add', 'remove', 'pin'], description: 'list 列出已配置的条目，panels 列出可挂的面板 key，add 新增或覆盖，remove 按 id 删除，pin 把某条放上侧栏或收进弹层。' },
        pinned: { type: 'boolean', description: '配合 action=pin：true 放到侧栏，false 收进展开弹层。侧栏最多放 3 个自定义按钮。' },
        id: { type: 'string', description: '条目 id，唯一，add/remove 必填。建议用短横线小写，例如 "my-plugin-panel"。' },
        label: { type: 'string', description: '悬停提示文字，也是无障碍名称，最多 40 个字符。add 必填。' },
        panel: { type: 'string', description: '目标主面板 key：别的插件用 ctx.slots.register({ name: "main", key }) 注册的那个 key。四种目标只能给一个。' },
        section: { type: 'string', description: '目标设置页 id：点了会打开设置弹窗并直接落到那一页。已知值：general / models / plugins / market（插件市场自己注册的那页）/ subagent。四种目标只能给一个。' },
        url: { type: 'string', description: '目标地址，必须带协议：https://example.com 用系统默认浏览器打开；steam://、vscode:// 这类交给系统的协议处理器唤起对应程序。点击时由 DSH 宿主进程去打开，浏览器访问界面时同样有效。四种目标只能给一个。' },
        exec: { type: 'string', description: '本机文件或程序的完整路径，例如 D:\\qq\\QQ.exe 或 D:\\速记.txt。点了直接启动程序，或者用关联程序打开这个文件；不经过应用协议，所以不会被别的版本抢注册的协议带偏。只接受绝对路径和 .exe / .lnk / .bat / .cmd / .txt / .md / .log / .pdf，文件必须存在。四种目标只能给一个。' },
        icon: { type: 'string', description: '内置图标名，可用：search / edit / bell / chevron / down / folder / check / refresh / help / chat / trace / target / plus / trash。不给则用 target。另注：more / home / files / clock / at / external / settings 这七个已经被侧栏内置按钮占用，自定义项传了会被拒——两个一样的图标，用户分不清哪个点开是什么。' },
        iconPath: { type: 'string', description: '自定义 svg path 的 d 属性，与 icon 二选一。' },
        iconViewBox: { type: 'string', description: '配合 iconPath，默认 "0 0 24 24"。16px 图标请传 "0 0 16 16"。' },
        order: { type: 'number', description: '排序值，小的在前，默认 100。内置五项固定在它之前。' }
      },
      required: ['action']
    },
    // 宿主对 output 是硬要求：`tools.register()` 见到没有 `output.render` 就抛 TypeError，
    // 而入口那层 try/catch 会把它吞成一行 warn——工具于是静默地不在工具表里，模型只能看到
    // 一堆文件工具，遇到「帮我加个侧边栏」就跑去翻工作区找代码。返回的是一行纯文本，
    // 所以 schema 就声明 string，render 原样交出去。
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : String(value ?? '') }]
    },
    async execute(args) {
      const action = typeof args?.action === 'string' ? args.action : 'list';
      try {
        if (action === 'list') {
          const items = describeItems(home);
          if (items.length === 0) return `OK\tlist\t0 条。侧边栏目前只有内置五项。文件：${railConfigPath(home) ?? '（DSH_HOME 未设置）'}`;
          const lines = items.map(item => `${item.id}\t${item.label}\t${item.panel !== undefined ? `panel=${item.panel}` : item.section !== undefined ? `section=${item.section}` : item.exec !== undefined ? `exec=${item.exec}` : `url=${item.url}`}\t${item.pinned === true ? '侧栏' : '弹层'}`);
          return `OK\tlist\t${items.length} 条\n${lines.join('\n')}`;
        }
        if (action === 'panels') {
          const { at, panels } = readPanels(home);
          if (panels.length === 0) {
            return 'OK\tpanels\t0 个。清单由 DSH 界面每 15 秒上报一次：界面没打开过、或刚装完还没渲染过 main 面板时会是空的。这种情况下只能挂 url 目标。';
          }
          const lines = panels.map(panel => `${panel.key}${panel.by === '' ? '' : `\t(注册者 ${panel.by})`}`);
          return `OK\tpanels\t${panels.length} 个\t更新于 ${at || '未知'}\n${lines.join('\n')}`;
        }
        if (action === 'add') {
          const { item, file, items } = addItem({ id: args.id, label: args.label, panel: args.panel, section: args.section, url: args.url, exec: args.exec, icon: args.icon, iconPath: args.iconPath, iconViewBox: args.iconViewBox, order: args.order }, home);
          // 追加后的条数写进返回值：Agent 需要一个能确认「这次真的写进去了」的数字。
          return `OK\tadd\t${item.id}\t共 ${items.length} 条\t${file}`;
        }
        if (action === 'remove') {
          const { items, file } = removeItem(args.id, home);
          return `OK\tremove\t${items.length} 条剩余\t${file}`;
        }
        if (action === 'pin') {
          const { items, file } = setPinned(args.id, args.pinned === true, home);
          const on = items.filter(item => item.pinned === true).length;
          return `OK\tpin\t${args.id}\t侧栏 ${on}/${MAX_PINNED}\t${file}`;
        }
        return `FAILED\t不认识的 action：${action}（可用 list / add / remove）`;
      } catch (error) {
        // 工具的失败要写成文字让模型看见原因，而不是抛异常——抛了它只会重试同一个错误。
        return `FAILED\t${error?.code ?? 'rail/failed'}\t${error?.message ?? String(error)}`;
      }
    }
  };
}

export function registerRailTool(ctx, home = process.env.DSH_HOME) {
  ctx.effect(() => ctx.tools.register(railTool(home)));
}
