import test from 'node:test';
import assert from 'node:assert/strict';
import {SuperfastCoordinator} from '../src/superfast-coordinator.js';

// The r10b run exposed this: the parent waits immediately after start and passes the revision
// start returned as `after_revision`. Executors finishing did not move the cursor, so `ready`
// turned true while `revision > consumed` stayed false and the wait burned its whole timeout
// (15 minutes in the real run) instead of waking.
const parent = {id: 'root'};
const b = task => ({task, write_paths: []});
const gate = () => { let resolve; const promise = new Promise(r => resolve = r); return {promise, resolve}; };

function fixture() {
  const leaf = gate();
  const c = new SuperfastCoordinator({
    validationRequired: true, notify: async () => {}, record: async () => {}, timeoutMs: 600000,
    execute: async job => { job.onReady({id: job.sessionId, steer() {}}); await leaf.promise; return 'output ' + job.role; },
  });
  const view = c.start(parent, {objective: 'cursor', branches: [b('A'), b('B'), b('C')]});
  return {c, view, run: c.require(parent, view.runId), leaf};
}

test('a wait passing the revision start returned still wakes when the executors finish', async () => {
  const f = fixture();
  try {
    assert.equal(f.view.validation.ready, false);
    const consumed = f.view.validation.revision;
    const pending = f.c.waitRoot(parent, f.view.runId, {timeoutMs: 8000, after_revision: consumed});
    f.leaf.resolve();
    const w = await pending;
    assert.equal(w.waitReason, 'validation-required', 'the wait timed out instead of waking on completion');
    assert.equal(w.validation.ready, true);
    assert.ok(w.validation.revision > consumed, 'completion did not advance the revision cursor');
    assert.ok((w.waitStats.endedAt - w.waitStats.registeredAt) < 4000, 'the wait was not woken promptly');
  } finally { await f.c.close(); }
});

test('a wait wakes even when the parent sends a revision ahead of the real one', async () => {
  // The r11 run: the parent sent after_revision 8 while the finished run was also revision 8,
  // so a strictly-greater comparison dropped the batch and the wait slept to its timeout with
  // every executor done. Sending a cursor beyond the real revision must not blind the wait.
  const f = fixture();
  try {
    const ahead = f.view.validation.revision + 4;
    const pending = f.c.waitRoot(parent, f.view.runId, {timeoutMs: 8000, after_revision: ahead});
    f.leaf.resolve();
    const w = await pending;
    assert.equal(w.waitReason, 'validation-required', 'an ahead cursor suppressed the completion');
    assert.equal(w.validation.ready, true);
  } finally { await f.c.close(); }
});

test('completion alone advances the revision, so a repeated wait does not replay the same batch', async () => {
  const f = fixture();
  try {
    const pending = f.c.waitRoot(parent, f.view.runId, {timeoutMs: 8000, after_revision: f.view.validation.revision});
    f.leaf.resolve();
    const first = await pending;
    const again = await f.c.waitRoot(parent, f.view.runId, {timeoutMs: 150, after_revision: first.validation.revision});
    assert.equal(again.waitReason, 'timeout', 'the same batch was announced twice');
  } finally { await f.c.close(); }
});

test('rework after a completion still moves the cursor for the next batch', async () => {
  const f = fixture();
  try {
    const pending = f.c.waitRoot(parent, f.view.runId, {timeoutMs: 8000, after_revision: f.view.validation.revision});
    f.leaf.resolve();
    const first = await pending;
    const revision = first.validation.revision;
    const next = f.c.require(parent, f.view.runId);
    const bAgent = [...next.jobs.values()].find(j => j.role === 'B').sessionId;
    const before = next.workRevision;
    f.c.rework(next, bAgent, 'fix the failing case', revision);
    assert.ok(next.workRevision > before, 'rework did not advance the revision');
  } finally { await f.c.close(); }
});
