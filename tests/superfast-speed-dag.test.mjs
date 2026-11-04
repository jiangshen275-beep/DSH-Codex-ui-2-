import test from 'node:test';
import assert from 'node:assert/strict';
import { SuperfastSpeedCoordinator } from '../src/superfast-speed-coordinator.js';

const gate = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const until = async fn => { for (let i = 0; i < 1000; i++) { if (fn()) return; await tick(); } throw Error('condition did not settle'); };
const branch = (id, depends_on = [], write_paths = []) => ({ id, task: 'task ' + id, depends_on, write_paths });
const dep = (id, event = 'artifact') => ({ id, event });
const task = branches => ({ objective: 'predeclared DAG', materials: 'original context', branches });
const parent = () => ({ id: Math.random().toString() });
const finished = async (c, p, id) => { await until(() => c.require(p, id).status !== 'running'); return c.view(c.require(p, id)); };

test('artifact starts consumer before producer completion, without parent add or notify/record completion', async () => {
  const p = parent(), producer = gate(), effects = gate(), jobs = new Map(); let now = 100;
  const c = new SuperfastSpeedCoordinator({ now: () => now, sideEffectDrainMs: 5,
    record: () => effects.promise, notify: () => effects.promise,
    execute: async job => { jobs.set(job.taskId, job); if (job.taskId === 'producer') await producer.promise; return job.taskId + ' result'; } });
  c.add = () => { throw Error('parent add must never be involved'); };
  try {
    const initial = c.start(p, task([branch('producer'), branch('consumer', [dep('producer')])]));
    assert.deepEqual(initial.branches.map(b => [b.taskId, b.state]), [['producer', 'starting'], ['consumer', 'queued']]);
    assert.equal(initial.active, 1); assert.equal(initial.queued, 1); assert.equal(initial.capacity, 30); assert.equal(initial.executionCapacity, 31);
    await until(() => jobs.has('producer'));
    now = 250; const reported = jobs.get('producer').report('artifact', '{"actual":"evidence","path":"/literal.txt"}');
    now = 257; await reported; await until(() => jobs.has('consumer'));
    const consumer = jobs.get('consumer'), run = c.require(p, initial.runId);
    assert.equal(run.jobs.get(jobs.get('producer').sessionId).state, 'starting');
    assert.equal(run.status, 'running'); assert.ok(run.sideEffects.size > 0);
    assert.equal(consumer.dependencyMaterials.length, 1);
    assert.deepEqual(consumer.dependencyMaterials[0], { id: 'producer', event: 'artifact', taskId: 'producer',
      agentId: jobs.get('producer').sessionId, artifactId: jobs.get('producer').sessionId + ':artifact:1',
      message: '{"actual":"evidence","path":"/literal.txt"}', at: new Date(250).toISOString() });
    assert.equal(consumer.materials.split('UPSTREAM_DEPENDENCY_EVIDENCE_JSON\n')[1], JSON.stringify(consumer.dependencyMaterials));
    assert.ok(consumer.materials.startsWith('original context'));
    assert.equal(consumer.timing.dependencySatisfiedAt, 250); assert.equal(consumer.timing.dependencyWaitMs, 150);
    assert.equal(consumer.timing.schedulingMs, 7); assert.equal(consumer.timing.launchQueueMs, 7);
    assert.equal(consumer.timing.modelReadyAt, null);
    const event = run.events.find(e => e.event === 'branch-start' && e.taskId === 'consumer');
    assert.equal(event.schedulingMs, 7); assert.equal(event.dependencySatisfiedAt, 250);
    producer.resolve(); assert.equal((await finished(c, p, initial.runId)).status, 'completed');
  } finally { producer.resolve(); effects.resolve(); await c.close(); }
});

