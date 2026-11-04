import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlashContext, FLASH_CONTEXT_NAME, FLASH_WAKE_KIND } from '../src/flash-context.js';

function harness() {
  const listeners = new Map(), agents = new Map();
  let provider, nextId = 0, unregistered = false;
  const emit = (name, ...args) => { for (const fn of [...(listeners.get(name) ?? [])]) fn(...args); };
  const ctx = {
    agents: { get: id => agents.get(id) },
    on(name, fn) { const list = listeners.get(name) ?? new Set(); list.add(fn); listeners.set(name, list); return () => list.delete(fn); },
    systemPrompt: { context(value) { provider = value; return () => { unregistered = true; }; } }
  };
  const api = createFlashContext(ctx, { createUserMessage: data => ({ id: `m${++nextId}`, ...data }) });
  function parent(id = 'p', status = 'running') {
    const queue = [], calls = [];
    const p = { id, status, session: { id }, calls, queue,
      inject(message) { calls.push(['inject', message]); queue.push(message); },
      steer(message) { calls.push(['steer', message]); queue.push(message); },
      inbox: { remove(id) { const i = queue.findIndex(m => m.id === id); if (i < 0) return false; queue.splice(i, 1); return true; } }
    };
    agents.set(id, p); return p;
  }
  function claim(p) { const message = p.queue.shift(); emit('agent/inbox/claimed', { agent: p, message }); return message; }
  function commit(p, text = api.text({ agent: p }), source = {}) {
    emit('session/event', p.session, { type: 'user/message', data: { source: { kind: 'runtime-context', form: 'snapshot', sections: [{ name: FLASH_CONTEXT_NAME, text }], ...source } } });
  }
  return { api, parent, emit, agents, claim, commit, provider: () => provider, unregistered: () => unregistered };
}
const facts = text => JSON.parse(text.split('\n')[1]);

test('formal literal context registration; provider reads are pure and parent-isolated', () => {
  const h = harness(), a = h.parent('a'), b = h.parent('b');
  assert.equal(h.provider().name, FLASH_CONTEXT_NAME); assert.equal(h.provider().interpolate, false); assert(Number.isFinite(h.provider().order));
  h.api.notify(a, { kind: 'artifact', message: '{{literal}}' });
  const first = h.provider().text({ agent: a });
  assert.match(first, /\{\{literal\}\}/); assert.equal(h.api.text({ agent: b }), ''); assert.equal(h.api.text(), '');
  assert.equal(h.provider().text({ agent: a }), first); assert.equal(a.calls.length, 1);
  assert.deepEqual(h.api.pending(a), { version: 1, acknowledged: 0, pending: true, markerQueued: true, markerMode: 'inject', factCount: 1 });
  assert.deepEqual(h.api.pending(b), { version: 0, acknowledged: 0, pending: false, markerQueued: false, markerMode: null, factCount: 0 });
});

test('running inject and idle steer carry instructions-only micro markers', () => {
  const h = harness(), a = h.parent('a'), b = h.parent('b', 'idle');
  h.api.notify(a, { kind: 'help', message: 'secret body'.repeat(200) }); h.api.notify(b, { kind: 'artifact', message: 'payload' });
  assert.equal(a.calls[0][0], 'inject'); assert.equal(b.calls[0][0], 'steer');
  for (const p of [a, b]) { const m = p.calls[0][1]; assert.deepEqual(m.source, { kind: FLASH_WAKE_KIND, form: 'instructions' }); assert(m.content[0].text.length < 120); assert.equal(m.content[0].text.includes('secret body'), false); assert.equal(m.content[0].text.includes('payload'), false); }
});

test('coalesce pending marker, but allow a fresh marker immediately after claim', () => {
  const h = harness(), p = h.parent();
  h.api.notify(p, { kind: 'artifact', message: 'one' }); h.api.notify(p, { kind: 'help', message: 'two' });
  assert.equal(p.calls.length, 1); h.claim(p); assert.equal(h.api.pending(p).pending, true);
  h.api.notify(p, { kind: 'branch-complete', message: 'late' }); assert.equal(p.calls.length, 2);
  assert.deepEqual(facts(h.api.text({ agent: p })).facts.map(x => x.message), ['one', 'two', 'late']);
});

