import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { SuperfastSpeedCoordinator } from '../src/superfast-speed-coordinator.js';

// Execute the real register function; replace only the disk identity writer.
const sourceUrl = new URL('../src/superfast-channel.js', import.meta.url);
const identityKey = Symbol.for('superfast-speed-channel-test-identity');
globalThis[identityKey] = [];
let source = await readFile(sourceUrl, 'utf8');
source = source.replace("import { writeIdentityStatus } from './identity-status.js';", "const writeIdentityStatus = value => globalThis[Symbol.for('superfast-speed-channel-test-identity')].push(value);");
source = source.replace(/from '(\.\/[^']+)'/g, (_all, relative) => `from '${new URL(relative, sourceUrl).href}'`);
const channel = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const gate = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const until = async fn => { for (let i = 0; i < 200; i++) { if (fn()) return; await new Promise(r => setImmediate(r)); } throw Error('condition not reached'); };
const branch = (task, write_paths = []) => ({ task, write_paths });
const target = name => path.resolve('tests', 'speed-channel-' + name);
function harness({ fast = { runs: new Map() }, active = new Map(), executor } = {}) {
  const registered = new Map(), guards = [], effects = [], events = new Map(), jobs = [], parents = new Map();
  const parent = { id: 'parent', status: 'running' }; parents.set(parent.id, parent);
  const blocker = gate();
  const ctx = { agents: { get: id => parents.get(id) }, tools: { register: tool => registered.set(tool.name, tool), guard: fn => guards.push(fn) },
    effect: fn => { const stop = fn(); if (typeof stop === 'function') effects.push(stop); },
    on: (name, fn) => { events.set(name, fn); return () => {}; } };
  const coordinator = channel.registerSuperfastChannel(ctx, { fast, active, record: async () => {}, flashContext: { notify: async () => {} },
    makeMessage: (_id, text) => ({ text }), executor: async (job, p) => {
      jobs.push(job); job.onReady?.({ id: job.sessionId, steer() {} });
      if (executor) return executor(job, p);
      await Promise.race([blocker.promise, new Promise(resolve => job.signal.addEventListener('abort', resolve, { once: true }))]);
      return 'verified output ' + job.role;
    } });
  const signal = new AbortController().signal;
  const call = async (name, args, who = parent) => JSON.parse(await registered.get(name).execute(args, { agent: who, signal }));
  const start = branches => call('superfast_start', { objective: 'channel verification', branches });
  const close = async () => { blocker.resolve(); await coordinator.close(); for (const stop of effects.reverse()) await stop(); };
  return { coordinator, registered, guards, events, jobs, parent, parents, blocker, call, start, close };
}

test('real registration uses speed coordinator max32 schemas and speed-pipeline identity without S', async () => {
  const h = harness();
  try {
    assert.ok(h.coordinator instanceof SuperfastSpeedCoordinator);
    assert.equal(h.coordinator.max, 32);
    assert.equal(h.registered.get('superfast_start').parameters.properties.branches.maxItems, 32);
    assert.equal(h.registered.get('superfast_control').parameters.properties.branches.maxItems, 32);
    assert.ok(h.registered.get('superfast_control').parameters.properties.after_revision);
    assert.equal(globalThis[identityKey].at(-1).superfast.implementation, 'speed-pipeline-v1');
    const view = await h.start(Array.from({ length: 32 }, (_, i) => branch('w' + i)));
    await until(() => h.jobs.length === 32);
    assert.equal(view.active, 32);
    h.blocker.resolve();
    await until(() => !h.coordinator.parents.has(h.parent));
    const end = await h.call('superfast_control', { action: 'wait', run_id: view.runId });
    assert.equal(end.results.length, 32);
    assert.equal(end.status, 'completed');
    assert.equal(h.jobs.filter(j => j.kind === 'summary').length, 0);
    assert.equal(JSON.parse(end.summary).results.length, 32);
  } finally { await h.close(); }
});

