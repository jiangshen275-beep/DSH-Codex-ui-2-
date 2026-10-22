/**
 * The persona-switch notice: one row per switch, never on the first sighting.
 *
 * The bug this covers is behavioural, not structural: the persona is a `systemPrompt` section that
 * changes silently, so nothing in the log ever says the old instructions are gone. These cases pin
 * the one row that says it — and, just as important, that it does not fire at all when it would be
 * noise (first turn, unchanged mode, a child session, an unresolvable persona, the injection block
 * switched off).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { registerPersonaNotice } from '../src/persona-notice.js';
import { setInjection } from '../src/injection-state.js';
import { ensurePersonasDir, writePersona } from '../src/personas.js';

/** A throwaway `DSH_HOME`, removed even when the test throws. */
async function inTempHome(fn) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-persona-notice-'));
  const home = join(root, 'home');
  assert.ok(resolve(home).startsWith(resolve(tmpdir())), 'DSH_HOME 必须落在临时目录内，绝不能指向真实的 dsh-home');
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    await ensurePersonasDir('seed body');
    return await fn(home);
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Mount the notice with a mode resolver the test owns — `currentModeOf` is null until
 * `prompt-modes.apply` has run, so the real resolver cannot be exercised here.
 */
function mount() {
  const mode = { value: 'DeepSeek' };
  let handler = null;
  const ctx = {
    on: (name, fn) => {
      assert.equal(name, 'agent/pre-step', 'the notice listens on the step it can add a row to');
      handler = fn;
      return () => { handler = null; };
    },
    logger: { warn() {} },
  };
  registerPersonaNotice(ctx, () => mode.value);
  return {
    mode,
    dispose: () => { handler = null; },
    /** Run one pre-step and return the injected texts it appended. */
    async step(header = {}, messages = []) {
      const payload = { agent: { id: 'session-1', session: { id: 'session-1', header } } };
      const decision = await handler(payload, async () => ({ kind: 'enter', messages }));
      return decision.messages.slice(messages.length).map(message => message.content.map(block => block.text).join(''));
    },
  };
}

test('the first sighting records the persona and injects nothing', async () => {
  await inTempHome(async () => {
    const notice = mount();
    assert.deepEqual(await notice.step(), [], '会话第一轮没有任何「切换」可言');
    assert.deepEqual(await notice.step(), [], '同一个人设继续说，也不再提示');
  });
});

test('a switch injects exactly one row naming both personas and voiding the old one', async () => {
  await inTempHome(async () => {
    writePersona({ id: 'cat', name: '猫娘', description: '回答带喵', text: '你是一只猫。' });
    const notice = mount();
    await notice.step();
    notice.mode.value = 'cat';
    const first = await notice.step();
    assert.equal(first.length, 1, '切换人设只补一条');
    assert.match(first[0], /人设已切换/);
    assert.match(first[0], /「DeepSeek」/, '旧人设要被点名');
    assert.match(first[0], /「猫娘」/, '新人设要被点名');
    assert.match(first[0], /回答带喵/, '新设定要随行，模型不必去翻文件');
    assert.match(first[0], /一律作废/, '不给「作废」这两个字，历史里的旧契约仍然赢');
    assert.deepEqual(await notice.step(), [], '切换只提示一次，下一步不再重复');
  });
});

test('switching back is announced again', async () => {
  await inTempHome(async () => {
    writePersona({ id: 'cat', name: '猫娘', description: '回答带喵', text: '你是一只猫。' });
    const notice = mount();
    await notice.step();
    notice.mode.value = 'cat';
    await notice.step();
    notice.mode.value = 'DeepSeek';
    const back = await notice.step();
    assert.equal(back.length, 1, '每次切换都是一次切换');
    assert.match(back[0], /「猫娘」切换为「DeepSeek」/);
  });
});

test('a persona that no longer resolves is not announced', async () => {
  await inTempHome(async () => {
    const notice = mount();
    await notice.step();
    notice.mode.value = 'deleted-a-minute-ago';
    assert.deepEqual(await notice.step(), [], '目标人设读不出来时不要凭空编一条设定');
  });
});

test('a child session is never told about a switch', async () => {
  await inTempHome(async () => {
    writePersona({ id: 'cat', name: '猫娘', description: '回答带喵', text: '你是一只猫。' });
    const notice = mount();
    await notice.step({ origin: 'subagent' });
    notice.mode.value = 'cat';
    assert.deepEqual(await notice.step({ origin: 'subagent' }), [], '子代理继承父会话的人设，这不是一次切换');
  });
});

test('旧的 codexPrompt 开关不再能让人设静默', async () => {
  // codexPrompt 已从开关表撤掉，人设正文改由 persona-reminder 每轮直接送出，不再经过 systemPrompt
  // section，所以「被注入块挡住就没有段落可宣布」这个前提整条不存在了。旧配置里残留的 false 也不该
  // 让切换通知消失：真的消失了，用户会以为切换没发生，而这正是这条通知唯一的用处。
  await inTempHome(async () => {
    writePersona({ id: 'cat', name: '猫娘', description: '回答带喵', text: '你是一只猫。' });
    setInjection({ codexPrompt: false });
    try {
      const notice = mount();
      await notice.step();
      notice.mode.value = 'cat';
      assert.equal((await notice.step()).length, 1, '旧配置不该把切换通知吞掉');
    } finally {
      setInjection({});
    }
  });
});

test('a step whose decision carries no message list is left untouched', async () => {
  await inTempHome(async () => {
    const mode = { value: 'DeepSeek' };
    let handler = null;
    const ctx = { on: (name, fn) => { handler = fn; return () => {}; }, logger: { warn() {} } };
    registerPersonaNotice(ctx, () => mode.value);
    const payload = { agent: { id: 'session-1', session: { id: 'session-1', header: {} } } };
    const decision = await handler(payload, async () => ({ kind: 'skip' }));
    assert.deepEqual(decision, { kind: 'skip' }, '不是 enter 的决策原样返回');
  });
});