for (const initialStatus of ['running', 'idle']) test(`discarded ${initialStatus} marker clears without acknowledgment or immediate wake`, () => {
  const h = harness(), p = h.parent('p', initialStatus);
  h.api.notify(p, { kind: 'artifact', message: 'retained before cancel' });
  const message = p.queue.shift(), before = h.api.text({ agent: p });
  h.emit('agent/inbox/discarded', { agent: p, message });
  assert.equal(h.api.pending(p).markerQueued, false); assert.equal(h.api.pending(p).acknowledged, 0);
  assert.equal(h.api.pending(p).pending, true); assert.equal(h.api.text({ agent: p }), before); assert.equal(p.calls.length, 1);
  p.status = 'idle'; h.emit('agent/status', { agent: p, status: 'idle' }); assert.equal(p.calls.length, 1);
  h.api.notify(p, { kind: 'branch-complete', message: 'late' });
  assert.equal(p.calls.length, 2); assert.equal(p.calls[1][0], 'steer'); assert.equal(p.queue.length, 1);
  h.emit('agent/inbox/discarded', { agent: p, message });
  assert.equal(h.api.pending(p).markerQueued, true);
  assert.deepEqual(facts(h.api.text({ agent: p })).facts.map(x => x.message), ['retained before cancel', 'late']);
});

test('discarded unrelated messages and other parents leave the owned marker intact', () => {
  const h = harness(), p = h.parent(), other = h.parent('other'); h.api.notify(p, { kind: 'help', message: 'pending' });
  h.emit('agent/inbox/discarded', { agent: p, message: { id: 'unrelated' } });
  h.emit('agent/inbox/discarded', { agent: other, message: p.queue[0] });
  assert.equal(h.api.pending(p).markerQueued, true); assert.equal(p.calls.length, 1);
});

test('only exact own section on committed runtime-context snapshot acknowledges', () => {
  const h = harness(), p = h.parent(), other = h.parent('other');
  h.api.notify(p, { kind: 'artifact', message: 'one' }); const text = h.api.text({ agent: p });
  h.provider().text({ agent: p }); assert.equal(h.api.pending(p).pending, true);
  for (const source of [{ kind: 'agent-message' }, { form: 'instructions' }, { sections: [{ name: 'other', text }] }, { sections: [{ name: FLASH_CONTEXT_NAME, text: text + 'altered' }] }]) { h.commit(p, text, source); assert.equal(h.api.pending(p).pending, true); }
  h.commit(other, text); assert.equal(h.api.pending(p).pending, true);
  h.emit('session/event', p.session, { type: 'assistant/message', data: { source: { kind: 'runtime-context', form: 'snapshot', sections: [{ name: FLASH_CONTEXT_NAME, text }] } } }); assert.equal(h.api.pending(p).pending, true);
  h.commit(p); assert.equal(h.api.pending(p).pending, false); assert.equal(h.api.text({ agent: p }), text);
});

test('old snapshot commits never acknowledge later notifications', () => {
  const h = harness(), p = h.parent();
  h.api.notify(p, { kind: 'artifact', message: 'one' }); const first = h.api.text({ agent: p });
  h.api.notify(p, { kind: 'help', message: 'two' }); h.commit(p, first); assert.equal(h.api.pending(p).pending, true);
  h.commit(p); assert.equal(h.api.pending(p).pending, false); h.commit(p, first); assert.equal(h.api.pending(p).pending, false);
});

