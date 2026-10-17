// Personas half: the file format, the ordering, the two protected ids, and the
// `/api/chatgpt-ui/personas` route. Built-ins only, so it runs from the workspace
// without a DSH runtime — an isolated environment has no `~/.dsh-win/versions/...`
// tree, and `tests/prompt-modes.test.mjs` documents what a missing runtime costs.
//
// Every case points `DSH_HOME` at a fresh `mkdtemp` directory and removes it
// afterwards: a test that wrote to the real `dsh-home` would overwrite the user's
// own persona files, which is the one thing this suite must never risk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  BUILTIN_ID, CODEX_ID, deletePersona, ensurePersonasDir, listPersonas, loadPersonas,
  personasDir, readPersonaFile, resolvePersonaId, textFor, writePersona,
} from '../src/personas.js';
import { PERSONA_PATH, apply, CODEX_PROMPT } from '../src/prompt-modes.js';

/** A throwaway `DSH_HOME`, removed even when the test throws. */
async function inTempHome(fn) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-personas-'));
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

/** Run with no `$DSH_HOME` at all, the way a host that publishes no home looks. */
async function withoutHome(fn) {
  const previous = process.env.DSH_HOME;
  delete process.env.DSH_HOME;
  try {
    return await fn();
  } finally {
    if (previous !== undefined) process.env.DSH_HOME = previous;
  }
}

/** Write a persona file verbatim, so each test states exactly the bytes it parses. */
function personaFile(dir, name, content) {
  writeFileSync(join(dir, name), content, 'utf8');
}

/** Collect `console.warn` text emitted while `fn` runs; parse failures are warnings, not throws. */
async function captureWarnings(fn) {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    await fn();
  } finally {
    console.warn = original;
  }
  return warnings;
}

const ids = personas => personas.map(persona => persona.id);
const find = id => listPersonas().find(persona => persona.id === id);

test('without DSH_HOME the built-in rows still load, and writes report persona/no-home', async () => {
  await withoutHome(async () => {
    assert.equal(personasDir(), null, '没有 DSH_HOME 时应返回 null 而不是拼接路径');
    const personas = loadPersonas();
    assert.deepEqual(ids(personas), ['DeepSeek', 'codex'], '无 home 也必须列出内置 DeepSeek 与合成的 Codex');
    assert.equal(personas[0].id, BUILTIN_ID, '第一行固定是内置 DeepSeek');
    assert.equal(personas[0].text, '', '内置 DeepSeek 的正文字面为空，这就是“不注入任何东西”');
    const codex = personas.find(persona => persona.id === CODEX_ID);
    assert.equal(codex.text, CODEX_PROMPT, '文件缺席时合成的 Codex 用回源码里的常量正文');
    assert.equal(codex.builtin, true, '合成行标记为 builtin');
    assert.equal(await ensurePersonasDir(CODEX_PROMPT), null, '没有 home 时 ensurePersonasDir 返回 null');
    assert.throws(() => writePersona({ id: 'x', text: 'y' }), error => error.code === 'persona/no-home',
      '无 home 时 writePersona 抛 persona/no-home');
    // `deletePersona` now checks the home *before* id resolution and before the protected-id checks, so
    // with no home every delete reports no-home — including the built-in row, which the guard never lets
    // the later protection check reach. Pinned so that ordering stays a decision rather than an accident.
    assert.throws(() => deletePersona('ghost'), error => error.code === 'persona/no-home',
      '无 home 时删除未知 id 抛 persona/no-home：no-home 检查已在解析与保护检查之前');
    assert.throws(() => deletePersona('DeepSeek'), error => error.code === 'persona/no-home',
      '无 home 时删内置也先报 no-home：没有 home 就没有文件可删，保护检查到不了');
  });
});

