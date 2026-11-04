import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInjectionReport, turnSlice } from '../src/injection-report.js';

// 「本轮注入」只读会话事件，所以它对事件形状的假设必须被钉住：宿主写 `system/message`、
// runtime-context 的 `user/message`、我们自己的 `plugin:dsh-codex-ui` 提醒，三者字段名不同，
// 一旦有哪一个改了，报告会静默变空——那正是这个功能唯一的价值所在。

const t = (offset, type, data) => ({ seq: offset, time: 1_700_000_000_000 + offset * 1000, type, data });

const events = [
  t(1, 'turn/start', { turn: 4 }),
  t(2, 'system/message', { turn: 4, step: 1, message: { role: 'system', content: [{ type: 'text', text: 'You are the assistant. ## 人设（本会话生效，硬设定） 以下是正文' }] } }),
  t(3, 'user/message', { content: [], source: { kind: 'runtime-context', form: 'snapshot', sections: [{ name: 'dsh-codex-ui:mode-policy', text: '当前模式：标准' }] } }),
  t(4, 'user/message', { content: [{ type: 'text', text: '## 人设仍在生效（本会话）' }], source: { kind: 'plugin:dsh-codex-ui', form: 'instructions' } }),
  t(5, 'request/header', { header: { tools: [{ name: 'ops_bash' }, { name: 'computer' }] } }),
];

test('turnSlice keeps only the latest turn', () => {
  const slice = turnSlice([t(0, 'turn/start', { turn: 3 }), t(1, 'turn/end', {}), ...events]);
  assert.equal(slice.length, 5);
  assert.equal(slice[0].data.turn, 4);
});

test('report separates the hard system prompt from runtime context and the reminder', () => {
  const report = buildInjectionReport(events);
  assert.equal(report.ok, true);
  assert.equal(report.turn, 4);
  assert.equal(report.system.hasPersonaSection, true);
  assert.ok(report.system.chars > 0);
  assert.deepEqual(report.sections.map(section => section.name), ['dsh-codex-ui:mode-policy']);
  assert.match(report.reminder.text, /人设仍在生效/);
  assert.deepEqual(report.tools, ['ops_bash', 'computer']);
  assert.equal(report.counts.sections, 1);
  assert.equal(report.counts.reminders, 1);
});

test('an empty session reports zeros instead of throwing', () => {
  const report = buildInjectionReport([]);
  assert.equal(report.ok, true);
  assert.equal(report.turn, null);
  assert.equal(report.system.chars, 0);
  assert.equal(report.system.hasPersonaSection, false);
  assert.deepEqual(report.sections, []);
  assert.equal(report.reminder, null);
});
