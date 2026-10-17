// Sampling half: the three per-persona knobs — `temperature`, `top_p`, `max_tokens` —
// as they are written to and read back from a persona file, plus the payload schema the
// `/personas` route lets them through.
//
// Why this file exists: `tests/` had zero hits for these three keys, and they have already
// shipped three regressions (body blanked, clearing that did not take effect, a `step/min/max`
// that silently blocked submit). Every one of those was found by hand.
//
// What is under test here is the *observable* contract. `parseSampling`, `mergeSampling`,
// `formatPersona`, `SAMPLING_KEYS` and `SAMPLING_RULES` are module-private in
// `src/personas.js`, so they are exercised through the exported surface — `writePersona`
// (merge + format), `paramsFor` / `readPersonaFile` / `loadPersonas` (parse) — and through
// the registered route, which is the only place `personaPayloadSchema` is reachable.
//
// Same isolation rule as `tests/personas.test.mjs`: every case points `DSH_HOME` at a fresh
// `mkdtemp` directory and removes it afterwards. A test that wrote to the real `dsh-home`
// would overwrite the user's own persona files, which is the one thing this suite must
// never risk. No DSH runtime is needed: `apply` runs against the minimal fake context below,
// the same one the personas route test already uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { ensurePersonasDir, paramsFor, readPersonaFile, writePersona } from '../src/personas.js';
import { PERSONA_PATH, apply, CODEX_PROMPT } from '../src/prompt-modes.js';

/** A throwaway `DSH_HOME`, removed even when the test throws. */
async function inTempHome(fn) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-sampling-'));
  const home = join(root, 'home');
  assert.ok(resolve(home).startsWith(resolve(tmpdir())), 'DSH_HOME 必须落在临时目录内，绝不能指向真实的 dsh-home');
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    return await fn(home);
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    rmSync(root, { recursive: true, force: true });
  }
}

/** Write a persona file verbatim, so each case states exactly the bytes it parses. */
function personaFile(dir, name, content) {
  writeFileSync(join(dir, name), content, 'utf8');
}

/** Collect `console.warn` text emitted while `fn` runs; a bad sample value is a warning, not a throw. */
function captureWarnings(fn) {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return warnings;
}

/** The three frontmatter lines as `{ key: 'text after the colon' }`, absent keys left out. */
function samplingLines(raw) {
  const found = {};
  for (const key of ['temperature', 'top_p', 'max_tokens']) {
    const match = new RegExp(`^${key}:(.*)$`, 'm').exec(raw);
    if (match !== null) found[key] = match[1].trim();
  }
  return found;
}

/**
 * One row per acceptance boundary. `expected === null` means "must be discarded as not set".
 * Ranges come from `SAMPLING_RULES`: temperature and top_p are closed 0..max (decimals allowed),
 * max_tokens is a positive integer and has no upper bound at all.
 */
const UNIT_CASES = [
  { key: 'temperature', text: '0', expected: 0, why: '下界 0 合法：0 与“未设置”是两回事，不能被当成空值' },
  { key: 'temperature', text: '2', expected: 2, why: '上界 2 合法（闭区间包含上界）' },
  { key: 'temperature', text: '2.01', expected: null, why: '越过上界 0.01 应丢弃' },
  { key: 'temperature', text: '-0.01', expected: null, why: '低于下界应丢弃' },
  { key: 'top_p', text: '0', expected: 0, why: '下界 0 合法' },
  { key: 'top_p', text: '1', expected: 1, why: '上界 1 合法（概率的闭区间）' },
  { key: 'top_p', text: '1.01', expected: null, why: '越过上界应丢弃' },
  { key: 'top_p', text: '-0.01', expected: null, why: '低于下界应丢弃' },
];

