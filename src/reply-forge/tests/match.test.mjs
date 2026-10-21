// 页面块 ↔ 记录块 的配对测试（tests/match.test.mjs）。
//
// 这一层决定"这条回复能不能定位到记录里的那一条"。它的判定直接决定用户能
// 不能改这条回复，所以两个方向都得钉死：
//   · 该对上的必须对上，哪怕页面上渲染掉了 markdown 标记；
//   · 不该推断的不能硬配——推断出来的位置一旦被当成"挂入口的依据"，就会
//     先挂后撤（真机 2026-10-21：正常结束的回复按钮直接消失）。
//
// 运行：node tests/match.test.mjs
import assert from 'node:assert/strict'
import { matchBlocks } from '../client/record.mjs'

const tests = []
function test(name, fn) { tests.push({ name, fn }) }

test('纯文本一致：精确匹配', () => {
  const disk = [{ seq: 10, blockIndex: 1, text: '这是一条普通回复。' }]
  const out = matchBlocks(disk, ['这是一条普通回复。'])
  assert.equal(out[0].exact, true)
  assert.equal(out[0].seq, 10)
})

test('页面上渲染掉行内代码的反引号：仍算精确匹配', () => {
  // 记录里是 markdown 源码，页面上反引号不显示。旧实现只压缩空白，这类
  // 回复永远匹配不上，只能退成末尾对齐推断。
  const disk = [{ seq: 20, blockIndex: 1, text: '轮次收尾会写一条 `turn/end` 事件。' }]
  const out = matchBlocks(disk, ['轮次收尾会写一条 turn/end 事件。'])
  assert.equal(out[0].exact, true, '去掉标记后文本一致，就该算对上')
  assert.equal(out[0].seq, 20)
})

test('页面上渲染掉加粗与斜体：仍算精确匹配', () => {
  const disk = [{ seq: 30, blockIndex: 1, text: '这是**重点**，也是*强调*。' }]
  const out = matchBlocks(disk, ['这是重点，也是强调。'])
  assert.equal(out[0].exact, true)
})

test('内容确实不同：只能走末尾对齐兜底，标为推断', () => {
  const disk = [
    { seq: 40, blockIndex: 1, text: '磁盘上的第一条。' },
    { seq: 50, blockIndex: 1, text: '磁盘上的第二条。' },
  ]
  const out = matchBlocks(disk, ['页面上完全不同的内容。', '另一条也不同的内容。'])
  assert.equal(out[0].exact, false, '对不上就是推断')
  assert.equal(out[1].exact, false)
})

test('页面比记录多：多出来的那条配不上（返回 null）', () => {
  const disk = [{ seq: 60, blockIndex: 1, text: '记录里只有这一条。' }]
  const out = matchBlocks(disk, ['记录里只有这一条。', '页面新写、还没落盘的一条。'])
  assert.equal(out[0].exact, true)
  assert.equal(out[1], null, '没有可配对的块时必须是 null，不能硬凑')
})

test('同名多条按出现顺序一一对应，不重复占用', () => {
  const disk = [
    { seq: 70, blockIndex: 1, text: '收到。' },
    { seq: 80, blockIndex: 1, text: '收到。' },
  ]
  const out = matchBlocks(disk, ['收到。', '收到。'])
  assert.equal(out[0].seq, 70)
  assert.equal(out[1].seq, 80)
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
