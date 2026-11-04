import test from 'node:test';
import assert from 'node:assert/strict';
import { SuperfastSpeedCoordinator } from '../src/superfast-speed-coordinator.js';
const gate = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const tick = () => new Promise(r => setImmediate(r));
const until = async fn => { for (let i = 0; i < 1000; i++) { if (fn()) return; await tick(); } throw Error('condition did not settle'); };
const task = (n = 2) => ({ objective: 'speed', branches: Array.from({ length: n }, (_, i) => ({ task: 'task ' + i, write_paths: [] })) });
const p = () => ({ id: Math.random().toString() });

for (const n of [8, 32]) test(`${n} executors truly overlap; no S invocation and timers clear`, async () => {
  const leaf = gate(), parent = p(); let active = 0, peak = 0, calls = 0;
  const c = new SuperfastSpeedCoordinator({ execute: async job => {
    assert.equal(job.kind, 'executor'); calls++; active++; peak = Math.max(peak, active);
    try { await leaf.promise; return job.role; } finally { active--; }
  } });
  try {
    const v = c.start(parent, task(n)); await until(() => active === n);
    assert.equal(peak, n); assert.equal(c.view(c.require(parent, v.runId)).capacity, 32 - n);
    leaf.resolve(); let final;
    // Every branch is independently observable; there can be n incremental replies.
    for (let reads = 0; reads <= n + 1; reads++) {
      final = await c.wait(parent, v.runId);
      if (final.status !== 'running') break;
    }
    assert.equal(final.status, 'completed'); assert.equal(calls, n);
    const run = c.require(parent, v.runId); assert.equal(run.idleTimer, null); assert.equal(run.hardTimer, null);
    assert.equal(JSON.parse(final.summary).results.length, n); assert.equal(final.phases.assemblyMs >= 0, true);
  } finally { leaf.resolve(); await c.close(); }
});

test('artifact wakes promptly; ahead cursor cannot skip; duplicate waits timeout instead of spinning', async () => {
  const leaf = gate(), parent = p(); let a;
  const c = new SuperfastSpeedCoordinator({ execute: async job => { if (job.role === 'A') a = job; await leaf.promise; return job.role; } });
  try {
    const v = c.start(parent, task()); await until(() => a);
    const waiting = c.wait(parent, v.runId, { after_revision: 999999, timeoutMs: 1000 });
    await a.report('artifact', 'new fact');
    const update = await waiting; assert.equal(update.waitReason, 'update'); assert.equal(update.status, 'running');
    assert.equal(update.consumedRevision, update.eventRevision); assert.equal(update.deliveredFacts[0].message, 'new fact');
    const started = performance.now(); const duplicate = await c.wait(parent, v.runId, { after_revision: 0, timeoutMs: 35, pollMs: 5 });
    assert.equal(duplicate.waitReason, 'timeout'); assert.ok(performance.now() - started >= 25);
    assert.ok(duplicate.waitStats.checks < 30);
    const controller = new AbortController(); const aborted = c.wait(parent, v.runId, { signal: controller.signal, timeoutMs: 1000 });
    controller.abort(Error('stop wait')); await assert.rejects(aborted, /stop wait/);
  } finally { leaf.resolve(); await c.close(); }
});

test('branch completion frees capacity and wakes wait while sibling runs; add and ownership work', async () => {
  const parent = p(), leaves = new Map();
  const c = new SuperfastSpeedCoordinator({ max: 2, execute: async job => { const g = gate(); leaves.set(job.role, g); await g.promise; return job.role; } });
  try {
    const v = c.start(parent, task()); await until(() => leaves.size === 2);
    const waiting = c.wait(parent, v.runId); leaves.get('A').resolve(); const update = await waiting;
    assert.equal(update.waitReason, 'update'); assert.equal(update.active, 1); assert.equal(update.capacity, 1);
    const next = c.add(parent, v.runId, [{ task: 'continuation', write_paths: [] }]); assert.equal(next.active, 2);
    assert.throws(() => c.add(parent, v.runId, [{ task: 'overflow', write_paths: [] }]), /at most 2/);
    assert.throws(() => c.require(p(), v.runId), /owned/);
  } finally { for (const g of leaves.values()) g.resolve(); await c.cancel(parent, [...c.runs.keys()][0]); await c.close(); }
});