test('actual executor bridge opens native commands only for writable branches and tracks deferred cleanup', async () => {
  const h = harness();
  try {
    const v = await h.start([branch('writable', [target('owned')]), branch('read-only')]);
    await until(() => h.jobs.length === 2);
    const [writable, readonly] = h.jobs;
    for (const name of ['ops_bash', 'pwsh', 'job_output', 'job_kill']) {
      assert.equal(writable.toolDenial(writable, { name, arguments: {} }), undefined);
      assert.ok(readonly.toolDenial(readonly, { name, arguments: {} }));
    }
    assert.ok(writable.toolDenial(writable, { name: 'computer', arguments: {} }));
    assert.match(writable.prompt, /shell不是额外的路径沙箱/);
    assert.equal(writable.deferCleanup, true);
    const cleanup = gate(); writable.onCleanup(cleanup.promise);
    const run = h.coordinator.require(h.parent, v.runId);
    assert.ok(run.sideEffects.size > 0);
    cleanup.resolve();
    await until(() => ![...run.sideEffects].length);
  } finally { await h.close(); }
});

test('registered report only waits when explicitly true and validates real sender', async () => {
  const h = harness();
  try {
    const v = await h.start([branch('a'), branch('b')]);
    await until(() => h.jobs.length === 2);
    const job = h.jobs[0], child = { id: job.sessionId }; let report;
    job.registerTools({ register: tool => { report = tool; } }, child);
    const invoke = args => report.execute(args, { agent: child, signal: job.signal });
    assert.deepEqual(JSON.parse(await invoke({ kind: 'help', message: 'nonblocking help' })), { accepted: true });
    assert.equal(job.waiter, null);
    assert.equal(job.help.waiting, false);
    h.coordinator.reply(h.parent, v.runId, job.sessionId, 'continue');
    const waiting = invoke({ kind: 'help', message: 'need decision', wait_for_reply: true });
    await until(() => !!job.waiter);
    assert.equal(job.state, 'waiting-help');
    h.coordinator.reply(h.parent, v.runId, job.sessionId, 'approved direction');
    assert.deepEqual(JSON.parse(await waiting), { reply: 'approved direction' });
    await assert.rejects(() => report.execute({ kind: 'progress', message: 'spoof' }, { agent: {}, signal: job.signal }), /sender mismatch/);
  } finally { await h.close(); }
});

test('cross fast legacy and superfast path conflicts are rejected in both entry directions', async () => {
  const fastPath = target('fast'), legacyPath = target('legacy'), speedPath = target('speed');
  const fast = { runs: new Map([['fast', { status: 'running', jobs: new Map([['worker', { state: 'running', branch: branch('fast', [fastPath]) }]]) }]]) };
  const h = harness({ fast, active: new Map([['legacy', { writePaths: [legacyPath] }]]) });
  try {
    await assert.rejects(() => h.start([branch('conflict', [fastPath]), branch('free')]), /overlapping/);
    await assert.rejects(() => h.start([branch('conflict', [legacyPath]), branch('free')]), /overlapping/);
    const v = await h.start([branch('speed', [speedPath]), branch('free')]);
    assert.throws(() => h.coordinator.assertAvailable([branch('fast caller', [path.join(speedPath, 'child')])]), /overlapping/);
    await assert.rejects(() => h.call('superfast_control', { action: 'add', run_id: v.runId, branches: [branch('fast conflict', [fastPath])] }), /overlapping/);
    const other = { id: 'other-parent' }; h.parents.set(other.id, other);
    await assert.rejects(() => h.call('superfast_start', { objective: 'other', branches: [branch('conflict', [speedPath]), branch('free')] }, other), /overlapping/);
  } finally { await h.close(); }
});

