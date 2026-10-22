/**
 * 子代理会话的自动清收。
 *
 * 为什么要它：闪电/超快会按合同派出大量子代理，而子代理的会话会一直在上下文与侧栏里占着，
 * 父会话每一轮都要为它们付 input token。跑完就删，比留着省。
 *
 * 什么时候删（这是本文件最重要的一个取舍）：
 *   **父会话这一轮结束时统一清**，不是子代理一停下就删。
 *   原因是闪电合同第 4 条要求「复用已有的子代理，而不是重开一个」——如果子代理一 turn/end
 *   就删掉，下一次 send_message 续问会直接落空，模型只能重派一个，反而更贵、更吵。
 *   父会话 turn/end 意味着这一轮没人再需要它们了，这时删最安全。
 *
 * 怎么判断「跑完了」：
 *   一个子代理要等**它自己不在跑、并且它派出的所有后代都不在跑**才算完成。超快那层的
 *   「二代父」子代理正是这样：它要先收齐孙代理的结果、整理完发回父会话，才算真的完。
 *
 * 怎么删才算删干净（不留幽灵会话）：
 *   先把这个 id 写进宿主的归档列表（`storages/workspace.json` 的 `global.archivedSessionIds`），
 *   再交给 `purgeArchivedSession`。那个函数除了删日志目录，还会把 id 从**归档列表和置顶列表**
 *   里一起摘掉、删掉投影缓存——只删目录不摘注册表，侧栏就会留一条点不开的空行，也就是幽灵。
 */
import { readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';
import { join } from 'node:path';

import { purgeArchivedSession } from './session-purge.js';

/** zstd 帧魔数；一条会话日志是这个魔数开头的若干帧。 */
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/**
 * 读一个会话日志的第一帧，只看它的 header。
 *
 * 为什么必须读 header 而不是看 id 长什么样：本机 83 个样本里「不带 session- 前缀」和
 * `origin: subagent` 恰好 100% 吻合，但那是巧合。宿主里子代理 id 取自 `randomUUID()`，
 * 而 ACP 新建的用户会话**同样**是裸 uuid —— 前缀分不出来。产品自己判子代理只用
 * `header.origin === 'subagent'`，这里跟着它走。
 */
function readSessionHeader(dirPath) {
  const buf = readFileSync(join(dirPath, 'session.v4.jsonl.zstd'));
  const at = buf.indexOf(ZSTD_MAGIC);
  if (at < 0) return null;
  const first = zstdDecompressSync(buf.subarray(at)).toString('utf8').split('\n')[0];
  if (first === undefined || first.trim() === '') return null;
  const header = JSON.parse(first);
  return {
    origin: typeof header?.origin === 'string' ? header.origin : '',
    depth: Number.isFinite(header?.delegationDepth) ? header.delegationDepth : 0,
  };
}

/** 产品自己的分类口径：origin 是导航分类，深度是事实，两者取或。 */
function looksLikeSubagent(header) {
  return header !== null && (header.origin === 'subagent' || header.depth > 0);
}

/** 归档表里的 id 列表；读不到就当空表——清理这件事不该因为读不动注册表而中断。 */
function archivedIds(root) {
  try {
    const parsed = JSON.parse(readFileSync(join(root, 'storages', 'workspace.json'), 'utf8'));
    const list = parsed?.global?.archivedSessionIds;
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
}

const LOG = '[dsh-codex-ui]';

/** 同 `session-purge.js` 里的取法：插件只认环境变量，不猜安装位置。 */
function homeRoot() {
  const home = process.env.DSH_HOME;
  return typeof home === 'string' && home.length > 0 ? home : '';
}

/**
 * 把一个会话塞进宿主的归档列表，好让 `purgeArchivedSession` 认它。
 * 读-改-写走临时文件加重命名，读的人不会看到写了一半的注册表。
 */
function markArchived(root, sessionId) {
  const file = join(root, 'storages', 'workspace.json');
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  const bag = parsed?.global;
  if (!bag || !Array.isArray(bag.archivedSessionIds)) throw new Error('归档列表不可读');
  if (bag.archivedSessionIds.includes(sessionId)) return;
  bag.archivedSessionIds = [...bag.archivedSessionIds, sessionId];
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  renameSync(temp, file);
}

/** 子代理的判定与 `turbo.js` 保持一致：`origin` 是导航分类，深度才是事实。 */
function readHeader(session) {
  const header = session?.header ?? session ?? {};
  const id = typeof header.id === 'string' ? header.id : '';
  if (id === '') return null;
  return {
    id,
    parent: typeof header.parentSession === 'string' ? header.parentSession : '',
    sub: header.origin === 'subagent' || (header.delegationDepth ?? 0) > 0,
  };
}

/**
 * @param ctx - host context；缺 `on` 的环境（某些测试桩）直接安静退出。
 */
/**
 * 默认关闭，原因写在这里，别后来的人再踩一次。
 *
 * 删子代理目录会让宿主页头那个「后代 N」永远对不上：那是父会话日志里 `subagent/catalog`
 * 事件 fold 出来的，append-only，宿主从不回删，也不扫目录（官方原话「Native reads neither
 * collect child logs nor compare their physical facts」）。实测：删掉 38 个子代理目录、清掉
 * 归档死引用、连父会话的投影缓存一起删，重启之后那个计数照样是 33——它记的是「这个会话
 * 派过 33 个子代理」，事实没错。所以一旦替用户删，用户就会看到「显示三十几个、点进去全空」。
 *
 * 想用的人自己开：在 `$DSH_HOME/storages/codex-ui-reaper.json` 里写 `{ "enabled": true }`。
 * 开了之后，上面那条不一致就会出现在你的界面上——这是这个功能的已知代价。
 */
function reaperEnabled(root) {
  if (root === '') return false;
  try {
    const parsed = JSON.parse(readFileSync(join(root, 'storages', 'codex-ui-reaper.json'), 'utf8'));
    return parsed?.enabled === true;
  } catch {
    return false;
  }
}

export function registerSubagentReaper(ctx) {
  if (typeof ctx?.on !== 'function') return () => {};
  // 开关读在注册这一层：关掉就是彻底不挂监听，连账本都不建。
  if (!reaperEnabled(homeRoot())) {
    try { ctx.logger?.info?.('[dsh-codex-ui] 子代理自动清收未启用（默认关闭，见 codex-ui-reaper.json）'); } catch { /* 日志失败不影响加载 */ }
    return () => {};
  }

  /** id -> { parent, sub, live, children:Set<string> } */
  const ledger = new Map();

  const row = id => {
    let entry = ledger.get(id);
    if (entry === undefined) {
      entry = { parent: '', sub: false, live: false, children: new Set() };
      ledger.set(id, entry);
    }
    return entry;
  };

  const remember = session => {
    try {
      const head = readHeader(session);
      if (head === null) return;
      const entry = row(head.id);
      if (head.parent !== '') entry.parent = head.parent;
      if (head.sub) entry.sub = true;
      if (entry.parent !== '') row(entry.parent).children.add(head.id);
    } catch { /* 记账失败不能影响会话本身 */ }
  };

  /** 该会话自己及全部后代都不在跑。递归有界：会话树最多两层，且 children 只增不改。 */
  const quiet = (id, seen = new Set()) => {
    if (seen.has(id)) return true;
    seen.add(id);
    const entry = ledger.get(id);
    if (entry === undefined) return true;
    if (entry.live) return false;
    for (const child of entry.children) if (!quiet(child, seen)) return false;
    return true;
  };

  /** 后代在前、自己在后：先删叶子，才不会出现「父删了孙还在写」。 */
  const deepFirst = (id, seen = new Set()) => {
    if (seen.has(id)) return [];
    seen.add(id);
    const entry = ledger.get(id);
    const out = [];
    if (entry !== undefined) for (const child of entry.children) out.push(...deepFirst(child, seen));
    out.push(id);
    return out;
  };

  /** 清掉一整棵已静默的子树；任何一步失败都原样留着，下一个 turn/end 再试。 */
  const reap = id => {
    const root = homeRoot();
    if (root === '') return 0;
    let removed = 0;
    for (const victim of deepFirst(id)) {
      const entry = ledger.get(victim);
      if (entry === undefined) continue;
      if (entry.sub !== true) continue; // 绝不碰父会话
      if (!quiet(victim)) continue;
      try {
        markArchived(root, victim);
        purgeArchivedSession({ root, sessionId: victim });
        ledger.delete(victim);
        removed += 1;
      } catch (error) {
        try { ctx.logger?.warn?.(`${LOG} 子代理清理跳过 ${victim}：${String(error?.message ?? error)}`); } catch { /* 日志不能反过来搞砸清理 */ }
      }
    }
    if (removed > 0) {
      try { ctx.logger?.info?.(`${LOG} 已清理 ${removed} 个完成的子代理会话`); } catch { /* 同上 */ }
    }
    return removed;
  };

  /**
   * 一轮结束时清掉磁盘上所有子代理会话。
   *
   * 为什么不依赖「归档」：实测过，界面上对子代理点归档**不会写进 `archivedSessionIds`**
   * （63 条归档里没有一条是子代理，39 个子代理目录全部「未归档」），所以「归档了却还在列表里」
   * 不是幽灵，是归档这个动作对子代理压根没生效。既然如此，就别等它了：父会话这一轮结束时，
   * 直接把磁盘上属于子代理的会话删掉。
   *
   * 判据只用一样东西：目录名。用户自己的会话 id 一律带 `session-` 前缀，子代理的 id 是裸 uuid
   * （实测 39 个子代理目录全部不带前缀，44 个用户会话全部带前缀）。再加两道保险：账本里标着
   * live 的不动，purge 自己还会校验 id 合法性与路径边界。
   */
  const sweepDisk = () => {
    const root = homeRoot();
    if (root === '') return 0;
    let removed = 0;
    let projects;
    try {
      projects = readdirSync(join(root, 'sessions'), { withFileTypes: true });
    } catch {
      return 0;
    }
    for (const project of projects) {
      if (!project.isDirectory() || project.isSymbolicLink()) continue;
      let entries;
      try {
        entries = readdirSync(join(root, 'sessions', project.name), { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
        if (entry.name.startsWith('session-')) continue; // 带前缀的一律是用户会话，省一次解压
        if (ledger.get(entry.name)?.live === true) continue; // 还在跑
        // 名字不带前缀只是「可能」，真正认它得看 header：ACP 新建的用户会话也是裸 uuid。
        let header;
        try {
          header = readSessionHeader(join(root, 'sessions', project.name, entry.name));
        } catch {
          continue; // 读不出 header 就不动它
        }
        if (!looksLikeSubagent(header)) continue;
        // 账本只活在内存里，宿主一重启就空。所以再加一道按文件时间的保险：日志刚被写过，
        // 说明这个子代理可能还在跑（或刚跑完还没落盘完），这一轮先放过它。
        try {
          const age = Date.now() - statSync(join(root, 'sessions', project.name, entry.name, 'session.v4.jsonl.zstd')).mtimeMs;
          if (age < 60_000) continue;
        } catch {
          continue; // 读不到时间就当它不可判，下次再说
        }
        try {
          markArchived(root, entry.name);
          purgeArchivedSession({ root, sessionId: entry.name });
          ledger.delete(entry.name);
          removed += 1;
        } catch (error) {
          try { ctx.logger?.warn?.(`${LOG} 子代理清理跳过 ${entry.name}：${String(error?.message ?? error)}`); } catch { /* 日志不能反过来搞砸清理 */ }
        }
      }
    }
    // 顺手把归档表里的死引用摘掉：磁盘上已经找不到日志的 id 留在表里，只会在「已归档」那一栏
    // 变成一条点不开的空行。这不是删用户的记录，只是让列表和磁盘重新对上。
    try {
      for (const id of archivedIds(root)) {
        let found = false;
        for (const project of projects) {
          if (!project.isDirectory()) continue;
          try {
            statSync(join(root, 'sessions', project.name, id, 'session.v4.jsonl.zstd'));
            found = true;
            break;
          } catch { /* 这个项目下没有它 */ }
        }
        if (found) continue;
        try {
          purgeArchivedSession({ root, sessionId: id });
          removed += 1;
        } catch { /* 摘不掉就留着，下次再说 */ }
      }
    } catch { /* 归档表读不动就跳过这一步，不影响上面的删除 */ }
    if (removed > 0) {
      try { ctx.logger?.info?.(`${LOG} 已清理 ${removed} 个会话（子代理目录与归档死引用）`); } catch { /* 同上 */ }
    }
    return removed;
  };

  /** 一轮结束时清一遍：先扫磁盘上残留的子代理，再处理账本里静默的子树。 */
  const sweep = () => {
    let total = sweepDisk();
    for (const [id, entry] of [...ledger.entries()]) {
      if (entry.sub !== true) continue;
      if (entry.parent !== '' && ledger.get(entry.parent)?.sub === true) continue; // 交给它的父那棵一起清
      if (!quiet(id)) continue;
      total += reap(id);
    }
    return total;
  };

  const offCreated = ctx.on('session/created', session => remember(session));

  const offEvent = ctx.on('session/event', (session, event) => {
    try {
      const head = readHeader(session);
      if (head === null) return;
      const entry = row(head.id);
      if (head.sub) entry.sub = true;
      if (head.parent !== '') entry.parent = head.parent;
      const type = event?.type;
      if (type === 'turn/start') {
        entry.live = true;
        return;
      }
      if (type !== 'turn/end') return;
      entry.live = false;
      // 只由「父会话这一轮结束」触发：子代理自己的 turn/end 之后还可能被续问，不能立刻删。
      if (entry.sub !== true) sweep();
    } catch { /* 清收失败不该影响事件本身 */ }
  });

  return () => {
    try { offCreated?.(); } catch { /* 卸载不能抛 */ }
    try { offEvent?.(); } catch { /* 同上 */ }
    ledger.clear();
  };
}
