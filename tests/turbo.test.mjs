// Host-half regression: policy text shape, per-session injection discipline, and
// the turbo endpoint's read/update contract. Uses only built-ins so it runs from
// the workspace (the profile's node_modules resolves `zod`; the workspace does not).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { policyText, OFF_NOTICE, LIGHTNING_POLICY, lightningNudge, tokenMultiplier, ULTRA_POLICY, SUBAGENT_GUARD, FACT_CHECK, SUPERFAST_POLICY, PRECEDENCE, MANDATE, WORK_PERSONA, CHAT_PERSONA, LANGUAGE_POLICY, INJECTION_BLOCKS } from '../src/turbo-policy.js';
import { createPolicyInjector, registerTurbo, TURBO_EVENT, TURBO_PATH } from '../src/turbo.js';

function fakeCtx({ context = false } = {}) {
  const listeners = new Map();
  const routes = [];
  const logs = [];
  const contexts = [];
  const effects = [];
  return {
    routes,
    logs,
    contexts,
    ...(context ? { systemPrompt: { context(entry) {
      contexts.push(entry);
      return () => { const index = contexts.indexOf(entry); if (index >= 0) contexts.splice(index, 1); };
    } } } : {}),
    dispose() { for (const cleanup of effects.splice(0)) cleanup(); },
    emitEvent(session, event) {
      for (const handler of listeners.get('session/event') ?? []) handler(session, event);
    },
    get listenerCount() { let total = 0; for (const chain of listeners.values()) total += chain.length; return total; },
    logger: { warn() {}, info(message) { logs.push(message); } },
    on(name, handler) {
      const chain = listeners.get(name) ?? [];
      chain.push(handler);
      listeners.set(name, chain);
      return () => {
        const current = listeners.get(name) ?? [];
        const index = current.indexOf(handler);
        if (index >= 0) current.splice(index, 1);
      };
    },
    fire(name, payload) {
      const chain = listeners.get(name) ?? [];
      if (chain.length === 0) throw new Error(`no listener for ${name}`);
      // The real bus is a waterfall: a handler's `next` resolves the rest of the chain, so a later
      // listener sees what earlier ones appended.
      const run = index => async () => (index >= chain.length
        ? { kind: 'enter', messages: [] }
        : chain[index](payload, run(index + 1)));
      return run(0)();
    },
    inject(names, callback) {
      callback({ connection: { fetch: { register: route => { routes.push(route); return () => {}; } } } });
      return () => {};
    },
    effect(factory) { const cleanup = factory(); if (typeof cleanup === 'function') effects.push(cleanup); return () => {}; },
  };
}

/**
 * Write the effort record the way its owner (`dsh-codex-ui-reasoning`) does, because this plugin never
 * writes it any more.
 *
 * Shape: `parseEffort` (src/turbo.js:109-123) is the reader, so `{ sessions: { [id]: { lightning, ultra,
 * superfast, at } } }` with three booleans and a finite stamp — and no `pending` field, because
 * `emptyEffortState` (src/turbo.js:66-68) has none. Bytes: `writeRecordFile` (src/turbo.js:194-200)
 * writes `JSON.stringify(payload, null, 2)` plus a trailing newline to a temp file in the same directory
 * and renames it into place. The rename is load-bearing here too: the reader caches on
 * `ino:mtimeMs:size` (src/turbo.js:179), so an in-place rewrite of the same length could land inside one
 * mtime tick and be served stale, while a rename always yields a new inode.
 */
function writeEffortRecord(home, rows) {
  const dir = join(home, 'storages');
  const file = join(dir, 'codex-ui-effort.json');
  mkdirSync(dir, { recursive: true });
  const sessions = Object.fromEntries(Object.entries(rows).map(([id, flags]) => [id, {
    lightning: flags.lightning === true,
    ultra: flags.ultra === true,
    superfast: flags.superfast === true,
    at: Date.now(),
  }]));
  const temp = `${file}.test.tmp`;
  writeFileSync(temp, `${JSON.stringify({ sessions }, null, 2)}\n`, 'utf8');
  renameSync(temp, file);
  return file;
}

test('policy text is empty only when both switches are off', () => {
  assert.equal(policyText(), '');
  assert.equal(policyText({ ultra: false, lightning: false }), '');
  const both = policyText({ ultra: true, lightning: true });
  assert.ok(both.includes(ULTRA_POLICY) && both.includes(LIGHTNING_POLICY));
  // The tail block closes the contract for a delegated child, and only for one.
  assert.ok(policyText({ ultra: true, lightning: true, subagent: true }).endsWith(SUBAGENT_GUARD));
  assert.doesNotMatch(both, /Ignore every rule above about fan-out/, 'a parent must not be told to ignore fan-out');
});

