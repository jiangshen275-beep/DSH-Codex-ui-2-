// The delete endpoint is the only place in this plugin that removes data, so it is exercised against
// a real temporary directory tree. What matters most is not that it deletes, but what it refuses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { purgeArchivedSession, purgedIds } from '../src/session-purge.js';

const LOG = 'session.v4.jsonl.zstd';
const ARCHIVED = 'session-aaaaaaaa-1111-2222-3333-444444444444';
const LIVE = 'session-bbbbbbbb-1111-2222-3333-444444444444';
const SUBAGENT = 'cccccccc-1111-2222-3333-444444444444';
const PROJECT = '--D-DSH-EAC-Data-dpx-dsh-environments-eac-lite-home-Documents--';

function makeHome(archived = [ARCHIVED]) {
  const root = mkdtempSync(join(tmpdir(), 'cg-purge-'));
  mkdirSync(join(root, 'storages'), { recursive: true });
  writeFileSync(join(root, 'storages', 'workspace.json'), JSON.stringify({ global: { archivedSessionIds: archived } }), 'utf8');
  const project = join(root, 'sessions', PROJECT);
  for (const id of [ARCHIVED, LIVE, SUBAGENT]) {
    mkdirSync(join(project, id), { recursive: true });
    writeFileSync(join(project, id, LOG), 'log\n', 'utf8');
  }
  return { root, project };
}

/** Every test builds its own tree; the finally clause keeps a failure from leaking one. */
function withHome(archived, run) {
  const home = makeHome(archived);
  try {
    return run(home);
  } finally {
    rmSync(home.root, { recursive: true, force: true });
  }
}

test('an archived Session log directory is removed and its neighbours are untouched', () => {
  withHome([ARCHIVED], ({ root, project }) => {
    const value = purgeArchivedSession({ root, sessionId: ARCHIVED });
    assert.equal(value.removed, join(project, ARCHIVED));
    assert.equal(value.sessionId, ARCHIVED);
    assert.equal(existsSync(join(project, ARCHIVED)), false, 'the archived log directory is gone');
    assert.equal(existsSync(join(project, LIVE, LOG)), true, 'a live Session is untouched');
    assert.equal(existsSync(join(project, SUBAGENT, LOG)), true, 'a subagent Session is untouched');
  });
});

test('a Session that is not archived is never removed', () => {
  withHome([ARCHIVED], ({ root, project }) => {
    assert.throws(() => purgeArchivedSession({ root, sessionId: LIVE }), /只能删除已归档的会话/);
    assert.equal(existsSync(join(project, LIVE, LOG)), true, 'the refusal leaves the log in place');
  });
});

test('a malformed id cannot name a directory at all', () => {
  withHome([ARCHIVED, '..', '../storages', 'a/b', 'x\\y'], ({ root, project }) => {
    for (const sessionId of ['', '..', '../storages', 'a/b', 'x\\y', 'session-..', '.hidden', 'a'.repeat(200)]) {
      assert.throws(() => purgeArchivedSession({ root, sessionId }), /会话 id 无效/, `id ${JSON.stringify(sessionId)} must be refused`);
    }
    assert.equal(existsSync(join(project, ARCHIVED, LOG)), true, 'nothing was removed by a malformed id');
  });
});

test('a directory without a Session log is kept, and only its stale archive entry is cleared', () => {
  withHome([ARCHIVED], ({ root, project }) => {
    rmSync(join(project, ARCHIVED, LOG));
    const value = purgeArchivedSession({ root, sessionId: ARCHIVED });
    assert.equal(value.removed, null, 'nothing was removed');
    assert.deepEqual(value.cleaned, ['archivedSessionIds'], 'the stale archive entry is the only thing left to drop');
    assert.equal(existsSync(join(project, ARCHIVED)), true, 'a directory that is not a log is left alone');
    const registry = JSON.parse(readFileSync(join(root, 'storages', 'workspace.json'), 'utf8'));
    assert.deepEqual(registry.global.archivedSessionIds, [], 'the id no longer keeps a row on the archive list');
  });
});

test('a missing archive list is refused rather than read as empty', () => {
  withHome([ARCHIVED], ({ root, project }) => {
    rmSync(join(root, 'storages', 'workspace.json'));
    assert.throws(() => purgeArchivedSession({ root, sessionId: ARCHIVED }), /归档列表不可读/);
    assert.equal(existsSync(join(project, ARCHIVED, LOG)), true);
  });
});

test('a subagent Session is removable by its own id once it is archived', () => {
  withHome([SUBAGENT], ({ root, project }) => {
    // Subagent logs sit under a bare id, not `session-<uuid>`: the lookup is by exact id, so both
    // layouts work and neither is guessed from the name.
    purgeArchivedSession({ root, sessionId: SUBAGENT });
    assert.equal(existsSync(join(project, SUBAGENT)), false);
    assert.equal(existsSync(join(project, ARCHIVED, LOG)), true);
  });
});

