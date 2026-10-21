// 轮次状态判定测试（tests/turn-state.test.mjs）。
//
// 这一层决定「哪些块属于正在边想边说的那一轮」——判错的两种后果都很显眼：
// 多判一次，用户在流式输出期间看到一堆指向半截回答的按钮；少判一次，
// 该有的入口被永久挡住。所以把宿主的三种收尾方式（completed / interrupted /
// aborted）和日志残缺的边界全部钉死在这。
//
// 运行：node tests/turn-state.test.mjs
import assert from 'node:assert/strict'
import { openTurnStartSeq, openTurnStartOfSession, insideOpenTurn, turnFlagsOf } from '../src/turn-state.mjs'

const tests = []
function test(name, fn) { tests.push({ name, fn }) }

/** 造一串事件：seq 自增。 */
function seqEvents(list) {
  return list.map((e, i) => ({ seq: i, ...e }))
}

test('轮次已收尾：没有未结束轮次', () => {
  const ev = seqEvents([
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'user/message', data: {} },
    { type: 'assistant/message', data: {} },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ])
  assert.equal(openTurnStartSeq(ev), null)
})

test('轮次进行中：返回该轮起始 seq', () => {
  const ev = seqEvents([
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'assistant/message', data: {} },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    { type: 'turn/start', data: { turn: 2 } },
    { type: 'assistant/message', data: {} },
  ])
  assert.equal(openTurnStartSeq(ev), 3)
})

test('中断与用户中止同样是收尾', () => {
  for (const kind of ['interrupted', 'aborted']) {
    const ev = seqEvents([
      { type: 'turn/start', data: { turn: 7 } },
      { type: 'assistant/message', data: {} },
      { type: 'turn/end', data: { turn: 7, reason: { kind } } },
    ])
    assert.equal(openTurnStartSeq(ev), null, kind + ' 应视为已收尾')
  }
})

test('turn/end 的轮次号对不上：按未收尾处理（宁可多挡）', () => {
  const ev = seqEvents([
    { type: 'turn/start', data: { turn: 2 } },
    { type: 'assistant/message', data: {} },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ])
  assert.equal(openTurnStartSeq(ev), 0)
})

test('没有任何轮次事件：判定为无未结束轮次', () => {
  assert.equal(openTurnStartSeq([]), null)
  assert.equal(openTurnStartSeq([{ seq: 0, type: 'assistant/message', data: {} }]), null)
  assert.equal(openTurnStartSeq(null), null)
})

test('insideOpenTurn：起始 seq 及其之后算在内', () => {
  assert.equal(insideOpenTurn(5, 4), false)
  assert.equal(insideOpenTurn(5, 5), true)
  assert.equal(insideOpenTurn(5, 9), true)
  assert.equal(insideOpenTurn(null, 9), false)
})

test('活会话版本：倒序找到最后一个未收尾的 turn/start', () => {
  const raw = seqEvents([
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'assistant/message', data: {} },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    { type: 'turn/start', data: { turn: 2 } },
    { type: 'assistant/message', data: {} },
    { type: 'tool/call', data: {} },
  ])
  const session = {
    seq: raw.length - 1,
    surface: { nodes: raw.map(e => e.seq) },
    eventAt(seq) { return raw[seq] },
  }
  assert.equal(openTurnStartOfSession(session), 3)
})

test('活会话版本：收尾后返回 null', () => {
  const raw = seqEvents([
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'assistant/message', data: {} },
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ])
  const session = {
    seq: raw.length - 1,
    surface: { nodes: raw.map(e => e.seq) },
    eventAt(seq) { return raw[seq] },
  }
  assert.equal(openTurnStartOfSession(session), null)
})

test('活会话版本：缺 eventAt 时容坏成 null', () => {
  assert.equal(openTurnStartOfSession(null), null)
  assert.equal(openTurnStartOfSession({}), null)
  assert.equal(openTurnStartOfSession({ eventAt() { throw new Error('boom') } }), null)
})

// ── turnFlagsOf：哪一块该有「修改回复」入口 ───────────────────────────────

