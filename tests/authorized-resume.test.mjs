import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerAuthorizedResume, AUTHORIZED_RESUME_METHOD } from '../src/authorized-resume.js';
import { startAuthorizedResume } from '../src/authorized-resume-client.js';

function server(t) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-authorized-resume-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const file = join(home, 'codex-ui-authorized-resume.json');
  let at = 100000, route;
  registerAuthorizedResume({ connection: { fetch: { register: r => { route = r; } } } }, { home, now: () => at });
  const manifest = change => ({ requestId: 'req-one', sessionId: 'only-parent', message: 'explicitly authorized once', status: 'pending', createdAt: 99000, expiresAt: 200000, afterPid: process.pid + 1, expectedImplementation: 'speed-pipeline-v1', ...change });
  const put = change => writeFileSync(file, JSON.stringify(manifest(change)));
  const call = async payload => (await (await route.fetch(new Request('http://local/api', { method: 'POST', body: JSON.stringify({ type: 'client-request', rpcId: 'rpc', method: AUTHORIZED_RESUME_METHOD, payload: { clientId: 'browser-a', ...payload } }) }))).json()).result;
  return { file, route, put, call, setAt: n => { at = n; } };
}

test('registered authenticated host route rejects malformed envelope and actions', async t => {
  const s = server(t);
  assert.equal(s.route.path, '/api/dsh-codex-ui/authorized-resume');
  assert.deepEqual(s.route.methods, ['POST']);
  assert.equal((await s.route.fetch(new Request('http://local', { method: 'POST', body: 'bad' }))).status, 400);
  assert.equal((await s.route.fetch(new Request('http://local', { method: 'POST', body: '{}' }))).status, 400);
  assert.equal((await s.call({ action: 'other' })).ok, false);
  assert.equal((await s.call({ action: 'claim' })).value, null);
  writeFileSync(s.file, 'broken');
  assert.equal((await s.call({ action: 'claim' })).error.code, 'authorized-resume/storage');
});

test('manifest validation rejects expiry, same pid, future creation and wrong implementation', async t => {
  const s = server(t);
  for (const change of [{ expiresAt: 100000 }, { afterPid: process.pid }, { createdAt: 100001 }, { expiresAt: 99000 + 86400001 }, { expectedImplementation: 'other' }, { status: 'unknown' }, { message: ' ' }, { sessionId: '' }, { afterPid: 0 }]) {
    s.put(change);
    assert.equal((await s.call({ action: 'claim' })).value, null, JSON.stringify(change));
  }
});

test('lease bounds browsers, ack persists same request and suppresses repeat', async t => {
  const s = server(t); s.put();
  const item = (await s.call({ action: 'claim' })).value;
  assert.deepEqual(item, { requestId: 'req-one', sessionId: 'only-parent', message: 'explicitly authorized once' });
  assert.equal((await s.call({ action: 'claim', clientId: 'browser-b' })).value, null);
  assert.equal((await s.call({ action: 'ack', requestId: 'wrong' })).ok, false);
  assert.equal((await s.call({ action: 'ack', requestId: 'req-one', clientId: 'browser-b' })).ok, false);
  s.setAt(130001);
  assert.equal((await s.call({ action: 'claim', clientId: 'browser-b' })).value.requestId, 'req-one');
  assert.equal((await s.call({ action: 'ack', requestId: 'req-one' })).ok, false);
  assert.equal((await s.call({ action: 'ack', requestId: 'req-one', clientId: 'browser-b' })).value.acknowledged, true);
  const saved = JSON.parse(readFileSync(s.file, 'utf8'));
  assert.equal(saved.status, 'acknowledged'); assert.equal(saved.ackPid, process.pid); assert.equal(saved.ackAt, 130001); assert.equal(saved.sessionId, 'only-parent');
  assert.equal((await s.call({ action: 'claim' })).value, null);
  assert.equal((await s.call({ action: 'ack', requestId: 'req-one' })).ok, true);
});