test('help has priority over incremental artifact; reply resumes; cancel drains waiting workers', async () => {
  const parent = p(), leaf = gate(); let a;
  const c = new SuperfastSpeedCoordinator({ execute: async job => {
    if (job.role === 'A') { a = job; await job.report('artifact', 'checkpoint'); const answer = await job.report('help', 'choose', true); assert.equal(answer.reply, 'yes'); }
    await leaf.promise; return job.role;
  } });
  try {
    const v = c.start(parent, task()); await until(() => a?.waiter);
    assert.equal((await c.wait(parent, v.runId)).waitReason, 'help');
    assert.equal(c.reply(parent, v.runId, a.sessionId, 'yes').resumed, true);
    await until(() => a.state === 'running'); leaf.resolve(); await until(() => !c.parents.has(parent));
    assert.equal(c.require(parent, v.runId).status, 'completed');
  } finally { leaf.resolve(); await c.close(); }
  const b = new SuperfastSpeedCoordinator({ execute: job => job.report('help', 'blocked', true) });
  const parent2 = p(), v2 = b.start(parent2, task()); await until(() => [...b.require(parent2, v2.runId).jobs.values()].every(j => j.waiter));
  assert.equal((await b.cancel(parent2, v2.runId)).status, 'cancelled'); assert.equal(b.parents.size, 0); await b.close();
});

test('blocked record and notify never gate startup or ready; close drains after release', async () => {
  const effects = gate(), parent = p(); let calls = 0, records = 0, notes = 0;
  const c = new SuperfastSpeedCoordinator({ execute: async job => { calls++; await job.report('artifact', 'fact'); return job.role; },
    record: async () => { records++; await effects.promise; }, notify: async () => { notes++; await effects.promise; } });
  const v = c.start(parent, task(8)); await until(() => !c.parents.has(parent));
  const run = c.require(parent, v.runId); assert.equal(calls, 8); assert.equal(run.status, 'completed');
  assert.ok(run.sideEffects.size > 0); assert.ok(records > 0 && notes > 0);
  const body = JSON.parse(run.summary); assert.equal(body.results.length, 8); assert.equal(body.artifacts.length, 8);
  let closed = false; const closing = c.close().then(() => closed = true); await tick(); assert.equal(closed, false);
  effects.resolve(); await closing; assert.equal(run.sideEffects.size, 0); assert.equal(c.sideEffects.size, 0);
});

test('record/notify errors remain observable without erasing successful results', async () => {
  const parent = p(); const c = new SuperfastSpeedCoordinator({ execute: async job => { await job.report('artifact', 'retained'); return 'final'; },
    record: async () => { throw Error('disk'); }, notify: async () => { throw Error('offline'); } });
  const v = c.start(parent, task()); await until(() => !c.parents.has(parent)); await c.close();
  const view = c.view(c.require(parent, v.runId)); assert.equal(view.status, 'completed'); assert.equal(view.results.length, 2);
  assert.ok(view.sideEffects.errors.some(e => e.error === 'disk')); assert.ok(view.sideEffects.errors.some(e => e.error === 'offline'));
  const body = JSON.parse(view.summary); assert.equal(body.artifacts.length, 2); assert.equal(body.facts.filter(f => f.kind === 'artifact').length, 2);
});

test('partial summary retains failure, every artifact, checkpoint and full successful output', async () => {
  const parent = p(); const c = new SuperfastSpeedCoordinator({ execute: async job => {
    await job.report('artifact', job.role + ' old'); await job.report('artifact', job.role + ' newest');
    if (job.role === 'A') throw Error('max-tokens'); return 'B final';
  } });
  const v = c.start(parent, task()); await until(() => !c.parents.has(parent)); const run = c.require(parent, v.runId);
  assert.equal(run.status, 'partial'); const body = JSON.parse(run.summary);
  assert.equal(body.artifacts.length, 4); assert.equal(body.checkpoints.length, 2);
  assert.equal(body.results.find(r => r.role === 'B').output, 'B final');
  assert.match(body.results.find(r => r.role === 'A').error, /max-tokens/); assert.equal(body.results.find(r => r.role === 'A').checkpoint.message, 'A newest'); await c.close();
});