test('completed dependency waits for successful terminal output and receives that actual result', async () => {
  const p = parent(), producer = gate(), jobs = new Map();
  const c = new SuperfastSpeedCoordinator({ execute: async job => {
    jobs.set(job.taskId, job);
    if (job.taskId === 'producer') { await job.report('artifact', 'not completion'); await producer.promise; return { verified: 42 }; }
    return 'consumer done';
  } });
  try {
    const v = c.start(p, task([branch('producer'), branch('consumer', [dep('producer', 'completed')])]));
    await until(() => jobs.get('producer')?.firstArtifact); await tick(); assert.equal(jobs.has('consumer'), false);
    producer.resolve(); const final = await finished(c, p, v.runId);
    assert.equal(final.status, 'completed'); assert.deepEqual(jobs.get('consumer').dependencyMaterials[0].result.output, { verified: 42 });
    assert.equal(jobs.get('consumer').dependencyMaterials[0].result.ok, true);
  } finally { producer.resolve(); await c.close(); }
});

test('failure blocks unstarted dependency chain and retains failure partial', async () => {
  const p = parent(), calls = [];
  const c = new SuperfastSpeedCoordinator({ execute: async job => { calls.push(job.taskId); throw Error('producer failed'); } });
  try {
    const v = c.start(p, task([branch('producer'), branch('artifact-child', [dep('producer')]),
      branch('completed-child', [dep('producer', 'completed')]), branch('grandchild', [dep('artifact-child')])]));
    const final = await finished(c, p, v.runId);
    assert.deepEqual(calls, ['producer']); assert.equal(final.status, 'partial'); assert.equal(final.results.length, 4);
    assert.equal(final.branches.filter(b => b.state === 'blocked').length, 3);
    assert.match(final.results.find(r => r.taskId === 'producer').error, /producer failed/);
    assert.equal(final.active, 0); assert.equal(final.queued, 0);
    assert.equal(JSON.parse(final.summary).results.length, 4);
  } finally { await c.close(); }
});

test('successful completion without artifact blocks artifact dependents instead of hanging', async () => {
  const p = parent(), calls = [];
  const c = new SuperfastSpeedCoordinator({ execute: async job => { calls.push(job.taskId); return 'result only'; } });
  try {
    const v = c.start(p, task([branch('producer'), branch('consumer', [dep('producer')])]));
    const final = await finished(c, p, v.runId);
    assert.equal(final.status, 'partial'); assert.deepEqual(calls, ['producer']); assert.equal(final.branches[1].state, 'blocked');
  } finally { await c.close(); }
});

test('producer failure never cancels an artifact-unlocked running consumer', async () => {
  const p = parent(), fail = gate(), consumer = gate(), jobs = new Map();
  const c = new SuperfastSpeedCoordinator({ execute: async job => {
    jobs.set(job.taskId, job);
    if (job.taskId === 'producer') { await job.report('artifact', 'usable partial'); await fail.promise; throw Error('later failure'); }
    await consumer.promise; assert.equal(job.signal.aborted, false); return 'validated partial';
  } });
  try {
    const v = c.start(p, task([branch('producer'), branch('consumer', [dep('producer')])]));
    await until(() => jobs.has('consumer')); fail.resolve(); await until(() => c.require(p, v.runId).results.some(r => !r.ok));
    assert.equal(jobs.get('consumer').signal.aborted, false); assert.equal(c.require(p, v.runId).status, 'running');
    consumer.resolve(); const final = await finished(c, p, v.runId);
    assert.equal(final.status, 'partial'); assert.equal(final.results.find(r => r.taskId === 'consumer').ok, true);
    assert.equal(JSON.parse(final.summary).artifacts[0].message, 'usable partial');
  } finally { fail.resolve(); consumer.resolve(); await c.close(); }
});

test('failed artifact source blocks consumers still waiting on another dependency', async () => {
  const p = parent(), failure = gate(), other = gate(), jobs = new Map();
  const c = new SuperfastSpeedCoordinator({ execute: async job => {
    jobs.set(job.taskId, job);
    if (job.taskId === 'a') { await job.report('artifact', 'partial a'); await failure.promise; throw Error('a failed'); }
    if (job.taskId === 'b') await other.promise;
    return job.taskId;
  } });
  try {
    const v = c.start(p, task([branch('a'), branch('b'), branch('consumer', [dep('a'), dep('b', 'completed')])]));
    await until(() => jobs.get('a')?.firstArtifact); failure.resolve();
    await until(() => c.view(c.require(p, v.runId)).branches.some(b => b.taskId === 'consumer' && b.state === 'blocked'));
    other.resolve(); const final = await finished(c, p, v.runId);
    assert.equal(jobs.has('consumer'), false); assert.equal(final.status, 'partial');
  } finally { failure.resolve(); other.resolve(); await c.close(); }
});