test('ensurePersonasDir creates the directory, seeds codex.md, and never overwrites it', async () => {
  await inTempHome(async home => {
    const expected = join(home, 'personas');
    const dir = await ensurePersonasDir(CODEX_PROMPT);
    assert.equal(dir, expected, 'ensurePersonasDir 返回 $DSH_HOME/personas');
    assert.equal(existsSync(join(dir, 'codex.md')), true, '首次调用必须在磁盘上种下 codex.md');
    assert.equal(textFor('Codex'), CODEX_PROMPT, '种下的正文等于传进来的 CODEX_PROMPT，一字不差');

    personaFile(dir, 'codex.md', '---\nname: Mine\norder: 0\n---\nhand edited body');
    await ensurePersonasDir(CODEX_PROMPT);
    assert.equal(readFileSync(join(dir, 'codex.md'), 'utf8'),
      '---\nname: Mine\norder: 0\n---\nhand edited body', '第二次调用不得覆盖用户对 codex.md 的修改');
    assert.equal(textFor('codex'), 'hand edited body', '用户改过的正文仍然生效');

    // The seed also exists for callers that never hand the constant in: `loadPersonas` re-seeds a deleted
    // file from `prompts/codex.txt`, which is what keeps `Codex` resolving after a hand-deleted seed.
    rmSync(join(dir, 'codex.md'));
    assert.equal(textFor('codex'), CODEX_PROMPT, 'codex.md 被删掉后 loadPersonas 从源码常量重新种回');
    assert.equal(existsSync(join(dir, 'codex.md')), true, '重新种回的是真实文件，不只是内存行');
  });
});

test('frontmatter parsing degrades to defaults instead of dropping the persona', async () => {
  await inTempHome(async home => {
    const dir = await ensurePersonasDir(CODEX_PROMPT);

    personaFile(dir, 'bare.md', 'bare body line\nsecond line');
    const bare = loadPersonas().find(persona => persona.id === 'bare');
    assert.equal(bare.text, 'bare body line\nsecond line', '没有 frontmatter 时整篇都是正文');
    assert.equal(bare.description, '', '没有 frontmatter 时不猜 description');
    assert.equal(bare.name, 'bare', '没有 name 时回落到文件主干名');
    assert.equal(bare.order, 100, '没有 order 时回落到 DEFAULT_ORDER=100');
    assert.equal(bare.enabled, true, '没有 enabled 时默认启用');

    personaFile(dir, 'half.md', '---\nname: Half\nhalf body');
    const warnings = await captureWarnings(() => { loadPersonas(); });
    const half = loadPersonas().find(persona => persona.id === 'half');
    assert.equal(half.text, '---\nname: Half\nhalf body', '只有上半个 --- 时整篇当正文，连那行 --- 也算');
    assert.equal(half.description, '', '未闭合时不派生 description');
    assert.equal(half.name, 'half', '未闭合的 frontmatter 不生效，name 回落文件主干名');
    assert.ok(warnings.some(line => line.includes('frontmatter 未闭合')), '未闭合必须以警告形式说明，而不是静默');

    personaFile(dir, 'badorder.md', '---\nname: BadOrder\norder: abc\n---\nbody');
    assert.equal(find('badorder').order, 100, 'order: abc 无法解析时回落 DEFAULT_ORDER');

    personaFile(dir, 'bom.md', '\uFEFF---\nname: Bom\n---\nbom body');
    assert.equal(find('bom')?.name, 'Bom', '带 UTF-8 BOM 的文件仍能解析 frontmatter');

    personaFile(dir, 'nodesc.md', '---\nname: NoDesc\n---\nDerived first line\nsecond');
    assert.equal(find('nodesc').description, 'Derived first line', '有 frontmatter 但无 description 时取正文首行');
    personaFile(dir, 'longdesc.md', `---\nname: LongDesc\n---\n${'x'.repeat(50)}`);
    assert.equal(find('longdesc').description, 'x'.repeat(40), '派生 description 截断到 40 字符');
  });
});

test('enabled accepts yes/1/TRUE and rejects false/no/0/off', async () => {
  await inTempHome(async home => {
    const dir = await ensurePersonasDir(CODEX_PROMPT);
    const variants = { on_yes: 'yes', on_one: '1', on_TRUE: 'TRUE', off_false: 'false', off_no: 'no', off_zero: '0', off_off: 'off' };
    for (const [stem, value] of Object.entries(variants)) {
      personaFile(dir, `${stem}.md`, `---\nname: ${stem}\nenabled: ${value}\n---\nbody of ${stem}`);
    }
    const listed = ids(listPersonas());
    assert.deepEqual(listed.filter(id => id.startsWith('on_')).sort(), ['on_TRUE', 'on_one', 'on_yes'],
      'enabled: yes / 1 / TRUE 都按开启处理');
    assert.deepEqual(listed.filter(id => id.startsWith('off_')), [],
      'enabled: false / no / 0 / off 都不列出');
  });
});

