// 「这一轮跑完了没有」的判定层。
//
// 为什么需要单独一层：插件给每条助手正文块挂的是「修改回复」入口，而一个
// Turn 里模型会产出**多条** assistant 消息（工具调用之间的过程碎片 + 最后的
// 完整回答）。Turn 还在跑的时候，那些碎片块既不是最终回答、也还没在界面上
// 定型，给它们挂入口只会得到一个指向"不存在的那条回答"的按钮。
//
// 宿主的会话事件里有精确的轮次边界，不需要按 DOM 形状或文本特征去猜：
//   · `turn/start`（data.turn）开启一轮；
//   · `turn/end`（data.turn + reason.kind = completed|interrupted|aborted）收尾。
// 所以「某条消息是否还在未结束的轮次里」= 它是否位于最后一个 turn/start
// 之后、且该轮还没有 turn/end。
//
// 本文件零依赖纯函数，Node half 的在线与落盘两条读路径共用同一份实现，
// 避免两边判定漂移（本项目反复踩过的 bug 类型）。

/**
 * 找出「当前仍未结束的轮次」的起始 seq。
 *
 * 只关心最后一轮：更早的轮次要么已经 turn/end，要么被中断——两种情况下
 * 它们的块都已定型，不该继续被当成"正在边想边说"。
 *
 * 容坏：缺 seq / 类型不认识的事件直接跳过；`turn/end` 的 turn 号对不上
 * （日志残缺）时按"没收到收尾"处理——宁可多挡一次入口，也不给一个指向
 * 半截回答的按钮。
 *
 * @param {Array<{seq?: number, type?: string, data?: {turn?: number}}>} events
 *   按发生顺序排列的事件（readSessionEvents 的产物，或活会话按 seq 取出的视图）
 * @returns {number|null} 未结束轮次的起始 seq；没有未结束轮次时返回 null
 */
export function openTurnStartSeq(events) {
  if (Array.isArray(events) === false) return null
  let start = null
  let turn = null
  for (const ev of events) {
    if (ev === null || typeof ev !== 'object') continue
    const seq = ev.seq
    if (typeof seq !== 'number' || Number.isSafeInteger(seq) === false || seq < 0) {
      // 没有 seq 的事件（个别宿主版本不写）：只认类型，不参与定位。
      if (ev.type === 'turn/start') { start = null; turn = ev?.data?.turn ?? null }
      else if (ev.type === 'turn/end') { start = null; turn = null }
      continue
    }
    if (ev.type === 'turn/start') {
      start = seq
      turn = ev?.data?.turn ?? null
      continue
    }
    if (ev.type === 'turn/end' && start !== null) {
      const ended = ev?.data?.turn ?? null
      // turn 号缺失时按"就是当前这轮"处理；两者都有且不等则该 end 属于别的轮次。
      if (ended === null || turn === null || ended === turn) {
        start = null
        turn = null
      }
    }
  }
  return start
}

/**
 * 某个 seq 是否落在未结束的轮次里。
 * @param {number|null} openStart openTurnStartSeq 的返回值
 * @param {number} seq 目标事件 seq
 * @returns {boolean}
 */
export function insideOpenTurn(openStart, seq) {
  if (openStart === null || typeof seq !== 'number') return false
  return Number.isSafeInteger(seq) && seq >= openStart
}

/**
 * 活会话版本：直接给出未结束轮次的起始 seq。
 *
 * 活会话只暴露 `eventAt(seq)`，没有整份事件数组；轮次事件又不进 surface，
 * 所以只能按 seq 取值。为了别在长会话上每次都从 0 扫到尾，这里**倒序**找
 * 最后一个 `turn/start`（它总在末尾附近），再只检查它之后有没有 `turn/end`。
 *
 * @param {{eventAt?: Function, seq?: number, surface?: {nodes?: number[]}}} session
 * @returns {number|null} 未结束轮次的起始 seq；判定不了时返回 null（退化成"没有未结束轮次"）
 */
export function openTurnStartOfSession(session) {
  if (session === null || typeof session !== 'object') return null
  if (typeof session.eventAt !== 'function') return null
  let last = typeof session.seq === 'number' ? session.seq : -1
  const nodes = session?.surface?.nodes
  if (Array.isArray(nodes) === true && nodes.length > 0) {
    const tail = nodes[nodes.length - 1]
    if (typeof tail === 'number' && tail > last) last = tail
  }
  if (last < 0) return null

  const at = seq => {
    try { return session.eventAt(seq) } catch { return undefined }
  }

  let start = null
  for (let seq = last; seq >= 0; seq -= 1) {
    const ev = at(seq)
    if (ev !== null && ev !== undefined && ev.type === 'turn/start') { start = seq; break }
  }
  if (start === null) return null

  const turn = at(start)?.data?.turn ?? null
  for (let seq = start + 1; seq <= last; seq += 1) {
    const ev = at(seq)
    if (ev === null || ev === undefined) continue
    if (ev.type === 'turn/end') {
      const ended = ev?.data?.turn ?? null
      if (ended === null || turn === null || ended === turn) return null
    }
  }
  // 最后一轮已经开了、还没收尾 —— 这就是"正在边想边说"。
  return start
}

/**
 * 活会话的全量事件视图（seq 自 0 到末条）。
 *
 * `openTurnStartOfSession` 只回答"有没有未结束的轮次"，倒序扫描就够；
 * 但要判断"哪一条才是某轮的最终回答"，必须知道每一轮的收尾方式，只能全量。
 * 纯内存对象访问，两万条事件也在毫秒级，配合客户端的节流不成负担。
 *
 * @param {{eventAt?: Function, seq?: number, surface?: {nodes?: number[]}}} session
 * @returns {Array<{seq: number, type: string, data?: object}>}
 */