for (const [name, branches, pattern] of [
  ['duplicate ids', [branch('a'), branch('a')], /duplicate/],
  ['unknown dependency', [branch('a'), branch('b', [dep('missing')])], /unknown/],
  ['self dependency', [branch('a', [dep('a')]), branch('b')], /self/],
  ['cycle', [branch('a', [dep('b')]), branch('b', [dep('a', 'completed')])], /cycle/],
  ['invalid event', [branch('a'), branch('b', [dep('a', 'progress')])], /event/],
  ['invalid id', [branch('a'), branch('')], /id/],
  ['invalid dependency list', [branch('a'), { ...branch('b'), depends_on: {} }], /array/],
]) test('start atomically rejects ' + name, async () => {
  let calls = 0; const p = parent(), c = new SuperfastSpeedCoordinator({ execute: () => { calls++; } });
  assert.throws(() => c.start(p, task(branches)), pattern);
  assert.equal(c.runs.size, 0); assert.equal(c.parents.size, 0); assert.equal(c.sideEffects.size, 0);
  await tick(); assert.equal(calls, 0); await c.close();
});

test('cancel terminalizes queued branches without executing them', async () => {
  const p = parent(), calls = [];
  const c = new SuperfastSpeedCoordinator({ execute: job => {
    calls.push(job.taskId);
    return new Promise((_, reject) => job.signal.addEventListener('abort', () => reject(job.signal.reason), { once: true }));
  } });
  const v = c.start(p, task([branch('producer'), branch('consumer', [dep('producer')]), branch('tail', [dep('consumer')])]));
  await until(() => calls.length === 1); const final = await c.cancel(p, v.runId);
  assert.equal(final.status, 'cancelled'); assert.equal(final.results.length, 3); assert.deepEqual(calls, ['producer']);
  assert.equal(final.branches.every(b => b.state === 'cancelled'), true); assert.equal(final.queued, 0);
  assert.equal(c.require(p, v.runId).pending.size, 0); assert.equal(c.require(p, v.runId).inflight.size, 0); await c.close();
});

for (const reason of ['idle', 'hard']) test(reason + ' timeout terminalizes queued dependencies', async () => {
  const p = parent();
  const c = new SuperfastSpeedCoordinator({ idleTimeoutMs: reason === 'idle' ? 20 : 0, hardTimeoutMs: reason === 'hard' ? 20 : 0,
    execute: job => new Promise((_, reject) => job.signal.addEventListener('abort', () => reject(job.signal.reason), { once: true })) });
  const v = c.start(p, task([branch('producer'), branch('consumer', [dep('producer')])]));
  await new Promise(resolve => setTimeout(resolve, 45)); const final = c.view(c.require(p, v.runId));
  assert.equal(final.status, 'cancelled'); assert.equal(final.timeoutReason, reason + '-timeout');
  assert.equal(final.queued, 0); assert.equal(final.results.length, 2); await c.close();
});

test('duplicate artifact reports launch a consumer once and preserve complete report history', async () => {
  const p = parent(), stop = gate(), calls = [];
  const c = new SuperfastSpeedCoordinator({ execute: async job => {
    calls.push(job.taskId);
    if (job.taskId === 'a') { await Promise.all([job.report('artifact', 'same'), job.report('artifact', 'same'), job.report('artifact', 'new')]); await stop.promise; }
    return 'ok';
  } });
  try {
    const v = c.start(p, task([branch('a'), branch('b', [dep('a')])]));
    await until(() => calls.includes('b')); await tick(); assert.equal(calls.filter(id => id === 'b').length, 1);
    stop.resolve(); const final = await finished(c, p, v.runId), summary = JSON.parse(final.summary);
    assert.equal(summary.artifactHistory.find(h => h.role === 'A').reports.length, 3);
    assert.equal(summary.artifacts.length, 2);
  } finally { stop.resolve(); await c.close(); }
});