for (const kind of ['idle', 'hard']) test(`${kind} timeout is explicit and cleans timer handles`, async () => {
  const parent = p(); const c = new SuperfastSpeedCoordinator({ idleTimeoutMs: kind === 'idle' ? 30 : 0, hardTimeoutMs: kind === 'hard' ? 30 : 0,
    execute: job => new Promise((_, reject) => { if (job.signal.aborted) reject(job.signal.reason); else job.signal.addEventListener('abort', () => reject(job.signal.reason), { once: true }); }) });
  const start = performance.now(), v = c.start(parent, task());
  // Keep the foreground alive: coordinator timers are intentionally unref'ed.
  await new Promise(resolve => setTimeout(resolve, 55));
  const run = c.require(parent, v.runId); assert.equal(run.status, 'cancelled'); assert.equal(run.timeoutReason, kind + '-timeout');
  assert.ok(performance.now() - start >= 25); assert.ok(run.events.some(e => e.event === 'timeout'));
  assert.equal(run.idleTimer, null); assert.equal(run.hardTimer, null); assert.equal(run.pending.size, 0); await c.close();
});

test('progress resets idle watchdog; hard deadline remains independent', async () => {
  const parent = p(), leaf = gate(); let a;
  const c = new SuperfastSpeedCoordinator({ idleTimeoutMs: 100, hardTimeoutMs: 0,
    execute: async job => { if (job.role === 'A') a = job; await leaf.promise; return job.role; } });
  const v = c.start(parent, task()); await until(() => a);
  const run = c.require(parent, v.runId), oldTimer = run.idleTimer;
  await a.report('progress', 'real progress');
  assert.notEqual(run.idleTimer, oldTimer); assert.equal(run.hardTimer, undefined);
  leaf.resolve(); await until(() => !c.parents.has(parent)); assert.equal(run.status, 'completed'); await c.close();
});

test('sync executor exception is retained; closeParent cleans help; closed coordinator rejects starts', async () => {
  const parent = p(); const c = new SuperfastSpeedCoordinator({ execute: job => {
    if (job.role === 'A') throw Error('sync execution failure');
    return job.report('help', 'blocked', true);
  } });
  const v = c.start(parent, task()); await until(() => c.require(parent, v.runId).results.length === 1);
  const run = c.require(parent, v.runId); await c.closeParent(parent);
  assert.equal(run.status, 'cancelled'); assert.match(run.results.find(r => r.role === 'A').error, /sync execution failure/);
  assert.equal(run.pending.size, 0); assert.equal(run.inflight.size, 0); assert.equal(run.listeners.size, 0);
  await c.close(); assert.throws(() => c.start(parent, task()), /closing/);
});

test('bridge cleanup hook is tracked but never delays result readiness', async () => {
  const parent = p(), cleanup = gate();
  const c = new SuperfastSpeedCoordinator({ execute: async job => {
    job.trackSideEffect('dispose', () => cleanup.promise); return 'ready before disposal';
  } });
  const v = c.start(parent, task()); await until(() => !c.parents.has(parent));
  const run = c.require(parent, v.runId); assert.equal(run.status, 'completed'); assert.equal(run.sideEffects.size, 2);
  let drained = false; const closing = c.close().then(() => drained = true); await tick(); assert.equal(drained, false);
  cleanup.resolve(); await closing; assert.equal(run.sideEffects.size, 0);
});