test('idle transition upgrades an unclaimed injected marker using inbox.remove', () => {
  const h = harness(), p = h.parent(); h.api.notify(p, { kind: 'artifact', message: 'one' }); const first = p.queue[0].id;
  p.status = 'idle'; h.emit('agent/status', { agent: p, status: 'idle' });
  assert.deepEqual(p.calls.map(x => x[0]), ['inject', 'steer']); assert.equal(p.queue.length, 1); assert.notEqual(p.queue[0].id, first);
  h.emit('agent/status', { agent: p, status: 'idle' }); assert.equal(p.calls.length, 2);
});

for (const unavailable of ['missing', 'false']) test(`idle upgrade preserves original queue when inbox.remove is ${unavailable}`, () => {
  const h = harness(), p = h.parent(); h.api.notify(p, { kind: 'help', message: 'do not lose' }); const first = p.queue[0];
  if (unavailable === 'missing') delete p.inbox.remove; else p.inbox.remove = () => false;
  p.status = 'idle'; h.emit('agent/status', { agent: p, status: 'idle' }); h.api.notify(p, { kind: 'artifact', message: 'later' });
  assert.equal(p.calls.length, 1); assert.equal(p.queue[0], first); assert.match(h.api.text({ agent: p }), /do not lose/); assert.equal(h.api.pending(p).pending, true);
});

test('fact count and body are bounded while unacknowledged help survives eviction', () => {
  const h = harness(), p = h.parent(); h.api.notify(p, { kind: 'help', message: 'retain this help' });
  for (let i = 0; i < 150; i++) h.api.notify(p, { kind: 'progress', message: `${i}:` + 'x'.repeat(2000) });
  const text = h.api.text({ agent: p }), data = facts(text);
  assert(data.facts.length <= 64); assert(text.length <= 96000); assert(data.facts.some(x => x.message === 'retain this help')); assert.match(data.facts.at(-1).message, /^149:/);
});

test('full pending-help capacity fails visibly without changing accepted state', () => {
  const h = harness(), p = h.parent(); for (let i = 0; i < 64; i++) h.api.notify(p, { kind: 'help', message: `help${i}` });
  const before = h.api.text({ agent: p }); assert.throws(() => h.api.notify(p, { kind: 'help', message: 'overflow' }), /capacity exceeded/); assert.equal(h.api.text({ agent: p }), before);
  h.commit(p); h.api.notify(p, { kind: 'help', message: 'after acknowledgment' }); assert.equal(facts(h.api.text({ agent: p })).facts.length, 64);
});

for (const kind of ['help', 'artifact', 'branch-complete', 'branch-failed', 'run-complete', 'run-failed']) {
  test(`unacknowledged ${kind} survives pressure and full capacity rejects atomically`, () => {
    const h = harness(), p = h.parent();
    for (let i = 0; i < 64; i++) h.api.notify(p, { kind, message: `${kind}${i}` });
    const before = h.api.text({ agent: p }), pending = h.api.pending(p), calls = p.calls.length;
    for (const incomingKind of [kind, 'progress']) {
      assert.throws(() => h.api.notify(p, { kind: incomingKind, message: 'overflow' }), /capacity exceeded/);
      assert.equal(h.api.text({ agent: p }), before); assert.deepEqual(h.api.pending(p), pending); assert.equal(p.calls.length, calls);
    }
    h.commit(p); h.api.notify(p, { kind, message: 'after acknowledgment' });
    assert.equal(h.api.pending(p).version, 65); assert.equal(facts(h.api.text({ agent: p })).facts.length, 64);
    assert.equal(facts(h.api.text({ agent: p })).facts.at(-1).message, 'after acknowledgment');
  });
}

test('pending protected facts survive progress eviction and character overflow rejection', () => {
  const h = harness(), p = h.parent(), kinds = ['help', 'artifact', 'branch-complete', 'branch-failed', 'run-complete', 'run-failed'];
  for (const kind of kinds) h.api.notify(p, { kind, message: kind });
  for (let i = 0; i < 150; i++) h.api.notify(p, { kind: 'progress', message: `${i}:` + 'x'.repeat(2000) });
  const before = h.api.text({ agent: p }), pending = h.api.pending(p);
  assert(before.length <= 96000); assert(facts(before).facts.length <= 64);
  for (const kind of kinds) assert(facts(before).facts.some(x => x.kind === kind));
  assert.throws(() => h.api.notify(p, { kind: 'artifact', message: 'x'.repeat(96000) }), /capacity exceeded/);
  assert.equal(h.api.text({ agent: p }), before); assert.deepEqual(h.api.pending(p), pending);
});