function client({ request, prompt = async () => undefined, maxAttempts = 4 } = {}) {
  let at = 0, next = 1; const timers = new Map(), used = [], sent = []; let cleanup;
  const ctx = { connection: { rpc: { call: async () => { throw Error('Use injected request'); } } }, effect: f => { cleanup = f(); }, sessions: { using: async (id, options, fn) => { used.push([id, options]); return fn({ binding: { session: { prompt: async (...args) => { sent.push(args); return prompt(...args); } } } }); } } };
  const dispose = startAuthorizedResume(ctx, { request, clientId: 'browser-a', now: () => at, maxAttempts, setTimeout: (f, delay) => { const id = next++; timers.set(id, { f, delay }); return id; }, clearTimeout: id => timers.delete(id) });
  const step = async () => { const [id, timer] = timers.entries().next().value ?? []; if (!timer) return; timers.delete(id); at += timer.delay; await timer.f(); };
  return { timers, used, sent, step, dispose, cleanup: () => cleanup() };
}
test('minimal context without delivery services never creates timer or RPC', () => {
  for (const ctx of [undefined, {}, { sessions: {} }, { connection: { rpc: { call() {} } } }, { sessions: { using() {} } }]) {
    let timers = 0, requests = 0;
    const dispose = startAuthorizedResume(ctx, { request: async () => { requests += 1; }, setTimeout: () => { timers += 1; return 1; } });
    assert.equal(typeof dispose, 'function'); dispose();
    assert.equal(timers, 0); assert.equal(requests, 0);
  }
});

const item = { requestId: 'req-one', sessionId: 'only-parent', message: 'authorized message' };

test('client targets only explicit session and acknowledges after accepted prompt', async () => {
  const calls = []; const c = client({ request: async p => { calls.push(p); return { ok: true, value: p.action === 'claim' ? item : { acknowledged: true } }; } });
  await c.step();
  assert.deepEqual(c.used, [['only-parent', { source: 'controllerOperation' }]]);
  assert.deepEqual(c.sent, [[[{ type: 'text', text: 'authorized message' }], 'queue']]);
  assert.deepEqual(calls.map(x => x.action), ['claim', 'ack']); assert.equal(c.timers.size, 0);
});

test('prompt errors and explicit false result never acknowledge; retry is bounded', async () => {
  for (const prompt of [async () => { throw Error('not ready'); }, async () => ({ ok: false })]) {
    const calls = []; const c = client({ prompt, maxAttempts: 2, request: async p => { calls.push(p); return { ok: true, value: item }; } });
    await c.step(); await c.step();
    assert.deepEqual(calls.map(x => x.action), ['claim', 'claim']); assert.equal(c.timers.size, 0);
  }
});

test('ack failure retries ack without repeating prompt; cleanup cancels timer', async () => {
  let acks = 0; const c = client({ request: async p => p.action === 'claim' ? { ok: true, value: item } : (++acks === 1 ? { ok: false } : { ok: true, value: { acknowledged: true } }) });
  await c.step(); await c.step(); assert.equal(c.sent.length, 1); assert.equal(acks, 2); assert.equal(c.timers.size, 0);
  const pending = client({ request: async () => ({ ok: true, value: null }) });
  pending.cleanup(); assert.equal(pending.timers.size, 0); await pending.step(); assert.equal(pending.sent.length, 0);
});

test('acknowledged server manifest does not trigger another client or session', async t => {
  const s = server(t); s.put({ status: 'acknowledged', ackAt: 99999, ackPid: process.pid });
  const c = client({ request: s.call, maxAttempts: 2 }); await c.step(); await c.step();
  assert.equal(c.sent.length, 0); assert.equal(c.used.length, 0); assert.equal(c.timers.size, 0);
});

test('absent manifest stops immediately; old pid continues waiting for restart', async t => {
  const s = server(t);
  assert.equal((await s.call({ action: 'claim' })).reason, 'absent');
  const absent = client({ request: s.call }); await absent.step();
  assert.equal(absent.timers.size, 0); assert.equal(absent.sent.length, 0);
  s.put({ afterPid: process.pid });
  const oldPid = await s.call({ action: 'claim' });
  assert.equal(oldPid.terminal, false); assert.equal(oldPid.reason, 'awaiting-restart');
  const waiting = client({ request: s.call }); await waiting.step();
  assert.equal(waiting.timers.size, 1); assert.equal(waiting.sent.length, 0); waiting.dispose();
});

test('dispose while claim pending prevents prompt', async () => {
  let resolve; const c = client({ request: () => new Promise(r => { resolve = r; }) });
  const pending = c.step(); c.dispose(); resolve({ ok: true, value: item }); await pending;
  assert.equal(c.sent.length, 0); assert.equal(c.timers.size, 0);
});