const COUNT_CASES = [
  { key: 'max_tokens', text: '1', expected: 1, why: '最小正整数 1 合法' },
  { key: 'max_tokens', text: '4096', expected: 4096, why: '普通正整数合法' },
  { key: 'max_tokens', text: '0', expected: null, why: '0 不是正整数，应丢弃' },
  { key: 'max_tokens', text: '-256', expected: null, why: '负数应丢弃' },
  { key: 'max_tokens', text: '1.5', expected: null, why: '小数不是整数，应丢弃' },
  { key: 'max_tokens', text: 'abc', expected: null, why: '不是数字，应丢弃' },
];

/** Run one boundary row against a freshly written file, parsing through `paramsFor`. */
function assertBoundary(dir, stem, row) {
  personaFile(dir, `${stem}.md`, `---\nname: ${stem}\n${row.key}: ${row.text}\n---\nbody of ${stem}`);
  let params;
  const warnings = captureWarnings(() => { params = paramsFor(stem); });
  const label = `${row.key}: ${row.text} —— ${row.why}`;
  const warned = warnings.some(line => line.includes(`persona ${stem}.md`));
  if (row.expected === null) {
    assert.deepEqual(params, {}, `${label}（应丢弃并当作未设置）`);
    assert.ok(warned, `${label}：丢弃必须留一条点名该文件与键的 warn，不能静默`);
    return;
  }
  assert.deepEqual(params, { [row.key]: row.expected }, label);
  assert.equal(typeof params[row.key], 'number', `${label}：解析结果必须是 number，不能是字符串`);
  assert.equal(warned, false, `${label}：合法值不得产生 warn`);
}

test('范围：temperature 与 top_p 是闭区间 [0, max]，两端合法、越界一侧丢弃并 warn', async () => {
  await inTempHome(async home => {
    const dir = await ensurePersonasDir(CODEX_PROMPT);
    assert.equal(dir, join(home, 'personas'), '人设目录是 $DSH_HOME/personas');
    UNIT_CASES.forEach((row, index) => assertBoundary(dir, `unit${index}`, row));
  });
});

test('范围：max_tokens 只接受正整数，0 / 负数 / 小数 / 非数字都丢弃并 warn', async () => {
  await inTempHome(async () => {
    const dir = await ensurePersonasDir(CODEX_PROMPT);
    COUNT_CASES.forEach((row, index) => assertBoundary(dir, `count${index}`, row));
  });
});

test('三态合并：省略保留、null 清除、\'\' 清除、新值覆盖 —— 每步都读文件原文验证', async () => {
  await inTempHome(async () => {
    const dir = await ensurePersonasDir(CODEX_PROMPT);
    const read = () => readFileSync(join(dir, 'mix.md'), 'utf8');

    writePersona({ id: 'mix', name: 'Mix', text: 'mix body', temperature: 0.7, top_p: 0.95, max_tokens: 512 });
    assert.deepEqual(samplingLines(read()), { temperature: '0.7', top_p: '0.95', max_tokens: '512' },
      '基线：新建时三个键都写进了 frontmatter');

    // 省略 = 保持。改名不得重置温度：客户端只下发非空的采样键（宿主 `read` 会带回已设置的值，
    // 它原样重发；`''` 且原本就空的键才真的省略），被省略的键必须保留旧值。
    writePersona({ id: 'mix', name: 'Mix renamed' });
    assert.deepEqual(samplingLines(read()), { temperature: '0.7', top_p: '0.95', max_tokens: '512' },
      '省略采样键的更新必须原值保留（回归：改一次名就把温度清空过）');
    assert.equal(/^name:\s*Mix renamed$/m.test(read()), true, '同一次更新的改名本身生效');

    // 显式 null = 清除一个键，另外两个不受影响。
    writePersona({ id: 'mix', temperature: null });
    assert.deepEqual(samplingLines(read()), { top_p: '0.95', max_tokens: '512' },
      '显式 null 只清除该键，其余两个保留');
    assert.equal(paramsFor('mix').temperature, undefined, '清空后 paramsFor 里不再有该键');

    // 显式空串 = 同样清除。客户端现在下发 null，但 writePersona 的三态契约两者等价。
    writePersona({ id: 'mix', top_p: '' });
    assert.deepEqual(samplingLines(read()), { max_tokens: '512' },
      '显式空串与 null 等价：都是清除');

    // 有值 = 覆盖。
    writePersona({ id: 'mix', max_tokens: 2048 });
    assert.deepEqual(samplingLines(read()), { max_tokens: '2048' }, '新值覆盖旧值');
    assert.deepEqual(paramsFor('mix'), { max_tokens: 2048 }, '覆盖后 paramsFor 报的就是新值');
  });
});