test('a junction standing in for a Session directory is refused, and its target survives', () => {
  withHome([ARCHIVED], ({ root, project }) => {
    // `rmSync(recursive)` follows a junction: without the guard this test deletes the victim.
    const victim = join(root, 'victim');
    mkdirSync(victim, { recursive: true });
    writeFileSync(join(victim, 'precious.txt'), 'keep me\n', 'utf8');
    rmSync(join(project, ARCHIVED), { recursive: true, force: true });
    symlinkSync(victim, join(project, ARCHIVED), 'junction');
    const value = purgeArchivedSession({ root, sessionId: ARCHIVED });
    assert.equal(value.removed, null, 'a junction is never the directory that gets removed');
    assert.equal(existsSync(join(victim, 'precious.txt')), true, 'the junction target is untouched');
  });
});

test('the archived and pinned indexes are cleaned with the log', () => {
  withHome([ARCHIVED], ({ root, project }) => {
    const registry = join(root, 'storages', 'workspace.json');
    writeFileSync(registry, JSON.stringify({
      unit: 'workspace',
      global: { archivedSessionIds: [ARCHIVED, LIVE], pinnedSessionIds: [ARCHIVED] },
    }, null, 2), 'utf8');
    const cache = join(root, 'storages', 'session_projcache', 'sessions');
    mkdirSync(cache, { recursive: true });
    writeFileSync(join(cache, `${ARCHIVED}.json`), '{}', 'utf8');

    const value = purgeArchivedSession({ root, sessionId: ARCHIVED });
    assert.deepEqual(value.cleaned, ['archivedSessionIds', 'pinnedSessionIds', 'session_projcache']);
    const after = JSON.parse(readFileSync(registry, 'utf8'));
    assert.deepEqual(after.global.archivedSessionIds, [LIVE], 'the removed id leaves the archive list');
    assert.deepEqual(after.global.pinnedSessionIds, [], 'and the pin list');
    assert.equal(after.unit, 'workspace', 'the rest of the registry is untouched');
    assert.equal(existsSync(join(cache, `${ARCHIVED}.json`)), false, 'the cached projection row goes too');
    assert.equal(existsSync(join(project, ARCHIVED)), false);
  });
});

test('cleanup failures never turn a successful removal into a reported failure', () => {
  withHome([ARCHIVED], ({ root, project }) => {
    // A registry that cannot be parsed is the realistic case: the row is stale but harmless, and
    // every list surface already skips ids whose log is gone.
    writeFileSync(join(root, 'storages', 'workspace.json'), '{ this is not json', 'utf8');
    assert.throws(() => purgeArchivedSession({ root, sessionId: ARCHIVED }), /归档列表不可读/);
    // With a readable registry but an unwritable storages directory the removal still succeeds.
    writeFileSync(join(root, 'storages', 'workspace.json'), JSON.stringify({ global: { archivedSessionIds: [ARCHIVED] } }), 'utf8');
    rmSync(join(root, 'storages', 'session_projcache'), { recursive: true, force: true });
    const value = purgeArchivedSession({ root, sessionId: ARCHIVED });
    assert.deepEqual(value.cleaned, ['archivedSessionIds'], 'a missing cache row is simply not reported');
    assert.equal(existsSync(join(project, ARCHIVED)), false);
  });
});

test('删掉的会话 id 会落盘，重启后还能读回来', () => {
  // 这是「删掉的子代理重启后回魂」的根因：删除只写进内存里的 Set，重启就空了，
  // 而宿主那边索引条目还在，于是它们又回到列表里、点开只得到「数据已不存在」。
  const sandbox = mkdtempSync(join(tmpdir(), 'purge-remember-'));
  const root = join(sandbox, 'home');
  mkdirSync(join(root, 'storages'), { recursive: true });
  mkdirSync(join(root, 'sessions', 'proj', 'session-abc'), { recursive: true });
  writeFileSync(join(root, 'sessions', 'proj', 'session-abc', 'session.v4.jsonl.zstd'), 'x');
  writeFileSync(join(root, 'storages', 'workspace.json'), JSON.stringify({ global: { archivedSessionIds: ['session-abc'] } }));
  assert.deepEqual(purgedIds(root), [], '一开始没有记录');
  purgeArchivedSession({ root, sessionId: 'session-abc' });
  assert.deepEqual(purgedIds(root), ['session-abc'], '删完要记下来');
  // 重复删同一个 id 不该产生重复记录。
  writeFileSync(join(root, 'storages', 'workspace.json'), JSON.stringify({ global: { archivedSessionIds: ['session-abc'] } }));
  purgeArchivedSession({ root, sessionId: 'session-abc' });
  assert.deepEqual(purgedIds(root), ['session-abc'], '不重复记账');
  rmSync(sandbox, { recursive: true, force: true });
});