test('capacity reclamation prefers acknowledged facts over pending progress', () => {
  const h = harness(), p = h.parent();
  h.api.notify(p, { kind: 'progress', message: 'acknowledged' }); h.commit(p);
  h.api.notify(p, { kind: 'progress', message: 'pending progress' });
  for (let i = 0; i < 62; i++) h.api.notify(p, { kind: 'artifact', message: `artifact${i}` });
  h.api.notify(p, { kind: 'run-complete', message: 'terminal' });
  const data = facts(h.api.text({ agent: p })).facts;
  assert.equal(data.length, 64); assert.equal(data.some(x => x.message === 'acknowledged'), false);
  assert(data.some(x => x.message === 'pending progress')); assert.equal(data.at(-1).message, 'terminal');
});

test('caller mutation and replacement parent with same id cannot change or inherit facts', () => {
  const h = harness(), old = h.parent(); const data = { kind: 'help', nested: { body: 'original' } }; h.api.notify(old, data); data.nested.body = 'mutated';
  assert.match(h.api.text({ agent: old }), /original/); const replacement = h.parent(); assert.equal(h.api.text({ agent: replacement }), ''); assert.equal(h.api.text({ agent: old }), ''); assert.equal(h.api.pending(old).pending, false); assert.throws(() => h.api.notify(old, {}), /no longer live/);
});

test('disposed agent and whole provider stop accepting work and remove owned markers', () => {
  const h = harness(), p = h.parent(); h.api.notify(p, { kind: 'help', message: 'one' }); h.emit('agent/disposed', { agent: p }); h.agents.delete(p.id);
  assert.equal(h.api.text({ agent: p }), ''); assert.throws(() => h.api.notify(p, {}), /no longer live/);
  const q = h.parent('q'); h.api.notify(q, { kind: 'artifact', message: 'two' }); h.api.dispose(); h.api.dispose();
  assert.equal(q.queue.length, 0); assert.equal(h.unregistered(), true); assert.equal(h.api.pending(q).pending, false); assert.equal(h.api.text({ agent: q }), ''); assert.throws(() => h.api.notify(q, {}), /no longer live/);
});

test('A early and B late stay collecting until run-ready, with immediate help and pure reads', () => {
  const h = harness(), p = h.parent();
  const notify = data => h.api.notify(p, { runId: 'round-1', reportingMode: 'single-final', ...data });
  notify({ kind: 'artifact', role: 'A', message: 'A usable artifact', reporting: { phase: 'collecting' } });
  notify({ kind: 'branch-complete', role: 'A', output: 'A final', remaining: 1 });
  const early = h.api.text({ agent: p });
  assert.deepEqual(facts(early).reporting, [{ runId: 'round-1', phase: 'collecting' }]);
  assert.match(early.split('\n')[0], /round-1=collecting.*尚未收齐.*仅内部消化、提前验收与续派.*禁止每来一个分支就面向用户重复总结/);
  assert.match(early.split('\n')[0], /不要求每次工具调用前发正文进度/);
  assert.match(early.split('\n')[0], /用户直接提问\/催问\/要解释仍须及时非空回应，禁止将collecting解释为全程静默/);
  h.claim(p);
  notify({ kind: 'help', role: 'B', message: 'choose required input', waiting: true });
  assert.equal(p.calls.length, 2, 'help still immediately queues a fresh wake');
  assert.match(h.api.text({ agent: p }).split('\n')[0], /help即时处理，仅就所需决定交流，不复述产物/);
  notify({ kind: 'branch-complete', role: 'B', output: 'B late final', remaining: 0 });
  const late = h.api.text({ agent: p });
  assert.equal(facts(late).reporting[0].phase, 'collecting', 'zero executors is not final summary ready');
  notify({ kind: 'run-complete', status: 'partial', summaryAvailable: true });
  const ready = h.api.text({ agent: p }), pending = h.api.pending(p), calls = p.calls.length;
  assert.deepEqual(facts(ready).reporting, [{ runId: 'round-1', phase: 'ready' }]);
  assert.match(ready.split('\n')[0], /统一向用户报告一次.*失败\/partial\/未验证项.*此前已向用户公开内容的变化.*内部送达不等于已公开/);
  assert(facts(ready).facts.some(x => x.role === 'A' && x.kind === 'artifact'));
  assert(facts(ready).facts.some(x => x.output === 'B late final'));
  assert.equal(h.provider().text({ agent: p }), ready); assert.deepEqual(h.api.pending(p), pending); assert.equal(p.calls.length, calls);
});