test('formatPersona 字节级：有参数写三行且顺序固定；没有参数的人设一行都不多写', async () => {
  await inTempHome(async () => {
    const dir = await ensurePersonasDir(CODEX_PROMPT);

    // `description: ` 那个尾随空格是四个基础字段一直以来的格式，与采样参数无关；这里整份比对，
    // 是为了让「多写一行空 key」这种污染在任何一次改动后立刻可见。
    writePersona({ id: 'bytes', name: 'Bytes', text: 'body here', temperature: 1.5, top_p: 0, max_tokens: 256 });
    assert.equal(readFileSync(join(dir, 'bytes.md'), 'utf8'),
      ['---', 'name: Bytes', 'description: ', 'order: 100', 'enabled: true',
        'temperature: 1.5', 'top_p: 0', 'max_tokens: 256', '---', 'body here', ''].join('\n'),
      '有参数的人设：逐字节比对（行序 temperature→top_p→max_tokens、冒号后单空格、结尾一个换行、top_p: 0 不被当成未设置）');

    writePersona({ id: 'bare', name: 'Bare', text: 'plain body' });
    const bare = readFileSync(join(dir, 'bare.md'), 'utf8');
    assert.equal(bare, ['---', 'name: Bare', 'description: ', 'order: 100', 'enabled: true', '---', 'plain body', ''].join('\n'),
      '没有参数的人设：写回后不得出现任何采样行（多写一行空 key 会污染每一个用户文件）');
    assert.deepEqual(samplingLines(bare), {}, '没有任何采样参数时，三行一个都不存在');
  });
});

test('paramsFor：只返回已设置的键；内置 DeepSeek、未知 id、空 id 恒为 {}', async () => {
  await inTempHome(async () => {
    const dir = await ensurePersonasDir(CODEX_PROMPT);
    personaFile(dir, 'only.md', '---\nname: Only\ntop_p: 0.5\n---\nonly body');

    const only = paramsFor('only');
    assert.deepEqual(only, { top_p: 0.5 }, '只返回文件里真的设了的键');
    assert.deepEqual(Object.keys(only), ['top_p'], '键集合恰好是 { top_p }');
    // The host side asks `Object.hasOwn(params, 'top_p')` before touching the request, so an
    // own key carrying `undefined` would be exactly as wrong as a wrong number.
    assert.equal('temperature' in only, false, '没设置的键不得以 undefined 值出现在对象里');
    assert.equal(Object.hasOwn(only, 'max_tokens'), false, 'max_tokens 同样不得存在，连 undefined 都不行');

    only.top_p = 99;
    assert.deepEqual(paramsFor('only'), { top_p: 0.5 }, 'paramsFor 返回副本，调用方改动不回写');

    for (const id of ['DeepSeek', 'deepseek', '  DeepSeek  ', 'nope', '', '   ', null, undefined]) {
      assert.deepEqual(paramsFor(id), {}, `paramsFor(${JSON.stringify(id)}) 必须是 {}`);
    }

    writePersona({ id: 'hidden', name: 'Hidden', text: 'h', enabled: false, temperature: 0.4 });
    assert.deepEqual(paramsFor('hidden'), {}, '禁用的人设既不注入正文也不供参数，注入路径与设置同一条判断');
  });
});

