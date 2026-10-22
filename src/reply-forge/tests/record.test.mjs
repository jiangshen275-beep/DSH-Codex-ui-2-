// 记录过期判据的单元测试（tests/record.test.mjs）。
//
// 这个文件专门盯 2026-10-16 真机 bug 的根因：**新会话全程提示「会话记录里没有
// 可定位的助手正文」**。老会话一切正常，新会话必挂——因为 v3.0 给在线模式
// 写了一条「live 永不重读」的捷径（当时的理由是「内存投影没有落盘滞后」），
// 而新会话第一次读到的快照必然是空的：宿主先把回复渲染进 DOM，稍后才把它
// 登记进活会话。空快照被当成终态缓存住，于是永远对不上。
//
// 直接 import 源码而不是构建产物：record.mjs 是纯逻辑（不碰 DOM），
// 单独测比隔着 client.js 快得多，出错也定位得准。
//
// 运行：node tests/record.test.mjs
import assert from 'node:assert/strict'
import { domSignatureOf, recordNeedsRefresh, normalizeText, matchBlocks } from '../client/record.mjs'

const tests = []
function test(name, fn) { tests.push({ name, fn }) }

const live = (blocks, extra = {}) => ({ mode: 'live', blocks, error: null, ...extra })
const disk = (blocks, extra = {}) => ({ mode: 'disk', blocks, error: null, ...extra })
const block = text => ({ seq: 100, blockIndex: 1, kind: 'text', text })

// ── domSignatureOf ─────────────────────────────────────────────────────────

test('签名：同一批正文 → 同一签名（可当 === 用）', () => {
  assert.equal(domSignatureOf(['甲', '乙']), domSignatureOf(['甲', '乙']))
})

test('签名：块数不变、正文变了 → 签名必须变（流式输出中途那次读取就靠它）', () => {
  assert.notEqual(domSignatureOf(['甲']), domSignatureOf(['甲 乙']))
})

test('签名：块数变了 → 签名必须变', () => {
  assert.notEqual(domSignatureOf(['甲']), domSignatureOf(['甲', '乙']))
})

test('签名：空白差异视为相同（与写入器指纹同一套归一化）', () => {
  assert.equal(domSignatureOf(['甲  乙\n']), domSignatureOf([' 甲 乙 ']))
})

test('签名：超长正文的尾部变化也要能发现（不能截断掉信息）', () => {
  const head = 'x'.repeat(9000)
  assert.notEqual(domSignatureOf([head + 'A']), domSignatureOf([head + 'B']))
})

test('签名：超长正文的中间变化也要能发现', () => {
  const before = 'a'.repeat(5000) + 'B' + 'c'.repeat(5000)
  const after = 'a'.repeat(5000) + 'D' + 'c'.repeat(5000)
  assert.notEqual(domSignatureOf([before]), domSignatureOf([after]))
})

test('签名：非数组输入降级为空列表签名，不抛', () => {
  assert.equal(domSignatureOf(null), domSignatureOf([]))
  assert.equal(domSignatureOf(undefined), domSignatureOf([]))
})

// ── recordNeedsRefresh：在线 ───────────────────────────────────────────────

test('在线 · 空快照 + 页面有块 → 必须重读（真机 bug 的正身）', () => {
  // v3.0 在这里返回 false：mode==='live' 直接短路，于是新会话永久卡住。
  assert.equal(recordNeedsRefresh(live([]), 1, domSignatureOf(['甲'])), true)
})

test('在线 · 快照与页面签名一致 → 不重读（不能把读记录打成轮询）', () => {
  const sig = domSignatureOf(['甲'])
  assert.equal(recordNeedsRefresh(live([block('甲')], { domSignature: sig }), 1, sig), false)
})

test('在线 · 块数相同但正文变了 → 必须重读（v3.0 漏掉的正是这一条）', () => {
  const before = domSignatureOf(['甲'])
  const after = domSignatureOf(['甲 乙'])
  assert.equal(recordNeedsRefresh(live([block('甲')], { domSignature: before }), 1, after), true)
})

test('在线 · 老缓存没记签名 → 重读一次补上基准', () => {
  assert.equal(recordNeedsRefresh(live([block('甲')]), 1, domSignatureOf(['甲'])), true)
})

test('在线 · 没给签名 → 不重读（调用方没准备好基准时不乱读）', () => {
  assert.equal(recordNeedsRefresh(live([block('甲')], { domSignature: 'x' }), 1, undefined), false)
})

// ── recordNeedsRefresh：落盘 ───────────────────────────────────────────────

test('落盘 · 页面块数多于记录 → 重读（宿主落盘滞后约 200ms）', () => {
  assert.equal(recordNeedsRefresh(disk([block('甲')]), 2, domSignatureOf(['甲', '乙'])), true)
})