for (const status of ['running', 'idle']) {
  test(`internal A early and B late facts stay readable with zero wakes until ready (${status})`, () => {
    const h = harness(), p = h.parent('p', status);
    const notify = data => h.api.notify(p, { runId: 'round-1', internalOnly: true, reporting: { phase: 'collecting' }, ...data });
    notify({ kind: 'artifact', role: 'A', message: 'early usable artifact' });
    notify({ kind: 'branch-complete', role: 'A', remaining: 1 });
    const early = h.provider().text({ agent: p });
    assert.equal(facts(early).facts[0].message, 'early usable artifact');
    assert.deepEqual(h.api.pending(p), { version: 2, acknowledged: 0, pending: true, markerQueued: false, markerMode: null, factCount: 2 });
    assert.equal(h.provider().text({ agent: p }), early);
    h.emit('agent/status', { agent: p, status });
    assert.equal(p.calls.length, 0); assert.equal(p.queue.length, 0);
    notify({ kind: 'artifact', role: 'B', message: 'late usable artifact' });
    notify({ kind: 'branch-failed', role: 'B', remaining: 0 });
    assert.equal(p.calls.length, 0); assert.equal(p.queue.length, 0);
    assert.equal(facts(h.api.text({ agent: p })).reporting[0].phase, 'collecting');
    notify({ kind: 'run-complete', status: 'partial', reporting: { phase: 'ready' } });
    // A finished run is silent on purpose: every waking message is rendered by
    // the chat UI as a turn-trigger card, and the user asked not to be interrupted
    // by it. The ready facts still reach the next turn through the snapshot.
    assert.equal(p.calls.length, 0); assert.equal(p.queue.length, 0);
    const ready = h.provider().text({ agent: p }), pending = h.api.pending(p);
    assert.equal(facts(ready).facts.length, 5); assert.equal(facts(ready).reporting[0].phase, 'ready');
    assert.equal(h.provider().text({ agent: p }), ready);
    assert.deepEqual(h.api.pending(p), pending); assert.equal(p.calls.length, 0);
  });

  for (const data of [
    { kind: 'help', reporting: { phase: 'collecting' } },
    { kind: 'progress', reporting: { phase: 'ready' } }
  ]) test(`internal ${data.kind}/${data.reporting.phase} immediately wakes (${status})`, () => {
    const h = harness(), p = h.parent('p', status);
    h.api.notify(p, { kind: 'artifact', internalOnly: true });
    h.api.notify(p, { internalOnly: true, ...data });
    assert.equal(p.calls.length, 1); assert.equal(p.queue.length, 1);
    assert.equal(p.calls[0][0], status === 'running' ? 'inject' : 'steer');
    assert.equal(facts(h.api.text({ agent: p })).facts.length, 2);
  });

  for (const kind of ['run-complete', 'run-failed']) test(`internal ${kind} stays silent (${status})`, () => {
    const h = harness(), p = h.parent('p', status);
    h.api.notify(p, { kind: 'artifact', internalOnly: true });
    h.api.notify(p, { internalOnly: true, kind, status: 'partial', reporting: { phase: 'collecting' } });
    assert.equal(p.calls.length, 0); assert.equal(p.queue.length, 0);
    assert.equal(h.api.pending(p).markerQueued, false);
    const text = h.api.text({ agent: p });
    assert.equal(facts(text).facts.length, 2, 'the terminal fact is still readable');
    assert.equal(facts(text).reporting[0].phase, 'ready', 'terminal facts still release the gate');
  });

  test(`discarded marker is not recreated by internal collecting facts (${status})`, () => {
    const h = harness(), p = h.parent('p', status);
    h.api.notify(p, { kind: 'help', internalOnly: true });
    const message = p.queue.shift(); h.emit('agent/inbox/discarded', { agent: p, message });
    h.api.notify(p, { kind: 'branch-complete', internalOnly: true, reporting: { phase: 'collecting' } });
    p.status = 'idle'; h.emit('agent/status', { agent: p, status: 'idle' });
    assert.equal(p.calls.length, 1); assert.equal(p.queue.length, 0);
    assert.equal(h.api.pending(p).markerQueued, false); assert.equal(h.api.pending(p).acknowledged, 0);
    h.api.notify(p, { kind: 'run-complete', internalOnly: true });
    // Terminal facts no longer re-arm the marker; they only land in the snapshot.
    assert.equal(p.calls.length, 1); assert.equal(p.queue.length, 0);
    assert.equal(h.api.pending(p).markerQueued, false);
  });
}