test('registered parent guard blocks explicit edits of active owned paths but does not pretend to sandbox shell', async () => {
  const root = target('guard'), h = harness();
  try {
    await h.start([branch('owner', [root]), branch('free')]);
    assert.equal(h.guards.length, 1);
    for (const name of ['write', 'edit', 'ops_replace']) {
      const key = name === 'ops_replace' ? 'path' : 'file_path';
      assert.ok(h.guards[0]({ agent: h.parent, name, arguments: { [key]: path.join(root, 'file') } }));
      assert.equal(h.guards[0]({ agent: h.parent, name, arguments: { [key]: target('unowned') } }), undefined);
    }
    assert.equal(h.guards[0]({ agent: h.parent, name: 'ops_bash', arguments: { command: 'opaque command' } }), undefined);
    h.blocker.resolve(); await until(() => !h.coordinator.parents.has(h.parent));
    assert.equal(h.guards[0]({ agent: h.parent, name: 'write', arguments: { file_path: root } }), undefined);
  } finally { await h.close(); }
});

test('registered diagnose exercises active speed class with eight synthetic workers and zero model or S calls', async () => {
  const h = harness();
  try {
    const result = await h.call('superfast_control', { action: 'diagnose' });
    assert.equal(result.ok, true);
    assert.equal(result.implementation, 'speed-pipeline-v1');
    assert.equal(result.synthetic, true);
    assert.equal(result.modelCalls, 0);
    assert.equal(result.summaryCalls, 0);
    assert.equal(result.branches.length, 8);
    assert.ok(result.branches.every(b => b.state === 'completed'));
    assert.equal(h.jobs.length, 0);
  } finally { await h.close(); }
});

test('registered schema accepts explicit dependencies and protects queued ownership', async () => {
  const upstreamGate = gate(), downstreamGate = gate();
  const queuedRoot = target('dag-queued');
  const h = harness({ executor: async job => {
    if (job.branch.id === 'producer') { await upstreamGate.promise; await job.report('artifact', 'verified producer path and interface'); await downstreamGate.promise; return 'producer done'; }
    assert.match(job.materials, /verified producer path and interface/);
    downstreamGate.resolve(); return 'consumer verified';
  } });
  try {
    const schema = h.registered.get('superfast_start').parameters.properties.branches.items;
    assert.ok(schema.properties.id);
    assert.deepEqual(schema.properties.depends_on.items.properties.event.enum, ['artifact', 'completed']);
    const v = await h.start([
      { ...branch('produce'), id: 'producer' },
      { ...branch('consume', [queuedRoot]), id: 'consumer', depends_on: [{ id: 'producer', event: 'artifact' }] }
    ]);
    await until(() => h.jobs.length === 1);
    assert.equal(v.branches.find(b => b.branch.id === 'consumer').state, 'queued');
    assert.ok(h.guards[0]({ agent: h.parent, name: 'write', arguments: { file_path: path.join(queuedRoot, 'result') } }));
    assert.throws(() => h.coordinator.assertAvailable([branch('other owner', [queuedRoot])]), /overlapping/);
    upstreamGate.resolve();
    await until(() => h.jobs.length === 2 && !h.coordinator.parents.has(h.parent));
    const end = await h.call('superfast_control', { action: 'status', run_id: v.runId });
    assert.equal(end.status, 'completed');
    assert.equal(end.results.length, 2);
    assert.equal(h.jobs.filter(j => j.kind === 'summary').length, 0);
  } finally { upstreamGate.resolve(); downstreamGate.resolve(); await h.close(); }
});

test('one legacy owner may declare nested paths without rejecting unrelated speed work', async () => {
  const root = target('nested');
  const h = harness({ active: new Map([['legacy', { writePaths: [root, path.join(root, 'child')] }]]) });
  try {
    await assert.rejects(() => h.start([branch('actual conflict', [path.join(root, 'child', 'file')]), branch('read')]), /overlapping/);
    const view = await h.start([branch('unrelated', [target('elsewhere')]), branch('read')]);
    assert.equal(view.active, 2);
  } finally { await h.close(); }
});