test('ordering: DeepSeek first, codex second, then order and name', async () => {
  await inTempHome(async home => {
    const dir = await ensurePersonasDir(CODEX_PROMPT);
    personaFile(dir, 'zeta.md', '---\nname: Zeta\norder: 5\n---\nz');
    personaFile(dir, 'alpha.md', '---\nname: Alpha\norder: 10\n---\na');
    personaFile(dir, 'beta.md', '---\nname: Beta\norder: 10\n---\nb');
    assert.deepEqual(ids(listPersonas()), ['DeepSeek', 'codex', 'zeta', 'alpha', 'beta'],
      '内置首行、codex 次行、其余按 order 再按 name');
    assert.equal(loadPersonas().find(persona => persona.id === BUILTIN_ID).text, '', '内置 DeepSeek 始终没有正文');
    assert.equal(listPersonas().every(persona => !('text' in persona)), true,
      'listPersonas 不带正文，菜单用不到它');
  });
});

test('codex is second only because 0 is the lowest order; a name tie at 0 can precede it', async () => {
  await inTempHome(async home => {
    const dir = await ensurePersonasDir(CODEX_PROMPT);
    personaFile(dir, 'aaa.md', '---\nname: AAA\norder: 0\n---\na');
    // Observed, not desired: `comparePersonas` ranks the built-in row with -1e9 and then sorts Codex at
    // order 0 with every other order-0 file, so "Codex" wins only by name. Pinned so a later change to
    // the ranking is a visible decision rather than a silent reorder.
    assert.deepEqual(ids(listPersonas()), ['DeepSeek', 'aaa', 'codex'],
      'order: 0 且 name 排在 "Codex" 之前的人设会插到 codex 前面（按 name 决胜）');
  });
});

test('resolvePersonaId: exact, letter-case-insensitive, unknown to null', async () => {
  await inTempHome(async home => {
    const dir = await ensurePersonasDir(CODEX_PROMPT);
    assert.equal(resolvePersonaId('codex'), 'codex', '精确命中 codex');
    assert.equal(resolvePersonaId('Codex'), 'codex', '旧会话存的 Codex 解析到 codex');
    assert.equal(resolvePersonaId('CODEX'), 'codex', '全大写同样命中');
    assert.equal(resolvePersonaId('deepseek'), 'DeepSeek', '小写 deepseek 解析到内置 DeepSeek');
    assert.equal(resolvePersonaId('DeepSeek'), 'DeepSeek', '内置 id 精确命中');
    assert.equal(resolvePersonaId('  codex  '), 'codex', '两端空白被裁掉');
    assert.equal(resolvePersonaId('nope'), null, '未知 id 返回 null');
    assert.equal(resolvePersonaId(''), null, '空串返回 null');
    assert.equal(resolvePersonaId(42), null, '非字符串返回 null');
    assert.equal(resolvePersonaId(null), null, 'null 返回 null');

    personaFile(dir, 'MyStyle.md', '---\nname: MyStyle\n---\nmy style body');
    assert.equal(resolvePersonaId('mystyle'), 'MyStyle', '大小写不同也解析到文件的真实主干名');
    // The duplicate-stem guard (`mystyle.md` vs `MyStyle.md`) cannot be built here: NTFS is
    // case-insensitive, so the second write lands on the first file and `readdir` shows one entry.
    // Recorded as untested on this platform rather than asserted through a fake directory.
  });
});