test('internal collecting notify never upgrades a marker; idle status still upgrades an existing marker', () => {
  const h = harness(), p = h.parent();
  h.api.notify(p, { kind: 'help' }); const original = p.queue[0];
  p.status = 'idle';
  h.api.notify(p, { kind: 'artifact', internalOnly: true });
  assert.equal(p.calls.length, 1); assert.equal(p.queue[0], original);
  assert.equal(h.api.pending(p).markerMode, 'inject');
  h.emit('agent/status', { agent: p, status: 'idle' });
  assert.deepEqual(p.calls.map(x => x[0]), ['inject', 'steer']); assert.equal(p.queue.length, 1);
});

test('only literal internalOnly true suppresses a collecting notification', () => {
  for (const internalOnly of [undefined, false, 'true', 1]) {
    const h = harness(), p = h.parent();
    h.api.notify(p, { kind: 'artifact', internalOnly, reporting: { phase: 'collecting' } });
    assert.equal(p.calls.length, 1);
  }
});

test('reporting gates are per-run and accept explicit ready and failed terminal facts', () => {
  const h = harness(), p = h.parent();
  h.api.notify(p, { runId: 'old', kind: 'run-complete' });
  h.api.notify(p, { runId: 'new', kind: 'artifact', reporting: { phase: 'collecting' } });
  assert.deepEqual(facts(h.api.text({ agent: p })).reporting, [{ runId: 'old', phase: 'ready' }, { runId: 'new', phase: 'collecting' }]);
  h.api.notify(p, { runId: 'new', kind: 'run-failed', error: 'summary failed' });
  h.api.notify(p, { runId: 'metadata', kind: 'progress', reporting: { phase: 'ready' } });
  assert.deepEqual(facts(h.api.text({ agent: p })).reporting, ['old', 'new', 'metadata'].map(runId => ({ runId, phase: 'ready' })));
  assert.match(h.api.text({ agent: p }), /summary failed/);
});

test('failed marker send retains context and retries on the next notify', () => {
  const h = harness(), p = h.parent(), inject = p.inject; p.inject = () => { throw Error('inbox failed'); };
  assert.throws(() => h.api.notify(p, { kind: 'help', message: 'retained' }), /inbox failed/); assert.equal(h.api.pending(p).pending, true);
  p.inject = inject; h.api.notify(p, { kind: 'artifact', message: 'retry' }); assert.equal(p.queue.length, 1); assert.match(h.api.text({ agent: p }), /retained/);
});