test('nonwaiting help is consumed once; unresolved waiting help remains reply-required', async () => {
  const parent = p(), leaf = gate(); let a;
  const c = new SuperfastSpeedCoordinator({ execute: async job => { if (job.role === 'A') a = job; await leaf.promise; return 'ok'; } });
  try {
    const v = c.start(parent, task()); await until(() => a);
    await a.report('help', 'FYI no blocking', false);
    const first = await c.wait(parent, v.runId); assert.equal(first.waitReason, 'help'); assert.equal(first.pendingHelp[0].waiting, false);
    assert.equal((await c.wait(parent, v.runId, { timeoutMs: 25, pollMs: 5 })).waitReason, 'timeout');
    const answer = a.report('help', 'must choose', true); await until(() => a.waiter);
    const blocked = await c.wait(parent, v.runId); assert.equal(blocked.nextAction, 'reply-required');
    assert.equal(blocked.pendingHelp[0].replyRequired, true);
    const repeated = await c.wait(parent, v.runId); assert.equal(repeated.waitReason, 'help'); assert.equal(repeated.nextAction, 'reply-required');
    c.reply(parent, v.runId, a.sessionId, 'go'); await answer;
    assert.equal(c.view(c.require(parent, v.runId)).pendingHelp.length, 0);
  } finally { leaf.resolve(); await c.close(); }
});

test('all log events have monotonic eventSequence even when async record finishes out of order', async () => {
  const parent = p(), slow = gate(), logged = []; let first;
  const c = new SuperfastSpeedCoordinator({ execute: async job => { await job.report('progress', 'fact'); return job.role; }, record: async event => {
    if (!first) { first = event; await slow.promise; } logged.push(event);
  } });
  const v = c.start(parent, task()); await until(() => !c.parents.has(parent)); assert.ok(logged.length > 0);
  slow.resolve(); await c.close(); const ordered = logged.toSorted((a, b) => a.eventSequence - b.eventSequence);
  assert.equal(ordered[0], first); assert.deepEqual(ordered.map(e => e.eventSequence), Array.from({ length: ordered.length }, (_, i) => i + 1));
  assert.ok(ordered.some(e => e.event === 'branch-start' && Number.isSafeInteger(e.eventSequence)));
});

test('session readiness and launch microtask queue are distinct; model readiness stays explicit', async () => {
  let now = 100; const parent = p(), leaf = gate(); let a;
  const c = new SuperfastSpeedCoordinator({ now: () => now, execute: async job => {
    if (job.role === 'A') { a = job; now = 160; job.onReady({ steer() {} }); now = 190; job.onModelReady(); }
    await leaf.promise; return job.role;
  } });
  const v = c.start(parent, task()); await until(() => a);
  let view = c.view(c.require(parent, v.runId)), timing = view.branches.find(b => b.role === 'A').timing;
  assert.equal(timing.launchQueueMs, 0); assert.equal(timing.sessionReadyMs, 60); assert.equal(timing.readyAt, 160);
  assert.equal(timing.modelReadyAt, 190); assert.equal(timing.modelReadyMs, 90);
  assert.match(view.readiness.launchQueueMeaning, /microtask/); assert.equal(Object.hasOwn(view.readiness, 'queueMs'), false);
  assert.equal(view.branches.find(b => b.role === 'B').timing.modelReadyAt, null);
  leaf.resolve(); await c.close();
});

test('all workers failed remains partial with all artifact history including duplicate reports', async () => {
  const parent = p(); const c = new SuperfastSpeedCoordinator({ execute: async job => {
    await job.report('artifact', 'same'); await job.report('artifact', 'same'); await job.report('artifact', 'latest'); throw Error('failure ' + job.role);
  } });
  const v = c.start(parent, task()); await until(() => !c.parents.has(parent)); const run = c.require(parent, v.runId);
  assert.equal(run.status, 'partial'); const body = JSON.parse(run.summary); assert.equal(body.results.every(r => !r.ok), true);
  assert.equal(body.artifactHistory.length, 2); assert.equal(body.artifactHistory.every(h => h.reports.length === 3), true);
  assert.equal(body.artifacts.length, 4); assert.equal(body.checkpoints.every(x => x.checkpoint.message === 'latest'), true); await c.close();
});

test('bounded close reports stalled side effects without unhandled rejection', async () => {
  const parent = p(), effects = gate(); const c = new SuperfastSpeedCoordinator({ sideEffectDrainMs: 20, record: () => effects.promise, execute: async () => 'done' });
  const v = c.start(parent, task()); await until(() => !c.parents.has(parent));
  await c.close(); assert.equal(c.require(parent, v.runId).drainTimedOut, true); effects.resolve(); await until(() => !c.sideEffects.size);
});