test('readPersonaFile：有参数时把三件套放在 persona 里，清空后回落到 { id, text }', async () => {
  await inTempHome(async () => {
    await ensurePersonasDir(CODEX_PROMPT);
    writePersona({ id: 'edit', name: 'Edit', text: 'edit body', temperature: 0.2 });
    assert.deepEqual(readPersonaFile('edit'), { id: 'edit', text: 'edit body', persona: { temperature: 0.2 } },
      '编辑视图必须读回采样参数，否则对话框打开是空框，用户随手一存就把自己的设置抹掉');

    writePersona({ id: 'edit', temperature: null });
    assert.deepEqual(readPersonaFile('edit'), { id: 'edit', text: 'edit body' },
      '清空后不得残留 persona: {}（客户端与既有用例都按 { id, text } 读这个返回值）');
  });
});

test('writePersona 越界：不抛错、不落盘、每个键各留一条点名 warn（当前行为）', async () => {
  await inTempHome(async () => {
    const dir = await ensurePersonasDir(CODEX_PROMPT);
    let result;
    const warnings = captureWarnings(() => {
      result = writePersona({ id: 'bad', name: 'Bad', text: 'bad body', temperature: 5, top_p: -1, max_tokens: 0 });
    });
    assert.deepEqual(result, { id: 'bad' }, '越界不抛错：一个填错的数不该让整次编辑失败');
    assert.deepEqual(samplingLines(readFileSync(join(dir, 'bad.md'), 'utf8')), {},
      '三个越界值一个都不得写进 frontmatter');
    assert.deepEqual(paramsFor('bad'), {}, 'paramsFor 也不得报出越界值');
    for (const key of ['temperature', 'top_p', 'max_tokens']) {
      assert.ok(warnings.some(line => line.includes(`${key}=`) && line.includes('不合法')),
        `${key} 越界必须点名该键 warn，不能静默丢弃`);
    }
  });
});

// 已修复的回归（这条现在绿，留着它防止再退回去）：
// 旧 `mergeSampling` 把「非法/越界的新值」按 `continue` 处理，返回的 params 就是随后写盘的完整集合，
// 于是越界值不但没写进去，**原有的那个合法值也一起被删掉了**；`writePersona` 照常返回成功，
// warn 的语气还是「已忽略」。现在 `mergeSampling` 的 `if (!parsed.ok)` 分支会把文件里的旧值放回来，
// warn 也改成了「keeping the previous value」（见 src/personas.js）。
// 客户端也不再是「只做 Number.isFinite」：`personaSamplingLimitError`（见 src/client.js）在发请求前
// 判范围，命中就 `patchPersona({ error })` 并 `return`（不发请求），表单整体另有 `noValidate` 把原生
// min/max 关掉。所以越界值经 UI 到不了宿主，宿主侧 `writePersona` 的范围判断是第二道闸、不是唯一那道；
// 对直连 `/personas` 路由或手写坏文件的调用方它仍然有效，这条用例测的就是这一层。
test('回归：越界值保留文件里的旧值，不再删除已有的采样参数（曾红，现绿）', async () => {
  await inTempHome(async () => {
    const dir = await ensurePersonasDir(CODEX_PROMPT);
    writePersona({ id: 'keep', name: 'Keep', text: 'keep body', temperature: 0.7 });

    let threw = false;
    captureWarnings(() => {
      try { writePersona({ id: 'keep', temperature: 5 }); } catch { threw = true; }
    });

    const raw = readFileSync(join(dir, 'keep.md'), 'utf8');
    assert.ok(threw || /^temperature:\s*0\.7$/m.test(raw),
      '越界保存不得静默丢弃已有的 temperature: 0.7。旧实现：照常返回成功（`writePersona` 返回 `{ id }`）、'
      + `warn 一句「已忽略」，文件里的 temperature 行被删掉、parse 侧读回也是「未设置」。现在文件里是 ${JSON.stringify(samplingLines(raw))}。`
      + '现行实现：越界键保留文件里的旧值；另一种可接受的修法是让保存失败并在前端提示。');
  });
});