test('落盘 · 正文变了（签名不同）→ 重读', () => {
  // 2026-10-22 真机推翻的旧口径。旧规则只比块数（「页面块数 > 记录块数」），
  // 而页面只渲染最近十条、记录有一千多条，这条判据在真实会话里几乎从不成立，
  // 缓存于是永不更新：新回复只能落到「末尾对齐」的推断上，被错配到上一轮的
  // 块——一条正常 completed 的回复因此被判成上一轮（用户按了停止）的碎句，
  // final=false，入口整个消失。
  //
  // 早先不用签名的理由是「流式期间每帧都变，会把读记录打成高频请求」。这个
  // 担心现在由调用方兜住：RECORD_REFRESH_MIN_GAP_MS 最小间隔 + 连续无果退避 +
  // 页面不再变化就停手。陈旧记录造成的错配比多读几次严重得多。
  const rec = disk([block('甲')], { domSignature: domSignatureOf(['甲']) })
  assert.equal(recordNeedsRefresh(rec, 1, domSignatureOf(['甲 乙'])), true)
})

test('落盘 · 签名一致且块数没涨 → 不重读（必须收敛）', () => {
  const rec = disk([block('甲')], { domSignature: domSignatureOf(['甲']) })
  assert.equal(recordNeedsRefresh(rec, 1, domSignatureOf(['甲'])), false)
})

test('落盘 · 页面块数少于记录但签名变了 → 重读', () => {
  // 页面 1 块、记录 2 块，块数判据永远为假；只有签名能发现页面换成了别的内容，
  // 那时记录可能已经涨过一轮（历史被虚拟化折叠的会话里就是这样）。
  const rec = disk([block('甲'), block('乙')], { domSignature: domSignatureOf(['甲']) })
  assert.equal(recordNeedsRefresh(rec, 1, domSignatureOf(['乙'])), true)
})

// ── recordNeedsRefresh：公共分支 ───────────────────────────────────────────

test('页面一个助手块都没有 → 不重读（没东西可定位）', () => {
  assert.equal(recordNeedsRefresh(null, 0, ''), false)
  assert.equal(recordNeedsRefresh(live([], { domSignature: 'x' }), 0, 'x'), false)
})

test('记录没拉到过 → 重读', () => {
  assert.equal(recordNeedsRefresh(null, 1, domSignatureOf(['甲'])), true)
  assert.equal(recordNeedsRefresh(undefined, 1, domSignatureOf(['甲'])), true)
})

test('读失败 → 重读（新会话「还没落盘」时就是这条，要能自愈）', () => {
  assert.equal(recordNeedsRefresh({ mode: 'disk', blocks: [], error: 'session log not found' }, 1, 'x'), true)
})

test('normalizeText：空白归一（签名与指纹共用）', () => {
  assert.equal(normalizeText(' 甲\n乙 '), '甲 乙')
})

// ── matchBlocks：前缀认领（2026-10-22 真机）────────────────────────────────
//
// 页面上的块会被附件卡片、图片、折叠区切断，textContent 只剩开头一段，而磁盘
// 里是完整正文。全等和去空白全等都落空时，以前只能落到「末尾对齐」去猜，
// 一猜就可能配到上一轮——一条 completed 的回复因此被判成上一轮（用户按了停止）
// 的碎句，入口整个消失。

test('页面块只剩磁盘正文的开头 → 认领到那一条，而不是猜尾巴', () => {
  const diskBlocks = [
    { seq: 7051, blockIndex: 0, kind: 'text', text: '找到了——那行 `alpha_composite` 之后没有重建 draw，所以底部那行字一直没出来。' },
    { seq: 7123, blockIndex: 0, kind: 'text', text: '嗯，封面好啦。1920×1080，标准 16:9，PNG。右边那五根柱子就是插件的推理强度刻度，最后一根紫色带星的顶上飘着星芒。' },
  ]
  const m = matchBlocks(diskBlocks, ['嗯，封面好啦。1920×1080，标准 16:9，PNG。'])
  assert.equal(m[0]?.seq, 7123, '必须认领到真正对应的那一条')
  assert.equal(m[0]?.exact, false, '前缀不是全等，要如实标成推断')
})

test('页面块比磁盘正文长（磁盘那条被截断）也认', () => {
  const diskBlocks = [{ seq: 9001, blockIndex: 0, kind: 'text', text: '这一条回复在记录里只存了开头这一段' }]
  const m = matchBlocks(diskBlocks, ['这一条回复在记录里只存了开头这一段，后面还有好几句页面上的文字'])
  assert.equal(m[0]?.seq, 9001)
})

test('短块之间不靠前缀互相认领（精确匹配优先，避免把整页配乱）', () => {
  const diskBlocks = [
    { seq: 1, blockIndex: 0, kind: 'text', text: '好的' },
    { seq: 2, blockIndex: 0, kind: 'text', text: '嗯' },
  ]
  const m = matchBlocks(diskBlocks, ['好的'])
  assert.equal(m[0]?.seq, 1, '短文本仍走精确匹配')
})

// ── 跑 ─────────────────────────────────────────────────────────────────────

let failed = 0
for (const t of tests) {
  try {
    t.fn()
    console.log('  PASS  ' + t.name)
  } catch (error) {
    failed += 1
    console.log('  FAIL  ' + t.name)
    console.log('        ' + String((error && error.message) || error))
  }
}
console.log(failed === 0 ? `\n全部通过（${tests.length}）` : `\n失败 ${failed} / ${tests.length}`)
process.exit(failed === 0 ? 0 : 1)