test('writePersona rejects a missing id and the built-in DeepSeek', async () => {
  await inTempHome(async home => {
    const dir = await ensurePersonasDir(CODEX_PROMPT);
    assert.throws(() => writePersona({ name: 'NoId', text: 'x' }), error => error.code === 'persona/invalid',
      'id 缺失抛 persona/invalid');
    assert.throws(() => writePersona({ id: '   ', text: 'x' }), error => error.code === 'persona/invalid',
      'id 全是空白抛 persona/invalid');
    assert.throws(() => writePersona(), error => error.code === 'persona/invalid',
      '完全没有参数抛 persona/invalid');
    assert.throws(() => writePersona({ id: 'DeepSeek', text: 'x' }), error => error.code === 'persona/protected',
      '写入内置 DeepSeek 抛 persona/protected');
    assert.throws(() => writePersona({ id: 'deepseek', text: 'x' }), error => error.code === 'persona/protected',
      '大小写不同也无法写入内置 DeepSeek');
    assert.deepEqual(readdirSync(dir).filter(name => name.toLowerCase().startsWith('deepseek')), [],
      '被拒的写入不得在磁盘上留下任何文件');
  });
});

test('writePersona keeps the body when the update omits text', async () => {
  await inTempHome(async home => {
    await ensurePersonasDir(CODEX_PROMPT);
    writePersona({ id: 'keep', name: 'Keep', text: 'original body', order: 7 });
    assert.equal(textFor('keep'), 'original body', '新建时正文写入成功');

    writePersona({ id: 'keep', name: 'Keep renamed' });
    assert.equal(textFor('keep'), 'original body', '省略 text 的改名必须保留原正文（回归：曾把正文清空）');
    assert.equal(find('keep').name, 'Keep renamed', '改名本身生效');
    assert.equal(find('keep').order, 7, '未传 order 时沿用原 order');
  });
});

test('writePersona also keeps body, order and enabled for a disabled persona', async () => {
  await inTempHome(async home => {
    const dir = await ensurePersonasDir(CODEX_PROMPT);
    personaFile(dir, 'quiet.md', '---\nname: Quiet\norder: 30\nenabled: false\n---\nquiet body text');
    writePersona({ id: 'quiet', name: 'Quiet renamed' });
    const raw = readFileSync(join(dir, 'quiet.md'), 'utf8');
    // The body is taken out of the file itself, never through `textFor`: `textFor` is the injection view
    // and returns '' for a disabled persona by design, so it cannot witness what an update wrote back.
    const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
    assert.deepEqual(
      {
        body,
        order: /^order:\s*(.*)$/m.exec(raw)?.[1],
        enabled: /^enabled:\s*(.*)$/m.exec(raw)?.[1],
      },
      { body: 'quiet body text', order: '30', enabled: 'false' },
      '回归保护：对 enabled: false 的人设做不传 text 的更新，正文必须保留、order 必须仍是 30、'
      + 'enabled 必须仍是 false（writePersona 已按文件名找 existing，不再经过会过滤 disabled 的 loadPersonas）',
    );
  });
});

test('enabled: false is invisible to the list and to injection, yet editable and deletable on disk', async () => {
  await inTempHome(async home => {
    const dir = await ensurePersonasDir(CODEX_PROMPT);
    const content = '---\nname: Quiet\norder: 30\nenabled: false\n---\nquiet body text';
    personaFile(dir, 'quiet.md', content);
    assert.equal(ids(listPersonas()).includes('quiet'), false, 'disabled 人设不出现在菜单里');
    assert.equal(textFor('quiet'), '', 'disabled 人设不注入任何正文');
    // Resolution still answers null, because resolution answers "may this be injected". Editing and
    // deleting work on the file instead, so a hidden persona is neither unreadable nor undeletable.
    assert.equal(resolvePersonaId('quiet'), null,
      '解析仍返回 null，因为解析回答的是“能不能注入”；编辑与删除走文件，不受影响');
    assert.deepEqual(readPersonaFile('quiet'), { id: 'quiet', text: 'quiet body text' },
      '禁用不等于删除：编辑视图能按文件名读到正文，否则用户永远无法改好再启用');
    assert.equal(existsSync(join(dir, 'quiet.md')), true, '文件必须还在磁盘上，用户才能改回 enabled');
    assert.equal(readFileSync(join(dir, 'quiet.md'), 'utf8'), content, '文件内容一字不改');

    assert.deepEqual(deletePersona('quiet'), { id: 'quiet' }, '禁用的人设同样可删：删除按文件名查找，不查列表');
    assert.equal(existsSync(join(dir, 'quiet.md')), false, '删除后文件确实消失');
  });
});