/** 一轮里有三条正文（两条过程碎句 + 最终回答），外加两个推理块。 */
function oneTurnTrilogy() {
  const events = seqEvents([
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'user/message', data: {} },
    { type: 'assistant/message', data: {} },   // seq 2：碎句一
    { type: 'tool/call', data: {} },
    { type: 'assistant/message', data: {} },   // seq 4：碎句二
    { type: 'tool/call', data: {} },
    { type: 'assistant/message', data: {} },   // seq 6：最终回答
    { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
  ])
  const blocks = [
    { seq: 2, blockIndex: 0, kind: 'reasoning' },
    { seq: 2, blockIndex: 1, kind: 'text' },
    { seq: 4, blockIndex: 0, kind: 'text' },
    { seq: 6, blockIndex: 0, kind: 'reasoning' },
    { seq: 6, blockIndex: 1, kind: 'text' },
  ]
  return { events, blocks }
}

test('正常收尾的一轮：只有最后一条正文是入口', () => {
  const { events, blocks } = oneTurnTrilogy()
  const flags = turnFlagsOf(events, blocks)
  assert.equal(flags.get('2:1').final, false, '过程碎句不给入口')
  assert.equal(flags.get('4:0').final, false, '过程碎句不给入口')
  assert.equal(flags.get('6:1').final, true, '该轮最后一条正文才给入口')
  assert.equal(flags.get('2:0').final, false, '推理块永不给入口')
  assert.equal(flags.get('6:0').final, false, '推理块永不给入口')
  for (const key of ['2:1', '4:0', '6:1']) {
    assert.equal(flags.get(key).turnOpen, false, '已收尾轮次不该标进行中：' + key)
  }
})

test('被暂停/出错的轮次：整轮都不给入口', () => {
  // 用户 2026-10-21 的明确要求：「边想边说途中暂停会导致出现修改对话的图标，
  // 但我不希望这样」。这条推翻了更早的口径（当时要的是"暂停之后能去改那条
  // 有问题的回答"）——暂停时那条回答还没写完，不该出现入口。
  for (const kind of ['interrupted', 'aborted', 'error']) {
    const { events, blocks } = oneTurnTrilogy()
    const last = events[events.length - 1]
    last.data = { turn: 1, reason: { kind } }
    const flags = turnFlagsOf(events, blocks)
    assert.equal(flags.get('6:1').final, false, kind + ' 轮次没写完，最后一条也不给入口')
    assert.equal(flags.get('2:1').final, false, kind + ' 轮次的过程碎句不给入口')
    assert.equal(flags.get('4:0').final, false, kind + ' 轮次的过程碎句不给入口')
    assert.equal(flags.get('2:0').final, false, kind + ' 轮次的推理块不给入口')
  }
})

test('未收尾的轮次：turnOpen 且不给入口', () => {
  const { events, blocks } = oneTurnTrilogy()
  const partial = events.slice(0, -1) // 去掉 turn/end
  const flags = turnFlagsOf(partial, blocks)
  for (const b of blocks) {
    const key = b.seq + ':' + b.blockIndex
    assert.equal(flags.get(key).turnOpen, true, '未收尾轮次必须标进行中：' + key)
    assert.equal(flags.get(key).final, false, '未收尾轮次不给入口：' + key)
  }
})

test('日志里没有轮次事件：退化成「最后一条正文可挂」', () => {
  const events = seqEvents([
    { type: 'user/message', data: {} },
    { type: 'assistant/message', data: {} },
    { type: 'assistant/message', data: {} },
  ])
  const blocks = [
    { seq: 1, blockIndex: 0, kind: 'text' },
    { seq: 2, blockIndex: 0, kind: 'text' },
  ]
  const flags = turnFlagsOf(events, blocks)
  assert.equal(flags.get('1:0').final, false, '不是最后一条')
  assert.equal(flags.get('2:0').final, true, '最后一条仍可挂，不能把入口全锁死')
})

test('块不在任何轮次里：不给入口', () => {
  const { events } = oneTurnTrilogy()
  const flags = turnFlagsOf(events, [{ seq: 900, blockIndex: 0, kind: 'text' }])
  assert.equal(flags.get('900:0').final, false)
  assert.equal(flags.get('900:0').turnOpen, false)
})

// ── 运行 ──────────────────────────────────────────────────────────────
let pass = 0
for (const t of tests) {
  try { t.fn(); console.log('  PASS  ' + t.name); pass += 1 }
  catch (error) {
    console.log('  FAIL  ' + t.name)
    console.log('        ' + String(error && error.message).split('\n').slice(0, 4).join('\n        '))
  }
}
console.log('\n' + (pass === tests.length ? `全部通过（${pass}）` : `失败 ${tests.length - pass} / ${tests.length}`))
process.exit(pass === tests.length ? 0 : 1)