test('multiple roots and all-of mixed dependencies reserve capacity and never exceed 32 active', async () => {
  const p = parent(), stop = gate(), calls = new Map(); let active = 0, peak = 0;
  const c = new SuperfastSpeedCoordinator({ execute: async job => {
    calls.set(job.taskId, job); active++; peak = Math.max(peak, active);
    try { if (job.taskId === 'a') { await job.report('artifact', 'a artifact'); await stop.promise; }
      else if (job.taskId === 'b') { await stop.promise; return 'b complete'; }
      else if (job.taskId.startsWith('root')) await stop.promise;
      return job.taskId;
    } finally { active--; }
  } });
  try {
    const branches = [branch('a'), branch('b'), branch('consumer', [dep('a'), dep('b', 'completed')]),
      ...Array.from({ length: 29 }, (_, i) => branch('root' + i))];
    const v = c.start(p, task(branches)); assert.equal(v.active, 31); assert.equal(v.queued, 1); assert.equal(v.capacity, 0);
    assert.throws(() => c.add(p, v.runId, [branch('overflow')]), /at most 32/);
    await until(() => calls.size === 31); assert.equal(calls.has('consumer'), false);
    stop.resolve(); const final = await finished(c, p, v.runId);
    assert.equal(final.status, 'completed'); assert.equal(final.results.length, 32); assert.ok(peak <= 32);
    assert.deepEqual(calls.get('consumer').dependencyMaterials.map(e => e.id), ['a', 'b']);
    assert.equal(final.queued, 0);
  } finally { stop.resolve(); await c.close(); }
  assert.throws(() => new SuperfastSpeedCoordinator({ max: 33 }), /32/);
});

test('add depends on existing nodes; queued ownership and invalid graphs are atomically reserved', async () => {
  const p = parent(), stop = gate(), jobs = new Map();
  const c = new SuperfastSpeedCoordinator({ max: 5, execute: async job => { jobs.set(job.taskId, job); await stop.promise; return job.taskId; } });
  try {
    const v = c.start(p, task([branch('a'), branch('b', [dep('a')], ['/reserved/child.txt'])]));
    await until(() => jobs.has('a')); const run = c.require(p, v.runId), before = () => [run.next, run.jobs.size, run.results.length, run.events.length];
    const snapshot = before();
    for (const additions of [[branch('a')], [branch('c', [dep('missing')])], [branch('c', [dep('d')]), branch('d', [dep('c')])],
      [branch('c', [], ['/reserved'])]]) {
      assert.throws(() => c.add(p, v.runId, additions)); assert.deepEqual(before(), snapshot);
    }
    const added = c.add(p, v.runId, [branch('c', [dep('a')]), branch('d', [dep('c', 'completed')])]);
    assert.equal(added.queued, 3); assert.equal(added.capacity, 1);
    await jobs.get('a').report('artifact', 'actual a artifact'); await until(() => jobs.has('b') && jobs.has('c'));
    assert.equal(jobs.has('d'), false);
    stop.resolve(); const final = await finished(c, p, v.runId); assert.equal(final.status, 'completed');
    assert.equal(jobs.get('d').dependencyMaterials[0].result.output, 'c');
  } finally { stop.resolve(); await c.close(); }
});

test('legacy IDs are stable, explicit references to internal legacy IDs remain unknown, and cumulative add stays compatible', async () => {
  const p = parent(), stops = new Map();
  const c = new SuperfastSpeedCoordinator({ max: 2, execute: async job => { const stop = gate(); stops.set(job.taskId, stop); await stop.promise; return job.taskId; } });
  try {
    const v = c.start(p, task([{ task: 'legacy one', write_paths: [] }, { task: 'legacy two', write_paths: [] }]));
    const run = c.require(p, v.runId), ids = v.branches.map(b => b.taskId);
    assert.equal(new Set(ids).size, 2); assert.deepEqual(c.view(run).branches.map(b => b.taskId), ids);
    await until(() => stops.size === 2); stops.get(ids[0]).resolve(); await until(() => run.results.length === 1);
    assert.throws(() => c.add(p, v.runId, [branch('explicit', [dep(ids[1])])]), /unknown/);
    const added = c.add(p, v.runId, [{ task: 'legacy three', write_paths: [] }]);
    assert.equal(added.branches.length, 3); assert.equal(added.active, 2);
    await until(() => stops.size === 3); for (const stop of stops.values()) stop.resolve();
    assert.equal((await finished(c, p, v.runId)).status, 'completed');
  } finally { for (const stop of stops.values()) stop.resolve(); await c.close(); }
});