test('deletePersona protects DeepSeek and codex, removes a normal file, and rejects unknown ids', async () => {
  await inTempHome(async home => {
    const dir = await ensurePersonasDir(CODEX_PROMPT);
    for (const id of ['DeepSeek', 'deepseek', CODEX_ID, 'Codex']) {
      assert.throws(() => deletePersona(id), error => error.code === 'persona/protected',
        `删除 ${id} 抛 persona/protected`);
    }
    assert.equal(existsSync(join(dir, 'codex.md')), true, '受保护的 codex.md 不能被删掉');

    writePersona({ id: 'gone', name: 'Gone', text: 'bye' });
    assert.deepEqual(deletePersona('gone'), { id: 'gone' }, '删除普通项返回被删的 id');
    assert.equal(existsSync(join(dir, 'gone.md')), false, '删除普通项后文件消失');
    assert.equal(ids(listPersonas()).includes('gone'), false, '删除后不再出现在列表里');

    assert.throws(() => deletePersona('missing'), error => error.code === 'persona/not-found',
      '删除未知 id 抛 persona/not-found');
    assert.throws(() => deletePersona(''), error => error.code === 'persona/invalid',
      '删除空 id 抛 persona/invalid：空标识先被拒，还没走到文件查找');
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

test('the personas route serves list and read, and every failure is a value', async () => {
  await inTempHome(async () => {
    const ctx = fakeCtx();
    await apply(ctx);
    const route = ctx.routes.find(entry => entry.path === PERSONA_PATH);
    assert.ok(route, `${PERSONA_PATH} 必须被注册`);
    assert.deepEqual(route.methods, ['POST'], '人设路由只收 POST');

    const call = async payload => {
      const response = await route.fetch(new Request('http://localhost' + PERSONA_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: 'test-personas', payload }),
      }));
      return (await response.json()).result;
    };

    const listed = await call({ action: 'list' });
    assert.equal(listed.ok, true, 'list 返回 ok:true');
    assert.deepEqual(ids(listed.value.personas), ['DeepSeek', 'codex'], 'list 含内置 DeepSeek 与 codex');
    assert.equal('text' in listed.value.personas[1], false, 'list 不返回正文');

    const created = await call({ action: 'create', name: 'My Style', text: 'style body' });
    assert.deepEqual(created, { ok: true, value: { id: 'my-style' } }, 'create 把人设名称 slug 成 id');
    assert.deepEqual(await call({ action: 'read', id: 'MY-STYLE' }), { ok: true, value: { id: 'my-style', text: 'style body' } },
      'read 大小写无关地解析到该人设并返回正文');
    assert.equal((await call({ action: 'read', id: 'My Style' })).error.code, 'persona/not-found',
      'read 只认 id，不认显示名（客户端必须回传 create 返回的 id）');

    const renamed = await call({ action: 'update', id: 'my-style', name: 'Renamed' });
    assert.equal(renamed.ok, true, 'update 成功');
    assert.deepEqual((await call({ action: 'read', id: 'my-style' })).value,
      { id: 'my-style', text: 'style body' }, '路由层省略 text 的更新同样保留正文');

    assert.deepEqual(await call({ action: 'read', id: 'nope' }),
      { ok: false, error: { code: 'persona/not-found', message: '人设不存在。' } }, '未知 id 的 read 返回 { ok:false }');
    assert.equal((await call({ action: 'update', id: 'DeepSeek', name: 'x' })).error.code, 'persona/protected',
      'update 内置 DeepSeek 返回 persona/protected');
    assert.equal((await call({ action: 'create', name: 'MY STYLE', text: 'other' })).error.code, 'persona/exists',
      'create 与既有 id 相同的名称（大小写无关，按 slug 判定）返回 persona/exists');
    assert.equal((await call({ action: 'nuke' })).error.code, 'persona/invalid', '未知 action 返回 persona/invalid');

    assert.equal((await call({ action: 'delete', id: 'my-style' })).ok, true, 'delete 成功');
    assert.equal((await call({ action: 'read', id: 'my-style' })).error.code, 'persona/not-found',
      '删除后 read 返回 not-found');
  });
});