/** The minimal context `apply` needs: storage KV, prompt registry, and the two Connection routes. */
function fakeCtx() {
  const routes = [];
  const register = route => { routes.push(route); return () => {}; };
  return {
    routes,
    logger: { warn() {} },
    on() { return () => {}; },
    effect() { return () => {}; },
    inject(names, callback) {
      callback({ connection: { fetch: { register } } });
      return () => {};
    },
    systemPrompt: { getSectionOrder: () => 0, section() {} },
    sessionProjections: { stateOf: () => undefined, register() {} },
    sessionController: { resolveAgent: async () => ({ error: { code: 'session/not-found', message: 'missing', details: {} } }) },
    sessions: { get: () => undefined },
    storage: { backend: { get: () => ({ kv: { open: async () => ({
      loadAll: async () => ({ tables: { sessions: {} } }),
      putRecord: async () => {},
      close: async () => {},
    }) } }) } },
    connection: { fetch: { register } },
  };
}

test('路由层：temperature: null 通过 schema 并能真的清空；字符串数值被拒为人设参数无效；越界值 schema 不拦', async () => {
  await inTempHome(async () => {
    const dir = await ensurePersonasDir(CODEX_PROMPT);
    const ctx = fakeCtx();
    await apply(ctx);
    const route = ctx.routes.find(entry => entry.path === PERSONA_PATH);
    assert.ok(route, `${PERSONA_PATH} 必须被注册`);

    const call = async payload => {
      const response = await route.fetch(new Request('http://localhost' + PERSONA_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: 'test-sampling', payload }),
      }));
      return { status: response.status, result: (await response.json()).result };
    };
    const file = () => readFileSync(join(dir, 'route-style.md'), 'utf8');

    const created = await call({ action: 'create', name: 'Route Style', text: 'route body', temperature: 0.7, top_p: 0.95, max_tokens: 512 });
    assert.equal(created.status, 200, '合法 payload 走 200');
    assert.deepEqual(created.result, { ok: true, value: { id: 'route-style' } }, 'create 把三个采样键透传给 writePersona 并返回 id');
    assert.deepEqual(samplingLines(file()), { temperature: '0.7', top_p: '0.95', max_tokens: '512' },
      '三个键确实落进了文件，不是只在返回值里');

    const cleared = await call({ action: 'update', id: 'route-style', temperature: null });
    assert.equal(cleared.status, 200, 'temperature: null 必须通过 schema（200，不是 400）—— 这是「清空能生效」的前提');
    assert.equal(cleared.result.ok, true, 'update + null 返回 ok:true');
    assert.deepEqual(samplingLines(file()), { top_p: '0.95', max_tokens: '512' },
      'null 清掉了 temperature，另外两个保留');

    const stringy = await call({ action: 'update', id: 'route-style', temperature: '0.3' });
    assert.deepEqual(stringy.result, { ok: false, error: { code: 'persona/invalid', message: '人设参数无效。' } },
      '字符串数值被 schema 拒为 persona/invalid（客户端必须自己 Number()，这条钉住那个转换是必需的）');

    // schema 是 `z.number()`，没有 .min()/.max()：宿主侧的范围判断只发生在 writePersona，路由当场不拦。
    // UI 侧已由客户端的 `personaSamplingLimitError` 拦下，所以这条钉的是绕过客户端直连路由的那条路。
    const outOfRange = await call({ action: 'update', id: 'route-style', top_p: 3 });
    assert.equal(outOfRange.result.ok, true,
      '越界值 schema 不拦、请求仍报成功（宿主侧范围校验只在 writePersona；这条钉的是绕过客户端直连路由的那条路）');
  });
});