export function turnEventsOfSession(session) {
  const out = []
  if (session === null || typeof session !== 'object') return out
  if (typeof session.eventAt !== 'function') return out
  let last = typeof session.seq === 'number' ? session.seq : -1
  const nodes = session?.surface?.nodes
  if (Array.isArray(nodes) === true && nodes.length > 0) {
    const tail = nodes[nodes.length - 1]
    if (typeof tail === 'number' && tail > last) last = tail
  }
  if (last < 0) return out
  for (let seq = 0; seq <= last; seq += 1) {
    let ev
    try { ev = session.eventAt(seq) } catch { continue }
    if (ev === null || ev === undefined || typeof ev !== 'object') continue
    out.push({ seq, type: ev.type, data: ev.data })
  }
  return out
}

/** 该块是不是整份列表里最后一个正文块（轮次事件缺失时的兜底判据）。 */
function isLastText(list, target) {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i]?.kind === 'text') return list[i] === target
  }
  return false
}

/**
 * 给每个块标注「能不能挂修改入口」。
 *
 * 规则（真机 2026-10-21 用户确认过的口径）：
 *   · 一轮里模型会吐好几条正文——工具调用之间的过程碎句、以及最后那条完整
 *     回答。**只有最后一条**该有「修改回复」入口；过程碎句永久不给，用户原话
 *     是"他不应该出现在边想边说的途中，你给我汇报啊之类的那些里面"。
 *   · 轮次还没收尾（没有 turn/end）→ 整轮都不给，回答还没定下来。
 *   · 收尾方式**决定**给不给：只有正常完成（reason.kind === 'completed'）的轮次
 *     才给入口。被暂停（interrupted / aborted）或出错中断的轮次整轮都不给。
 *
 *     这条在 2026-10-21 被用户推翻过一次：更早的口径是「暂停/出错也照样给，
 *     用户要的正是暂停之后去改那条有问题的回答」。现在的口径相反——用户原话
 *     是「边想边说途中暂停会导致出现修改对话的图标，但我不希望这样，这很显然
 *     是个 bug」。暂停时那条回答还没写完，不该出现入口。以最新要求为准：
 *     下面 `final` 已经带上 `turn.completed`，收尾方式不是 completed 一律 false。
 *
 * 日志里没有任何 turn 事件（老会话、被裁剪）时退化成"最后一条正文可挂"，
 * 不能因为读不到轮次就把整条会话的入口全锁死。
 *
 * @param {Array<{seq?: number, type?: string, data?: object}>} events 按发生顺序
 * @param {Array<{seq: number, blockIndex: number, kind: string}>} blocks 待标注的块
 * @returns {Map<string, {turnOpen: boolean, final: boolean}>} 键是 "seq:blockIndex"
 */
export function turnFlagsOf(events, blocks) {
  const flags = new Map()
  const list = Array.isArray(blocks) ? blocks : []
  const keyed = b => String(b.seq) + ':' + String(b.blockIndex)

  // ── 1) 切出轮次，记下每一轮的 seq 范围与收尾方式 ─────────────────────
  const turns = []
  let current = null
  let sawTurnEvent = false
  for (const ev of Array.isArray(events) ? events : []) {
    if (ev === null || typeof ev !== 'object') continue
    if (ev.type === 'turn/start') {
      sawTurnEvent = true
      if (current !== null) turns.push(current)
      current = { turn: ev?.data?.turn ?? null, seqs: [], closed: false, completed: false }
      continue
    }
    if (ev.type === 'turn/end') {
      sawTurnEvent = true
      const ended = ev?.data?.turn ?? null
      if (current !== null && (ended === null || current.turn === null || ended === current.turn)) {
        current.closed = true
        current.completed = ev?.data?.reason?.kind === 'completed'
        turns.push(current)
        current = null
      }
      continue
    }
    if (current !== null && typeof ev.seq === 'number') current.seqs.push(ev.seq)
  }
  if (current !== null) turns.push(current)

  // ── 2) 每个块归属哪一轮 ──────────────────────────────────────────────
  const turnOfSeq = new Map()
  for (const turn of turns) {
    for (const seq of turn.seqs) turnOfSeq.set(seq, turn)
  }

  // ── 3) 每轮的最后一条正文（按块在页面/记录里的先后）──────────────────
  const lastTextOfTurn = new Map()
  for (const b of list) {
    if (b?.kind !== 'text') continue
    const turn = turnOfSeq.get(b.seq)
    if (turn === undefined) continue
    lastTextOfTurn.set(turn, keyed(b))
  }

  for (const b of list) {
    const turn = turnOfSeq.get(b.seq)
    if (turn === undefined) {
      flags.set(keyed(b), {
        turnOpen: false,
        final: sawTurnEvent === false && b?.kind === 'text' ? isLastText(list, b) : false,
      })
      continue
    }
    // `completed` 必须在判定里：只 closed 会把「暂停 / 出错」也当成正常收尾，
    // 表现就是边想边说途中一按暂停，那条没写完的回答旁边立刻冒出修改图标。
    const final = turn.closed === true && turn.completed === true
      && b?.kind === 'text' && lastTextOfTurn.get(turn) === keyed(b)
    flags.set(keyed(b), { turnOpen: turn.closed !== true, final })
  }
  return flags
}