test('lightning routes through hidden A/B/C channel instead of ordinary forced delegation', () => {
  const text=policyText({lightning:true});
  assert.match(text,/首选flash_start提交2–4条独立任务/);
  assert.match(text,/flash_control reply/);
  assert.match(text,/整理者S只对回传数据轻量汇总/);
  assert.doesNotMatch(text,/dispatch two subagents on two different angles|Delegation is MANDATORY/);
  assert.doesNotMatch(text,/## 先判后派/);
  assert.match(text,/旧的固定两分支、只调用一次flash_run/);
});

test('Ultra demands a wider read of the request, not just stricter reporting', () => {
  // Human side: read the real need and the person behind it, without performing diligence.
  assert.match(ULTRA_POLICY, /Read the request before answering it/);
  assert.match(ULTRA_POLICY, /what they actually need, not only what they typed/);
  assert.match(ULTRA_POLICY, /Match their register/);
  assert.match(ULTRA_POLICY, /no closing offer of further help/);
  // Breadth: five angles, self-attack, and the objections answered inline.
  assert.match(ULTRA_POLICY, /Think wider than the question/);
  assert.match(ULTRA_POLICY, /the strongest alternative you rejected/);
  assert.match(ULTRA_POLICY, /Attack your own answer before sending it/);
  assert.match(ULTRA_POLICY, /never in a separate "possible concerns" section/);
  assert.match(ULTRA_POLICY, /Empathy here means being accurate about their situation, not comfort phrases/);
  assert.match(ULTRA_POLICY, /Dispose of the decision, do not park it/);
  // Delivery: the thinking finishes before they read anything, and the answer arrives whole.
  assert.match(ULTRA_POLICY, /Think it through, then say it once/);
  assert.match(ULTRA_POLICY, /Finish the thinking before the first sentence they read/);
  assert.match(ULTRA_POLICY, /The turn ends with the answer; it does not begin with a notice/);
  assert.match(ULTRA_POLICY, /One delivery:/);
  assert.match(ULTRA_POLICY, /Nothing is sent after the answer either/);
  // Exactly one visible message per turn: no status lines, no progress notes, no hold-ons.
  assert.match(ULTRA_POLICY, /A turn produces exactly one user-visible message: the finished answer/);
  assert.match(ULTRA_POLICY, /they do not license a status line, a progress note, or a hold-on message/);
  assert.match(ULTRA_POLICY, /you stay silent in the chat until the answer is ready/);
  // The escape hatch that produced multi-message turns must not come back: a self-judged
  // "long turn" licence is exactly what turned the exception into the default path.
  assert.doesNotMatch(ULTRA_POLICY, /may carry one short status line/);
  assert.doesNotMatch(ULTRA_POLICY, /genuinely long/);
  // The machinery stays invisible, and "one message" must not be read as "one paragraph":
  // a real reply (157 characters, opening with the delegation decision) was what prompted both.
  assert.match(ULTRA_POLICY, /Never mention the machinery in the answer: no subagents, no "I delegated this"/);
  assert.match(ULTRA_POLICY, /One message is not one line\./);
  assert.match(ULTRA_POLICY, /a greeting is a sentence, but anything substantive gets the whole treatment/);
  // Ultra's own numbering is structure the model reads; a collision has bitten twice.
  const ultraNumbers = [...ULTRA_POLICY.matchAll(/^(\d+)\./gm)].map(match => Number(match[1]));
  assert.deepEqual(ultraNumbers, Array.from({ length: ultraNumbers.length }, (_, index) => index + 1), 'Ultra numbering must be 1..n with no gaps or repeats');
  // Defensibility keeps the rules that were already load-bearing.
  assert.match(ULTRA_POLICY, /Leave nothing to fault/);
  assert.match(ULTRA_POLICY, /Root cause first/);
  assert.match(ULTRA_POLICY, /Never fix the test/);
  // Depth is not rationed: the session accepts the cost and never economises on checks.
  assert.match(ULTRA_POLICY, /Depth is not rationed/);
  assert.match(ULTRA_POLICY, /does not trade correctness for tokens/);
  assert.match(ULTRA_POLICY, /if one more file, run, or reproduction would change the answer, do it/);
  // Format never fights the active persona.
  assert.match(ULTRA_POLICY, /the persona wins on form and Ultra wins on substance/);
});

test('hidden Lightning requires complete tasks, separate ownership and honest partial results', () => {
  assert.match(LIGHTNING_POLICY,/materials/);
  assert.match(LIGHTNING_POLICY,/write_paths为不重叠绝对路径/);
  assert.match(LIGHTNING_POLICY,/所有Agent无父历史/);
  assert.match(LIGHTNING_POLICY,/失败\/partial\/未验证项必须保留/);
  assert.match(LIGHTNING_POLICY,/不能重复执行已分派内容/);
  assert.match(lightningNudge(1,1),/首轮flash_start派2–4个/);
  assert.doesNotMatch(lightningNudge(1,1),/dispatch two subagents/);
  assert.match(LIGHTNING_POLICY, /短定位文件与接口后尽早派工/);
  assert.match(LIGHTNING_POLICY, /每个分支只交一个小验收产物/);
  assert.match(LIGHTNING_POLICY, /每轮整合\/验证后重新拆分/);
  assert.match(LIGHTNING_POLICY, /max-tokens仍算失败，不自动重试/);
  assert.match(LIGHTNING_POLICY, /先读现存文件和已交artifact/);
  assert.match(lightningNudge(1, 3), /只补剩余/);
  assert.match(lightningNudge(1, 3), /不凑分工/);
});

test('Lightning gates public reporting per run without delaying artifact acceptance or help', () => {
  assert.match(LIGHTNING_POLICY, /收到artifact即可使用，不等整理/);
  assert.match(LIGHTNING_POLICY, /有空槽用flash_control add追加1–4条/);
  assert.match(LIGHTNING_POLICY, /collecting尚未收齐时，artifact\/branch终态仅内部消化、提前验收与续派/);
  assert.match(LIGHTNING_POLICY, /禁止每来一个分支就面向用户重复总结/);
  assert.match(LIGHTNING_POLICY, /不要求每次工具调用前发正文进度/);
  assert.match(LIGHTNING_POLICY, /help即时回复，仅就所需决定交流，不复述产物/);
  assert.match(LIGHTNING_POLICY, /run-complete\/run-failed或该run reporting phase为ready后/);
  assert.match(LIGHTNING_POLICY, /统一向用户报告一次，只补此前已公开内容的变化/);
  assert.match(LIGHTNING_POLICY, /旧run的ready不放行新run/);
  assert.match(LIGHTNING_POLICY, /single-final整理须汇齐全部结果与artifact/);
  assert.match(LIGHTNING_POLICY, /deliveredFacts仅内部送达不是已向用户说/);
  assert.match(lightningNudge(2, 3), /collecting仅内部验收续派\/help决定.*ready统一报告一次/);
});

test('Lightning collecting suppresses internal recaps, not direct user answers or final delivery', () => {
  const text = policyText({ lightning: true });
  assert.match(text, /汇报闸门仅抑制内部artifact\/branch终态的逐份复述，不是禁止所有沟通/);
  assert.match(text, /collecting期间用户直接提问、催问或要求解释，必须及时给出非空答复/);
  assert.match(text, /按已确认事实回应当下问题，未完成与未验证项如实说明/);
  assert.match(text, /不等ready、不以静默或“无新增”代替回答/);
  assert.match(text, /这类答复不放行其余内部产物的逐份总结，也不冒充最终交付/);
  assert.match(text, /最终交付必须非空，包含结果与实际验证/);
  assert.match(text, /collecting不等于禁止所有沟通/);
  const nudge = lightningNudge(3, 5);
  assert.match(nudge, /闸门仅抑制内部artifact逐份复述/);
  assert.match(nudge, /collecting不等于禁止所有沟通/);
  assert.match(nudge, /用户直接提问\/催问\/要解释必须及时非空答复，不等ready/);
  assert.match(nudge, /父给非空最终回答/);
});

test('Chinese is the default for every armed session, and yields when another plugin or the host sets a language', () => {
  // Language rides directly after precedence, but as this plugin's own default: the clause below hands the
  // decision to another plugin or the host when their prompt names a different output language.
  const text = policyText({ chinese: true });
  assert.match(text, /Language \(active\) — Chinese throughout/);
  assert.match(text, /Think in Chinese and answer in Chinese, every turn of this session/);
  assert.match(text, /Reason in Chinese directly/);
  assert.match(text, /never leave an English reasoning trace/);
  // Code and identifiers stay verbatim, and nothing is said twice.
  assert.match(text, /Keep code, identifiers, paths, commands, log lines, API names, and quoted source exactly as they are/);
  assert.match(text, /No bilingual echo/);
  // The clause now states its own limits: a user request still wins, and so does another plugin's language.
  assert.match(text, /Answer in Chinese by default/);
  assert.match(text, /does not override a language another plugin or the host explicitly sets/);
  assert.match(text, /an explicit request this turn for another language also wins/);
  // And it must no longer claim to be unconditional.
  assert.doesNotMatch(text, /even when the question, a file, or a tool result arrives in another language/);
  // Order: precedence, language, then the persona and the switches. Asserted on the full
  // block, because the language-only block has no later sections to compare against.
  const full = policyText({ persona: 'work', ultra: true, lightning: true, chinese: true });
  assert.ok(full.indexOf('Language (active)') < full.indexOf('Persona (active)'), 'language before persona');
  assert.ok(full.indexOf('Language (active)') < full.indexOf('Ultra Mode'), 'language before Ultra');
  // The preamble is retired (covered above too); indexOf === -1 must not masquerade as ordering.
  assert.ok(!full.includes(PRECEDENCE), 'the retired precedence block stays absent');
  // Callers that arm nothing still get an empty block; the host is what forces the flag.
  assert.equal(policyText(), '');
});

test('有屏幕就直接动手：默认就注入，关掉才不注入', () => {
  // 这一块是「什么时候该你亲自操作」的说明书。工具本身一直挂着，缺的从来是这句指令——
  // 实测里模型会回头让用户去点，就是因为它只看到工具能做什么，没看到自己该做什么。
  const on = policyText({ chinese: true });
  assert.ok(on.includes('有屏幕就直接动手'), '默认开启时要注入');
  assert.ok(on.includes('别写「请你点击」'), '要明确禁止把操作推回给用户');
  const off = policyText({ chinese: true, injection: { computerFirst: false } });
  assert.ok(!off.includes('有屏幕就直接动手'), '关掉后一个字都不该留');
});

test('事实核查、先判后派、想完再答已退役：任何模式都不再注入', () => {
  // 用户 2026-11-04 要求撤掉这三项：设置里的开关移除，文本也不再进提示词。
  // 策略前言与强制约束更早退役，同样不该回来。
  assert.equal(policyText(), '', 'an unarmed session still gets nothing');
  for (const flags of [{ chinese: true }, { ultra: true }, { lightning: true }, { superfast: true }, { persona: 'work' }, { persona: 'chat' }]) {
    const text = policyText(flags);
    assert.ok(!text.includes(FACT_CHECK), `事实核查不该再注入：${JSON.stringify(flags)}`);
    assert.ok(!text.includes('## 先判后派'), `先判后派不该再注入：${JSON.stringify(flags)}`);
    assert.ok(!text.includes('## 边想边说'), `想完再答不该再注入：${JSON.stringify(flags)}`);
    assert.ok(!text.includes(PRECEDENCE), `策略前言不该再出现：${JSON.stringify(flags)}`);
    assert.ok(!text.includes(MANDATE), `强制约束不该再出现：${JSON.stringify(flags)}`);
  }
  // 开关表里也不该再有这三项：旧配置里的键会被丢掉，不会报错。
  const ids = INJECTION_BLOCKS.map(block => block.id);
  for (const gone of ['factCheck', 'triage', 'thinkingAloud']) {
    assert.ok(!ids.includes(gone), `开关表不该再有 ${gone}`);
  }
});

test('the injected contract stays free of accidental duplication', () => {
  // The cap is a duplication alarm, not a ration: the session deliberately trades tokens for
  // effect, so it sits well above what the rules need. It moves only when rules are added on
  // purpose — 4000 -> 4400 for the invisible-machinery and length-follows-the-question rules,
  // and 10_000 -> 11_000 when the delegation mandate became the default (measured 10_223): the
  // mandate plus its self-check are rules added on purpose, after an armed session produced zero
  // delegations across 539 tool calls.
  // 10_000 -> 12_000 when the mandatory fact-check block landed: rules added on purpose at the user's
  // request (check the fact, search the web when the machine cannot answer, ask the user when the
  // search cannot), measured 11_182 with the block at 246 chars. The pre-block weight was 10_934.
  // 13_500 -> 14_500 for the Superfast tree, measured 14_264: the tier stamping, the self-contained
  // child prompt contract, and the per-tier integration rule are rules added on purpose, and the cap is
  // a duplication alarm rather than a ration. A rule added on purpose moves it; a paraphrase does not.
  // 12_000 -> 13_000 and 14_500 -> 16_000 for the two completion rules the user asked for: the parent
  // answers only after every child is back and the work has been checked by hand, and a new development
  // reopens the fan-out because "at least two" was always a floor rather than a budget. Measured 12_686
  // and 15_715 after both landed.
  assert.ok(ULTRA_POLICY.length < 4_400, `Ultra block is ${ULTRA_POLICY.length} chars`);
  const heaviest = policyText({ persona: 'chat', ultra: true, lightning: true });
  assert.ok(heaviest.length < 13_000, `full block is ${heaviest.length} chars`);
  // The cap must be measured on the block a real session actually carries, and every armed session is
  // forced to Chinese — `FORCE_CHINESE` in turbo.js. The earlier version of this assertion omitted
  // `chinese`, so it was weighing a block no session ever receives: 15_715 here against 16_264 on disk.
  // 16_000 -> 17_000 with `chinese` included, still a duplication alarm rather than a ration.
  const largest = policyText({ persona: 'chat', ultra: true, lightning: true, superfast: true, chinese: true });
  assert.ok(largest.length < 17_000, `superfast block is ${largest.length} chars`);
  // No rule text may be repeated verbatim between the two mode blocks.
  const sentences = heel => heel.split(/(?<=\.)\s+/).map(s => s.trim()).filter(s => s.length > 40);
  const overlap = sentences(ULTRA_POLICY).filter(line => sentences(LIGHTNING_POLICY).includes(line));
  assert.deepEqual(overlap, [], 'Ultra and Lightning must not restate each other');
});

test('the cost figure shown to the client is read back out of the contract', () => {
  assert.deepEqual(tokenMultiplier(), { value: null, exact: false });
  // The armed contract itself must state the same number the interface advertises.
  assert.doesNotMatch(LIGHTNING_POLICY, /at least 1\.5x the tokens/);
});

test('injector appends one message per session, only when the text changes', async () => {
  const ctx = fakeCtx();
  let text = 'POLICY-A';
  const dispose = createPolicyInjector(ctx, () => text);
  const payload = { agent: { id: 'session-1' }, signal: { aborted: false } };

  const first = await ctx.fire('agent/pre-step', payload);
  assert.equal(first.messages.length, 1);
  const message = first.messages[0];
  assert.equal(message.role, 'user');
  assert.equal(typeof message.id, 'string');
  assert.ok(message.id.length > 0);
  assert.deepEqual(message.content, [{ type: 'text', text: 'POLICY-A' }]);
  // Format v4 refuses the retired `kind: 'plugin'` wrapper: a third-party producer
  // must state its own `plugin:<name>` kind and drop the `plugin` field.
  assert.equal(message.source.kind, 'plugin:dsh-codex-ui');
  assert.equal(message.source.form, 'instructions');
  assert.ok(!('plugin' in message.source));

  // Same text again: the engine would persist a second copy, so it must not.
  const second = await ctx.fire('agent/pre-step', payload);
  assert.equal(second.messages.length, 0);

  text = 'POLICY-B';
  const third = await ctx.fire('agent/pre-step', payload);
  assert.equal(third.messages.length, 1);

  // Another session is a different scope and gets its own copy.
  const other = await ctx.fire('agent/pre-step', { agent: { id: 'session-2' }, signal: { aborted: false } });
  assert.equal(other.messages.length, 1);

  dispose();
  assert.equal(ctx.listenerCount, 0);
});

const policyRow = text => ({ id: `row-${text}`, role: 'user', content: [{ type: 'text', text }], source: { kind: 'plugin:dsh-codex-ui', form: 'instructions' } });
const sessionWith = log => ({ deriveMessages: () => log });

test('a step that aborted before the log write restates the contract instead of losing it', async () => {
  const ctx = fakeCtx();
  const log = [];
  const agent = { id: 'session-1', session: sessionWith(log) };
  createPolicyInjector(ctx, () => 'POLICY-A');
  const asked = await ctx.fire('agent/pre-step', { agent, turn: 1, step: 1, signal: { aborted: false } });
  assert.equal(asked.messages.length, 1, 'the row is requested for this step');
  // dsh-agent-loop holds six abort checks between `pre-step` and `session.append`, so a step can be
  // cancelled after the row was decided and before it was logged. The contract has to be re-stated
  // then: believing a marker instead would strip this session of its policy for the whole process.
  const retried = await ctx.fire('agent/pre-step', { agent, turn: 2, step: 1, signal: { aborted: false } });
  assert.equal(retried.messages.length, 1, 'the session keeps its contract');
});

test('the log, the pending decision and the inbox are consulted before injecting', async () => {
  // The log already carries the current text: a restarted host must not repeat it.
  const restarted = fakeCtx();
  createPolicyInjector(restarted, () => 'POLICY-A');
  const carried = await restarted.fire('agent/pre-step', {
    agent: { id: 'session-1', session: sessionWith([policyRow('POLICY-A')]) }, signal: { aborted: false },
  });
  assert.equal(carried.messages.length, 0, 'process memory is not the source of truth');

  // Re-arming a switch restates its contract even though an older row carried the same text.
  const rearmed = fakeCtx();
  createPolicyInjector(rearmed, () => 'POLICY-A');
  const restated = await rearmed.fire('agent/pre-step', {
    agent: { id: 'session-1', session: sessionWith([policyRow('POLICY-A'), policyRow('POLICY-B')]) }, signal: { aborted: false },
  });
  assert.equal(restated.messages.length, 1, 'the newest row decides, not any older match');

  // A row already queued in the inbox is going to be delivered; another copy would double it.
  const queued = fakeCtx();
  createPolicyInjector(queued, () => 'POLICY-A');
  const inboxed = await queued.fire('agent/pre-step', {
    agent: { id: 'session-1', session: sessionWith([]), inbox: { nextStep: [policyRow('POLICY-A')] } }, signal: { aborted: false },
  });
  assert.equal(inboxed.messages.length, 0, 'an inboxed row already carries the text');

  // Same for a decision the framework assembled with our row already inside it.
  let handler = null;
  const direct = { logger: { warn() {} }, on(name, fn) { void name; handler = fn; return () => {}; } };
  createPolicyInjector(direct, () => 'POLICY-A');
  const decided = await handler({ agent: { id: 'session-1', session: sessionWith([]) }, signal: { aborted: false } },
    () => Promise.resolve({ kind: 'enter', messages: [policyRow('POLICY-A')] }));
  assert.equal(decided.messages.length, 1, 'the pending decision is left as it stands');
});

test('a framework rejection passes through untouched', async () => {
  let captured = null;
  const handlerCtx = {
    logger: { warn() {} },
    on(name, handler) { void name; captured = handler; return () => {}; },
  };
  createPolicyInjector(handlerCtx, () => 'POLICY');
  const decision = await captured({ agent: { id: 's1' }, signal: { aborted: false } }, () => Promise.resolve({ kind: 'reject' }));
  assert.deepEqual(decision, { kind: 'reject' });
});

test('turbo endpoint reads and updates per-session flags and survives a corrupt file', async () => {
  const home = mkdtempSync(join(tmpdir(), 'codex-ui-turbo-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    const ctx = fakeCtx();
    const turbo = registerTurbo(ctx);
    const route = ctx.routes.find(candidate => candidate.path === TURBO_PATH);
    assert.ok(route, 'turbo route must be registered');

    const call = async payload => {
      const response = await route.fetch(new Request('http://local/api', {
        method: 'POST',
        body: JSON.stringify({ type: 'client-request', rpcId: 'r1', method: TURBO_EVENT, payload }),
      }));
      return response.json();
    };

    const empty = await call({ sessionId: 's1', action: 'read' });
    // An unset style answers `none`, not an empty string and not `work`: `none` is a real third choice
    // ("inject no style template"), and the old silent fold to `work` is what made the settings row look
    // stuck on 工作 no matter what was picked.
    assert.deepEqual(empty.result, { ok: true, value: { persona: 'none', lightning: false, ultra: false, superfast: false, tokenMultiple: null, tokenExact: false } });

    // The three effort switches are written by this route, into `$DSH_HOME/storages/codex-ui-effort.json`
    // — the same record `dsh-codex-ui-reasoning` writes (src/turbo.js:745-750). The write is a whole-file
    // rewrite built from a read taken immediately before the mutation, so rows the other plugin recorded
    // are carried over. The earlier expectation here was a refusal with code `turbo/effort-moved`; that
    // migration never landed, and the code, its comments and CHANGELOG.md:55 all say the write stays.
    const armed = await call({ sessionId: 's1', action: 'update', lightning: true, ultra: true });
    assert.equal(armed.result.ok, true, 'the effort write stays on this route');
    assert.equal(armed.result.value.lightning, true);
    assert.equal(armed.result.value.ultra, true);
    // The write reached the shared record, and the read route serves it back.
    const afterUpdate = await call({ sessionId: 's1', action: 'read' });
    assert.deepEqual(afterUpdate.result.value, { persona: 'none', lightning: true, ultra: true, superfast: false, tokenMultiple: null, tokenExact: false });
    assert.equal(existsSync(join(home, 'storages', 'codex-ui-effort.json')), true, 'an accepted update must create the effort record');

    // The record has two writers now. The test writes it directly, the way the other plugin does, and the
    // read route has to serve that too — including a rewrite that lands while this process is running.
    writeEffortRecord(home, { s1: { lightning: true, ultra: true } });
    const reread = await call({ sessionId: 's1', action: 'read' });
    assert.deepEqual(reread.result.value, { persona: 'none', lightning: true, ultra: true, superfast: false, tokenMultiple: null, tokenExact: false });
    const stored = JSON.parse(readFileSync(join(home, 'storages', 'codex-ui-effort.json'), 'utf8'));
    assert.deepEqual(stored.sessions.s1.lightning, true);

    // One flag without the other still writes, and the flag that was not named keeps its stored value.
    const partial = await call({ sessionId: 's1', action: 'update', lightning: false });
    assert.equal(partial.result.ok, true);
    assert.equal(partial.result.value.lightning, false);
    assert.equal(partial.result.value.ultra, true, 'an unnamed switch must not be reset');

    // The hero's "next session" scope reads and writes the pending pick without touching session rows.
    const heroRead = await call({ sessionId: '', action: 'read' });
    assert.deepEqual(heroRead.result.value, { persona: 'none', lightning: false, ultra: false, superfast: false, pending: true, tokenMultiple: null, tokenExact: false });
    const heroPick = await call({ sessionId: '', action: 'update', persona: 'chat' });
    assert.equal(heroPick.result.value.persona, 'chat');
    // State writes are queued; await the chain rather than guessing at a delay.
    await turbo.settled();
    const afterPick = JSON.parse(readFileSync(join(home, 'storages', 'codex-ui-persona.json'), 'utf8'));
    assert.equal(afterPick.pendingPersona, 'chat');
    assert.ok(afterPick.pendingAt > 0, 'the pick records when it was made');
    // The pick is the value every session without a row of its own follows, so it adds no row itself.
    assert.deepEqual(Object.keys(afterPick.sessions), [], 'a pending pick must not add a session row');
    const effortAfterPick = JSON.parse(readFileSync(join(home, 'storages', 'codex-ui-effort.json'), 'utf8'));
    assert.deepEqual(Object.keys(effortAfterPick.sessions), ['s1'], 'and the pick does not disturb the effort record');
    // A session with no row of its own follows the pick — that is what lets a style change reach a
    // conversation that is already running, which the old "stamp once, never change" rule blocked.
    const following = await call({ sessionId: 's1', action: 'read' });
    assert.equal(following.result.value.persona, 'chat', 'a session without its own row follows the last pick');
    // A per-session write is accepted, and it moves both places: that session's row and the pending pick.
    const perSession = await call({ sessionId: 's1', action: 'update', persona: 'work' });
    assert.equal(perSession.result.ok, true, 'a session may change its style mid-conversation');
    assert.equal(perSession.result.value.persona, 'work');
    await turbo.settled();
    const afterSessionPick = JSON.parse(readFileSync(join(home, 'storages', 'codex-ui-persona.json'), 'utf8'));
    assert.equal(afterSessionPick.sessions.s1.persona, 'work', 'the switch is stamped on the session');
    assert.equal(afterSessionPick.pendingPersona, 'work', 'and the next conversation inherits the same pick');
    assert.equal((await call({ sessionId: '', action: 'read' })).result.value.persona, 'work', 'the pending scope reads it back');

    // The injector serves whatever style is in force at the moment a session steps — nothing is
    // stamped onto a first turn, which is exactly what lets a running conversation change style.
    const personaCtx = fakeCtx();
    registerTurbo(personaCtx);
    const personaCall = async payload => (await personaCtx.routes.find(candidate => candidate.path === TURBO_PATH).fetch(new Request('http://local/api', {
      method: 'POST',
      body: JSON.stringify({ type: 'client-request', rpcId: 'r2', method: TURBO_EVENT, payload }),
    }))).json();
    const step = (id, turn, s = 1) => ({ agent: { id }, turn, step: s, signal: { aborted: false } });
    // Every message the step produced, joined: the policy travels as one block but the per-turn
    // reminders are separate messages, so index-based reads are fragile.
    const textOf = result => result.messages.map(message => (message.content ?? []).map(part => part.text ?? '').join('\n')).join('\n');
    // Back to "inject nothing" so the first check is about the language block alone.
    await personaCall({ sessionId: '', action: 'update', persona: 'none' });

    // `none` injects no style template, but the language contract is forced on every session.
    const running = await personaCtx.fire('agent/pre-step', step('s0', 2));
    const languageOnly = textOf(running);
    assert.match(languageOnly, /Language \(active\) — Chinese throughout/);
    assert.match(languageOnly, /Reason in Chinese directly/);
    assert.doesNotMatch(languageOnly, /Persona \(active\)/, 'none injects no style template');
    assert.doesNotMatch(languageOnly, /Ultra Mode|Lightning Mode/, 'and no switch it never turned on');
    // A session that never chose a style follows the pending one, still none here.
    assert.doesNotMatch(textOf(await personaCtx.fire('agent/pre-step', step('s2', 1))), /Persona \(active\)/);

    // Switching to chat mid-conversation takes effect on the very next step. This is the bug the
    // settings row had: it could write a pick, and the running conversation never saw it.
    assert.equal((await personaCall({ sessionId: 's2', action: 'update', persona: 'chat' })).result.ok, true);
    const chatText = textOf(await personaCtx.fire('agent/pre-step', step('s2', 2)));
    assert.match(chatText, /Persona \(active\)/);
    assert.match(chatText, /talk like a person/);
    assert.match(chatText, /Open by naming their state/);
    // The chat contract must forbid deliverables, capability menus, and stock phrases.
    assert.match(chatText, /never list what you can do/);
    assert.match(chatText, /Never sell work back/);
    assert.match(chatText, /别硬撑/);
    assert.doesNotMatch(chatText, /precision work/);

    // And so does switching to work, on that same conversation.
    await personaCall({ sessionId: 's2', action: 'update', persona: 'work' });
    const workText = textOf(await personaCtx.fire('agent/pre-step', step('s2', 3)));
    assert.match(workText, /precision work/);
    assert.doesNotMatch(workText, /talk like a person/);
    // A conversation that opens after the switch inherits the same style.
    assert.match(textOf(await personaCtx.fire('agent/pre-step', step('s3', 1))), /precision work/);

    // A disarmed session that had armed text gets the off-notice exactly once.
    const injected = [];
    const injectorCtx = fakeCtx();
    const inject = createPolicyInjector(injectorCtx, () => (injected.length === 0 ? (injected.push(1), policyText({ lightning: true })) : OFF_NOTICE));
    const first = await injectorCtx.fire('agent/pre-step', { agent: { id: 's1' }, signal: { aborted: false } });
    const second = await injectorCtx.fire('agent/pre-step', { agent: { id: 's1' }, signal: { aborted: false } });
    assert.equal(first.messages.length, 1);
    assert.equal(second.messages[0].content[0].text, OFF_NOTICE);
    inject();

    // A switch named on the "next session" scope is refused for the same reason: there is no writer
    // left here, so the scope no longer changes the answer.
    // The three switches need a session: the hero's "next session" scope has no row to hold them, so a
    // request that names one here is refused with `turbo/invalid` — not because the write moved away.
    const bad = await call({ sessionId: '', action: 'update', lightning: true });
    assert.equal(bad.result.ok, false);
    assert.equal(bad.result.error.code, 'turbo/invalid');
    const noChange = await call({ sessionId: 's1', action: 'update' });
    assert.equal(noChange.result.ok, false);
    assert.equal(noChange.result.error.code, 'turbo/invalid', 'a named session that names no owned field is still invalid');

    // Eviction must not cost the user a switch. Switch rows and style rows live in two records, so a
    // file full of style rows used to push an older armed row out of the *old* shared record — the
    // conversation silently lost Ultra/Lightning while its composer went on showing them off.
    // Armed first, then the storm, which is the order that actually happens. Both rows go in through
    // the other plugin's file, because this process cannot arm a session any more — the point of the
    // test is that a style write can never evict them.
    const effortFile = writeEffortRecord(home, { s1: { lightning: true, ultra: true }, 'session-armed': { lightning: true, ultra: true } });
    const armedEarly = await call({ sessionId: 'session-armed', action: 'read' });
    assert.equal(armedEarly.result.value.lightning, true, 'the read serves the record the other plugin wrote');
    const effortBytes = readFileSync(effortFile, 'utf8');
    // A storm of style switches: each one is a real per-session write, which is what fills the record.
    for (let index = 0; index < 41; index += 1) await call({ sessionId: `child-${index}`, action: 'update', persona: 'chat' });
    await turbo.settled();
    // The storm writes persona rows only, so it cannot evict a switch: the effort record holds the
    // two armed sessions and nothing else.
    assert.equal(readFileSync(effortFile, 'utf8'), effortBytes, 'this process never writes the effort record, so a storm cannot even reorder it');
    const pruned = JSON.parse(readFileSync(join(home, 'storages', 'codex-ui-effort.json'), 'utf8'));
    assert.deepEqual(Object.keys(pruned.sessions).sort(), ['s1', 'session-armed'], 'the effort record stays free of persona rows');
    assert.deepEqual(pruned.sessions['session-armed'], { lightning: true, ultra: true, superfast: false, at: pruned.sessions['session-armed'].at }, 'the armed row survives the storm');
    assert.equal(pruned.sessions.s1.ultra, true, 'and so does the armed row this test set up earlier');
    // The persona record is the one that grows with the fan-out, so it is the one that is bounded.
    const personaRows = JSON.parse(readFileSync(join(home, 'storages', 'codex-ui-persona.json'), 'utf8'));
    assert.equal(Object.keys(personaRows.sessions).length, 40, 'the persona record stays bounded');
    assert.equal('child-0' in personaRows.sessions, false, 'the oldest persona-only rows are the ones that go');
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    rmSync(home, { recursive: true, force: true });
  }
});

test('Superfast uses speed-first DAG executors and lossless direct delivery', () => {
  const tree = policyText({ persona: 'work', superfast: true });
  assert.match(tree, /## Superfast Mode/);
  assert.match(tree, /superfast_start \/ superfast_control/);
  assert.match(tree, /默认每父32个并发执行槽/);
  assert.match(tree, /实际capacity和宿主限制/);
  assert.match(tree, /依赖DAG/);
  assert.match(tree, /执行者不派生代理或另起run/);
  assert.match(tree, /互斥write_paths/);
  assert.match(tree, /真正阻塞才help等待父reply/);
  assert.match(tree, /artifact、分支完成、容量变化、help或终态/);
  assert.match(tree, /collecting期间/);
  assert.match(tree, /用户直接提问、催问或要解释仍及时非空回应/);
  assert.match(tree, /不展开普通 subagent 树/);
  assert.match(tree, /取消必跑整理S/);
  assert.match(tree, /程序化无损汇集/);
  assert.match(tree, /不无脑重跑已证实分支全套/);
  assert.match(tree, /shell并非静态强制路径沙箱/);
  assert.match(tree, /superfast_control add/);
  assert.doesNotMatch(tree, /小组长A.B.C.D|每个组长必须派2–3个执行者/);
  assert.doesNotMatch(tree, /## Lightning Mode|Delegation is mandatory at every tier|never fan out past tier 2/);
  assert.match(policyText({ persona: 'work', superfast: true, subagent: true }), /你是直接执行者/);
});

test('only a delegated child ends with the guard that forbids child fan-out', () => {
  const flat = policyText({ persona: 'work', lightning: true });
  assert.doesNotMatch(flat, /## Superfast Mode/, 'Lightning alone must not promise a tree');
  // This is the defect the old assertion pinned shut: the guard says "ignore every rule above about fan-out",
  // so a parent that received it had its own mandate cancelled by the tail of its own contract.
  assert.doesNotMatch(flat, /Ignore every rule above about fan-out/, 'a parent must not be told to ignore fan-out');
  const child = policyText({ persona: 'work', lightning: true, subagent: true });
    // 措辞改成「上面那些是写给父会话的、不适用于你这一轮」：语义同原来那句「忽略上面全部规则」，
    // 但避开了上游内容审核认的注入模板（中转站见到就 400）。断言跟着钉新表述。
    assert.match(child, /written for your parent and do not apply to your turn/, 'a delegated child still needs the guard');
});

test('the turbo endpoint arms and persists the superfast flag on its own', async () => {
  // Its own home and context: an extra armed session row would change the eviction expectations
  // of the big flag test above, and a test that shares state with another is not a test.
  const home = mkdtempSync(join(tmpdir(), 'codex-ui-superfast-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    const ctx = fakeCtx();
    const turbo = registerTurbo(ctx);
    const call = async payload => (await ctx.routes.find(candidate => candidate.path === TURBO_PATH).fetch(new Request('http://local/api', {
      method: 'POST',
      body: JSON.stringify({ type: 'client-request', rpcId: 'rt', method: TURBO_EVENT, payload }),
    }))).json();
    const before = await call({ sessionId: 'tree', action: 'read' });
    assert.equal(before.result.value.superfast, false, 'a session starts with the tree off');
    // This test asks one thing — is the flag read back correctly and does it persist. The route writes
    // the shared record itself (src/turbo.js:745-750), so arming happens through the same call the
    // interface makes; the earlier expectation of a `turbo/effort-moved` refusal described a migration
    // that never landed.
    const armedByRoute = await call({ sessionId: 'tree', action: 'update', superfast: true });
    assert.equal(armedByRoute.result.ok, true);
    assert.equal(armedByRoute.result.value.superfast, true);
    writeEffortRecord(home, { tree: { superfast: true } });
    const armed = await call({ sessionId: 'tree', action: 'read' });
    assert.equal(armed.result.value.superfast, true);
    assert.equal(armed.result.value.lightning, false, 'arming the tree must not flip the flat switch');
    assert.equal((await call({ sessionId: 'tree', action: 'read' })).result.value.superfast, true);
    await turbo.settled();
    const stored = JSON.parse(readFileSync(join(home, 'storages', 'codex-ui-effort.json'), 'utf8'));
    assert.equal(stored.sessions.tree.superfast, true, 'the flag must survive a reload');
    // A malformed value is refused on the invalid-argument code, not coerced.
    const bad = await call({ sessionId: 'tree', action: 'update', superfast: 'yes' });
    assert.equal(bad.result.ok, false);
    assert.equal(bad.result.error.code, 'turbo/invalid');
    // And the hero's "next session" scope never carries it: the tree is armed per conversation.
    const hero = await call({ sessionId: '', action: 'read' });
    assert.equal(hero.result.value.superfast, false);
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
  }
});

test('Lightning re-asserts its mandate once per turn, and only for an armed session', async () => {
  const home = mkdtempSync(join(tmpdir(), 'codex-ui-nudge-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    const ctx = fakeCtx();
    registerTurbo(ctx);
    const route = ctx.routes.find(candidate => candidate.path === TURBO_PATH);
    const call = async payload => (await route.fetch(new Request('http://local/api', {
      method: 'POST',
      body: JSON.stringify({ type: 'client-request', rpcId: 'rn', method: TURBO_EVENT, payload }),
    }))).json();
    const stepOf = (id, turn, step = 1) => ({ agent: { id }, turn, step, signal: { aborted: false } });
    const nudges = result => result.messages.map(m => m.content?.[0]?.text ?? '').filter(text => text.includes('快速闪电协作已开启'));
    const disarm = result => result.messages.map(m => m.content?.[0]?.text ?? '').filter(text => text.includes('快速闪电协作已开启'));

    // An unarmed session never sees it.
    const cold = await ctx.fire('agent/pre-step', stepOf('s-cold', 3));
    assert.deepEqual(disarm(cold), [], 'an unarmed session gets no reminder');

    // The reminder stayed in this file with the injector (src/turbo.js:471-511); only the arming moved,
    // so the record is written the way its owner writes it. Every assertion below is unchanged: this
    // measures the reminder, not the retired route.
    writeEffortRecord(home, { 's-armed': { lightning: true } });
    assert.equal((await call({ sessionId: 's-armed', action: 'read' })).result.value.lightning, true, 'the read serves the armed record');
    const first = await ctx.fire('agent/pre-step', stepOf('s-armed', 3, 1));
    const firstNudges = nudges(first);
    assert.equal(firstNudges.length, 1, 'the first step of a turn carries exactly one reminder');
    assert.match(firstNudges[0], /turn 3/);
    assert.match(firstNudges[0], /首轮flash_start派2–4个/);
    const second = await ctx.fire('agent/pre-step', stepOf('s-armed', 3, 2));
    assert.deepEqual(nudges(second), [], 'no per-step nagging');
    const third = await ctx.fire('agent/pre-step', stepOf('s-armed', 3, 3));
    assert.equal(nudges(third).length, 1, 'zero dispatches trigger an early reminder at +2 steps');
    const repeated = await ctx.fire('agent/pre-step', stepOf('s-armed', 3, 3));
    assert.deepEqual(nudges(repeated), [], 'the same step is never nudged twice');
    assert.deepEqual(nudges(await ctx.fire('agent/pre-step', stepOf('s-armed', 3, 10))), []);
    const periodic = await ctx.fire('agent/pre-step', stepOf('s-armed', 3, 11));
    assert.equal(nudges(periodic).length, 1, 'review again eight steps after the early reminder');
    assert.notEqual(nudges(periodic)[0], firstNudges[0], 'periodic reminders have distinct step text');
    ctx.emitEvent({ header: { id: 's-armed' } }, { type: 'tool/call', data: { turn: 3, name: 'flash_start', arguments: '{}' } });
    assert.equal(nudges(await ctx.fire('agent/pre-step', stepOf('s-armed', 3, 19))).length, 1, 'dispatch does not stop ongoing reviews');
    // The next turn gets its own, with its own number — that is what defeats the injector's
    // "same text, skip" rule, which is why the one-shot contract stopped steering anything.
    const nextTurn = await ctx.fire('agent/pre-step', stepOf('s-armed', 4, 1));
    const nextNudges = nudges(nextTurn);
    assert.equal(nextNudges.length, 1, 'each new turn re-asserts the mandate');
    assert.match(nextNudges[0], /turn 4/);
    assert.notEqual(nextNudges[0], firstNudges[0], 'never the same text twice');
    // Disarming is a write to the same record: `currentEffort()` revalidates it on every step, so the
    // very next one already sees the row switched off.
    writeEffortRecord(home, { 's-armed': { lightning: false } });
    assert.equal((await call({ sessionId: 's-armed', action: 'read' })).result.value.lightning, false);
    const afterOff = await ctx.fire('agent/pre-step', stepOf('s-armed', 5, 1));
    assert.deepEqual(nudges(afterOff), [], 'turning the switch off stops the reminder');
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
  }
});

test('a delegated child inherits the switches of the session that spawned it', async () => {
  const home = mkdtempSync(join(tmpdir(), 'codex-ui-child-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    const ctx = fakeCtx();
    registerTurbo(ctx);
    // The effort record is keyed by the parent, verbatim as the harness writes it: the row key and
    // `parentSession` both carry the `session-` prefix, so the lookup must not strip it.
    writeEffortRecord(home, { 'session-parent-tree': { lightning: true, superfast: true } });
    const texts = result => result.messages.map(m => m.content?.[0]?.text ?? '').filter(Boolean);
    // The header is what the harness records for a delegated session: `origin`, the depth, and the
    // parent it came from. Values below are copied from a real child session log.
    const childStep = {
      agent: {
        id: 'child-worker-1',
        session: { header: { origin: 'subagent', delegationDepth: 1, parentSession: 'session-parent-tree' } },
      },
      turn: 1,
      step: 1,
      signal: { aborted: false },
    };
    const child = await ctx.fire('agent/pre-step', childStep);
    const childText = texts(child).join('\n');
    // The tree contract reached the child, and the tier-aware tail replaced the ordinary guard: the
    // ordinary guard forbids fan-out outright, which cancels the very delegation Superfast is built from.
    assert.match(childText, /## Superfast Mode/, 'the child must receive the tree contract it is meant to run');
    assert.match(childText, /你是直接执行者/, 'the role-aware child note must be the tail');
    assert.doesNotMatch(childText, /Ignore every rule above about fan-out/, 'the fan-out-killing guard must not be the tail');
    // The switches are inherited; the style is neither inherited nor written here — `personaFor` reads
    // per session and no longer stamps anything, so a step can not create a persona row at all. The old
    // write-on-first-turn rule is what let a child sharing its parent's scope claim that row.
    assert.equal(existsSync(join(home, 'storages', 'codex-ui-persona.json')), false, 'a step must not write a persona row');
    // The parent's switches are what the child is nudged by: the one-shot injection alone was measured to
    // stop steering after a few turns, which is the whole reason the per-turn reminder exists.
    const childNudges = texts(await ctx.fire('agent/pre-step', { ...childStep, turn: 2, step: 1 }))
      .filter(text => text.includes('超快闪电已开启'));
    assert.equal(childNudges.length, 1, 'a child inherits the per-turn reminder from its parent switches');
    // 提醒必须跟着模式走：父会话开的是超快，子代理收到的就不能是那句只讲一层的「Lightning is armed」，
    // 否则同一轮里两套合同打架，模型会挑轻的那条听。
    assert.match(childNudges[0], /超快闪电已开启/, '超快模式下每轮提醒也必须说超快');
    assert.doesNotMatch(childNudges[0], /^\s*Lightning is armed/, '超快模式不该再收到闪电那版提醒');
    // A child of an unarmed parent still gets nothing but its own tail: no switches, no tree.
    writeEffortRecord(home, {});
    const orphanStep = {
      agent: { id: 'child-worker-2', session: { header: { origin: 'subagent', delegationDepth: 1, parentSession: 'session-not-armed' } } },
      turn: 1,
      step: 1,
      signal: { aborted: false },
    };
    const orphan = texts(await ctx.fire('agent/pre-step', orphanStep)).join('\n');
    assert.doesNotMatch(orphan, /## Superfast Mode/, 'an unarmed parent must not arm its child');
    // Disarming the parent reaches the child on its next step: the child carries a block it inherited, so
    // it is the one session that would otherwise keep obeying a contract the user already revoked.
    const armedChild = {
      agent: { id: 'child-worker-3', session: { header: { origin: 'subagent', delegationDepth: 1, parentSession: 'session-parent-tree' } } },
      turn: 1,
      step: 1,
      signal: { aborted: false },
    };
    writeEffortRecord(home, { 'session-parent-tree': { lightning: true, superfast: true } });
    assert.match(texts(await ctx.fire('agent/pre-step', armedChild)).join('\n'), /## Superfast Mode/);
    writeEffortRecord(home, { 'session-parent-tree': { lightning: false, superfast: false } });
    const offChild = texts(await ctx.fire('agent/pre-step', { ...armedChild, turn: 2 })).join('\n');
    assert.doesNotMatch(offChild, /## Superfast Mode/, 'the revoked tree must stop reaching the child too');
    assert.doesNotMatch(offChild, /你是直接执行者/, 'and the role instruction must go with it');
    // The language contract still applies to this session (it is forced on every session); what must not
    // survive is the tree. `OFF_NOTICE` belongs to a session that had armed text and lost all of it,
    // which this one never had — its style follows the pending value and no switch was ever on.
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
  }
});

test('a user-written persona layers under the reply style instead of replacing it', () => {
  // 有人设时两层都要在提示词里：先一句分工声明，再是风格模板本体。
  // 旧行为是「有人设就整段让位」，用户选的聊天/工作完全不起作用，症状就是「切了没用」。
  const layered = policyText({ persona: 'chat', chinese: true, personaDeferential: true });
  assert.match(layered, /### 人设是底色，回复风格是表达方式/, 'the layered declaration must reach the prompt');
  assert.match(layered, /Persona \(active\) — talk like a person/, 'and the style template must still be there');
  assert.ok(layered.indexOf('人设是底色') < layered.indexOf('talk like a person'), 'the declaration leads the template');
  // 没有人设时不出现那句声明，模板照旧。
  const plain = policyText({ persona: 'chat', chinese: true });
  assert.doesNotMatch(plain, /人设是底色/);
  assert.match(plain, /Persona \(active\) — talk like a person/);
  // 「无」是不注入任何风格模板，但语言契约仍然照常。
  const off = policyText({ persona: 'none', chinese: true });
  assert.doesNotMatch(off, /Persona \(active\)/);
  assert.match(off, /Language \(active\)/);
});

test('Lightning reminders use relative steps, dispatch attempts and isolated session/turn state', async () => {
  const home = mkdtempSync(join(tmpdir(), 'codex-ui-relative-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    const ctx = fakeCtx();
    registerTurbo(ctx);
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    writeEffortRecord(home, Object.fromEntries(ids.map(id => [id, { lightning: true }])));
    const step = async (id, turn, n, session = undefined) => {
      const result = await ctx.fire('agent/pre-step', { agent: { id, session }, turn, step: n });
      return result.messages.flatMap(m => m.content ?? []).filter(b => b.text?.startsWith('快速闪电协作已开启'));
    };
    const call = (id, turn, name, args) => ctx.emitEvent({ header: { id } }, {
      type: 'tool/call', data: { turn, step: 101, callId: `${id}-${name}`, name, arguments: args },
    });
    for (const id of ids) assert.equal((await step(id, 7, 101)).length, 1);
    call('a', 7, 'flash_start', '{}');
    call('b', 7, 'flash_run', '{}');
    call('c', 7, 'flash_control', JSON.stringify({ action: 'add' }));
    // Call attempts count even when no success event ever arrives.
    for (const id of ['a', 'b', 'c']) {
      assert.equal((await step(id, 7, 103)).length, 0, `${id} attempted dispatch`);
      assert.equal((await step(id, 7, 108)).length, 0, 'cadence is not based on global step buckets');
      assert.equal((await step(id, 7, 109)).length, 1, 'dispatch still receives +8 review');
      assert.equal((await step(id, 7, 117)).length, 1, 'reviews continue after first batch');
    }
    call('d', 7, 'flash_control', JSON.stringify({ action: 'status' }));
    call('e', 7, 'flash_control', JSON.stringify({ action: 'reply' }));
    call('f', 7, 'flash_control', JSON.stringify({ action: 'cancel' }));
    call('g', 7, 'flash_control', '{broken');
    for (const id of ['d', 'e', 'f', 'g']) {
      assert.equal((await step(id, 7, 103)).length, 1, `${id} has no dispatch attempt`);
      assert.equal((await step(id, 7, 110)).length, 0);
      assert.equal((await step(id, 7, 111)).length, 1);
    }
    assert.equal((await step('a', 8, 201)).length, 1, 'next turn starts at its own cumulative step');
    assert.equal((await step('a', 8, 203)).length, 1, 'earlier turn dispatch does not leak');
    // A replayed turn/start must preserve observed dispatch and reminder state.
    ctx.emitEvent({ header: { id: 'a' } }, { type: 'turn/start', data: { turn: 7 } });
    assert.equal((await step('a', 7, 117)).length, 0);
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
    rmSync(home, { recursive: true, force: true });
  }
});

test('reminder gates preserve standard, Superfast, clean, cgflash and injection-off behavior', async () => {
  const home = mkdtempSync(join(tmpdir(), 'codex-ui-gates-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    const ctx = fakeCtx();
    const turbo = registerTurbo(ctx);
    writeEffortRecord(home, { tree: { superfast: true }, clean: { lightning: true }, 'session-cgflash-x': { lightning: true }, armed: { lightning: true } });
    const step = (id, n, session) => ctx.fire('agent/pre-step', { agent: { id, session }, turn: 3, step: n });
    const text = result => result.messages.flatMap(m => m.content ?? []).map(b => b.text).join('\n');
    assert.doesNotMatch(text(await step('standard', 101)), /快速闪电协作已开启|超快闪电已开启/);
    assert.match(text(await step('tree', 101)), /超快闪电已开启/);
    for (const n of [103, 109, 117]) assert.doesNotMatch(text(await step('tree', n)), /超快闪电已开启/);
    assert.equal((await step('clean', 101, { header: { agentPreset: 'clean' } })).messages.length, 0);
    const child = text(await step('session-cgflash-x', 101));
    assert.match(child, /你是后台闪电执行者/);
    assert.doesNotMatch(child, /快速闪电协作已开启|超快闪电已开启/);
    assert.match(text(await step('armed', 101)), /快速闪电协作已开启/);
    const route = ctx.routes.find(r => r.path === TURBO_PATH);
    const response = await route.fetch(new Request('http://local/api', { method: 'POST', body: JSON.stringify({
      type: 'client-request', rpcId: 'off', method: TURBO_EVENT,
      payload: { action: 'injection', sessionId: 'armed', id: 'lightning', enabled: false },
    }) }));
    assert.equal((await response.json()).result.ok, true);
    for (const id of ['armed', 'tree']) assert.doesNotMatch(text(await step(id, 203)), /快速闪电协作已开启|超快闪电已开启/);
    await turbo.settled();
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
    rmSync(home, { recursive: true, force: true });
  }
});

test('formal context carries live policy and bounded reminder state without user-message injection', async () => {
  const home = mkdtempSync(join(tmpdir(), 'codex-ui-context-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  const ctx = fakeCtx({ context: true });
  const turbo = registerTurbo(ctx);
  try {
    assert.equal(ctx.contexts.length, 1);
    const entry = ctx.contexts[0];
    assert.equal(entry.name, 'dsh-codex-ui:mode-policy');
    assert.equal(entry.order, 620);
    assert.equal(entry.interpolate, false);
    const agent = { id: 'armed' };
    const render = (target = agent) => entry.text({ agent: target });
    const step = n => ctx.fire('agent/pre-step', { agent, turn: 7, step: n });
    writeEffortRecord(home, { armed: { lightning: true } });
    const stable = render();
    assert.match(stable, /首选flash_start提交2–4条独立任务/);
    assert.doesNotMatch(stable, /快速闪电协作已开启/);
    assert.deepEqual((await step(101)).messages, [], 'formal host persists no policy or nudge user row');
    const first = render();
    assert.ok(first.startsWith(stable));
    assert.match(first, /turn 7 step 101/);
    assert.deepEqual((await step(102)).messages, []);
    assert.equal(render(), first, 'non-review steps preserve only the last short state');
    assert.deepEqual((await step(103)).messages, []);
    const reviewed = render();
    assert.match(reviewed, /turn 7 step 103/);
    assert.doesNotMatch(reviewed, /turn 7 step 101/, 'old reminders are replaced rather than accumulated');
    assert.equal(reviewed.split(LIGHTNING_POLICY).length, 2, 'one stable contract remains');
    assert.match(render({ id: 'standard' }), /当前模式：标准/);
    assert.doesNotMatch(render({ id: 'standard' }), /快速闪电协作已开启/);
    assert.equal(render({ id: 'armed', session: { header: { agentPreset: 'clean' } } }), '');
    assert.match(render({ id: 'session-cgflash-x' }), /你是后台闪电执行者/);
    assert.doesNotMatch(render({ id: 'session-cgflash-x' }), /快速闪电协作已开启/);

    writeEffortRecord(home, { armed: { superfast: true } });
    assert.match(render(), /## Superfast Mode/);
    assert.doesNotMatch(render(), /快速闪电协作已开启/, 'a mode switch hides the prior mode reminder immediately');
    await ctx.fire('agent/pre-step', { agent, turn: 8, step: 201 });
    assert.match(render(), /超快闪电已开启/);
    const tree = render();
    await ctx.fire('agent/pre-step', { agent, turn: 8, step: 209 });
    assert.equal(render(), tree, 'Superfast remains once per turn');
    const child = { id: 'child', session: { header: { origin: 'subagent', delegationDepth: 1, parentSession: 'armed' } } };
    assert.match(render(child), /你是直接执行者/);

    const route = ctx.routes.find(r => r.path === TURBO_PATH);
    const response = await route.fetch(new Request('http://local/api', { method: 'POST', body: JSON.stringify({
      type: 'client-request', rpcId: 'context-off', method: TURBO_EVENT,
      payload: { action: 'injection', sessionId: 'armed', id: 'lightning', enabled: false },
    }) }));
    assert.equal((await response.json()).result.ok, true);
    assert.match(render(), /当前模式：标准/);
    assert.doesNotMatch(render(), /超快闪电已开启|## Superfast Mode|快速闪电协作已开启/);
    writeEffortRecord(home, {});
    assert.doesNotMatch(render(), /## Superfast Mode/);
    await turbo.settled();
  } finally {
    ctx.dispose();
    assert.equal(ctx.contexts.length, 0, 'context contribution is disposed');
    assert.equal(ctx.listenerCount, 0, 'all observation listeners are disposed');
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
    rmSync(home, { recursive: true, force: true });
  }
});

test('legacy reminder provenance cannot cause a stable policy to be re-injected', async () => {
  const home = mkdtempSync(join(tmpdir(), 'codex-ui-nudge-source-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  const ctx = fakeCtx();
  registerTurbo(ctx);
  try {
    writeEffortRecord(home, { armed: { lightning: true } });
    const log = [];
    const agent = { id: 'armed', session: sessionWith(log) };
    const step = n => ctx.fire('agent/pre-step', { agent, turn: 1, step: n });
    const first = await step(101);
    const policy = first.messages.filter(m => m.source.kind === 'plugin:dsh-codex-ui');
    const nudge = first.messages.filter(m => m.source.kind === 'plugin:dsh-codex-ui:nudge');
    assert.equal(policy.length, 1);
    assert.equal(nudge.length, 1);
    assert.match(nudge[0].content[0].text, /快速闪电协作已开启/);
    log.push(...first.messages);
    assert.deepEqual((await step(102)).messages, [], 'persisted nudge is not mistaken for a policy revision');
    const review = await step(103);
    assert.equal(review.messages.length, 1, 'review appends only its short reminder');
    assert.equal(review.messages[0].source.kind, 'plugin:dsh-codex-ui:nudge');
    log.push(...review.messages);
    assert.deepEqual((await step(104)).messages, []);
  } finally {
    ctx.dispose();
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
    rmSync(home, { recursive: true, force: true });
  }
});

test('fan-out logs use the exact session and turn and count calls rather than successes', async () => {
  const home = mkdtempSync(join(tmpdir(), 'codex-ui-counts-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    const ctx = fakeCtx();
    registerTurbo(ctx);
    writeEffortRecord(home, { a: { lightning: true }, b: { lightning: true }, c: { lightning: true } });
    const call = (id, turn, name = 'read', args = '{}') => ctx.emitEvent({ header: { id } }, {
      type: 'tool/call', data: { turn, name, arguments: args, callId: `${id}-${turn}-${name}` },
    });
    for (let i = 0; i < 8; i++) {
      call('a', 4);
      call('b', 4);
      call('a', 5);
      call('standard', 4);
    }
    call('b', 4, 'flash_control', JSON.stringify({ action: 'add' }));
    // Newer map rows and other sessions must not select the report's turn.
    call('c', 99);
    const stop = (id, turn) => ctx.fire('agent/turn-stopping', { agent: { id, session: { id } }, turn });
    await stop('b', 4);
    assert.deepEqual(ctx.logs, [], 'add call is a dispatch even without a success result');
    await stop('standard', 4);
    assert.deepEqual(ctx.logs, [], 'standard is not subject to Lightning diagnostics');
    await stop('a', 4);
    assert.equal(ctx.logs.length, 1);
    assert.match(ctx.logs[0], /session a turn 4 spent 8 tool calls with 0 dispatch attempts/);
    assert.doesNotMatch(ctx.logs[0], /clause|\(a\)-\(d\)/);
    await stop('a', 4);
    assert.equal(ctx.logs.length, 1, 'one diagnostic per exact turn');
    await stop('a', 5);
    assert.equal(ctx.logs.length, 2);
    assert.match(ctx.logs[1], /session a turn 5 spent 8 tool calls/);
    await stop('a', 6);
    assert.equal(ctx.logs.length, 2, 'missing turn never falls back to another row');
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
    rmSync(home, { recursive: true, force: true });
  }
});