test('synchronous branch-end listener can add a dependent batch without losing queued work or finishing early', async () => {
  const p = parent(), stop = gate(), jobs = new Map();
  const c = new SuperfastSpeedCoordinator({ max: 6, execute: async job => { jobs.set(job.taskId, job); if (job.taskId === 'hold') await stop.promise; return job.taskId; } });
  try {
    const v = c.start(p, task([branch('root'), branch('hold')])), run = c.require(p, v.runId); let added = false;
    run.listeners.add(() => {
      if (!added && run.results.some(r => r.taskId === 'root')) {
        added = true;
        c.add(p, v.runId, [branch('middle', [dep('root', 'completed')]), branch('tail', [dep('middle', 'completed')])]);
      }
    });
    await until(() => jobs.has('tail')); assert.equal(run.status, 'running'); assert.equal(run.jobs.size, 4);
    stop.resolve(); const final = await finished(c, p, v.runId); assert.equal(final.results.length, 4); assert.equal(final.status, 'completed');
  } finally { stop.resolve(); await c.close(); }
});

test('reverse registration order supports forward references and propagates failure through every queued level', async () => {
  const p = parent(), calls = [];
  const c = new SuperfastSpeedCoordinator({ execute: async job => { calls.push(job.taskId); throw Error('root failed'); } });
  try {
    const v = c.start(p, task([branch('tail', [dep('middle')]), branch('middle', [dep('root', 'completed')]), branch('root')]));
    assert.deepEqual(v.branches.map(b => b.state), ['queued', 'queued', 'starting']);
    const final = await finished(c, p, v.runId);
    assert.deepEqual(calls, ['root']); assert.equal(final.results.length, 3); assert.equal(final.status, 'partial');
    assert.equal(final.branches.filter(b => b.state === 'blocked').length, 2);
  } finally { await c.close(); }
});

test('synchronous start listener cancellation includes every registered queued job without an executor leak', async () => {
  const p = parent(), calls = [];
  const c = new SuperfastSpeedCoordinator({ execute: async job => { calls.push(job.taskId); return 'unexpected'; } });
  try {
    const v = c.start(p, task([branch('root'), branch('middle', [dep('root')]), branch('tail', [dep('middle')])]));
    const run = c.require(p, v.runId); let cancelling;
    run.listeners.add(() => {
      if (!cancelling && run.events.some(e => e.event === 'branch-start')) cancelling = c.cancel(p, v.runId);
    });
    const final = await finished(c, p, v.runId); await cancelling;
    assert.equal(final.status, 'cancelled'); assert.equal(final.results.length, 3); assert.deepEqual(calls, []);
    assert.equal(final.queued, 0); assert.equal(run.pending.size, 0); assert.equal(run.inflight.size, 0);
  } finally { await c.close(); }
});

test('blocked-branch synchronous listener can append work safely during scheduling', async () => {
  const p = parent(), hold = gate(), calls = [];
  const c = new SuperfastSpeedCoordinator({ max: 6, execute: async job => {
    calls.push(job.taskId); if (job.taskId === 'root') throw Error('fail'); if (job.taskId === 'hold') await hold.promise; return job.taskId;
  } });
  try {
    const v = c.start(p, task([branch('root'), branch('blocked', [dep('root')]), branch('hold')])), run = c.require(p, v.runId); let added = false;
    run.listeners.add(() => {
      if (!added && [...run.jobs.values()].some(j => j.state === 'blocked')) {
        added = true; c.add(p, v.runId, [branch('new-root'), branch('new-tail', [dep('new-root', 'completed')])]);
      }
    });
    await until(() => calls.includes('new-tail')); hold.resolve();
    const final = await finished(c, p, v.runId); assert.equal(final.results.length, 5); assert.equal(final.status, 'partial');
  } finally { hold.resolve(); await c.close(); }
});